use crate::{
    auth::random_token, model::Cache, Core, Error, Notification, RefreshOutcome, Result, Settings,
};
use chrono::{Datelike, Duration, Utc};
use futures_util::{stream, StreamExt};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

const PREFIX: &str = "/ellenorzo/v3/sajat";

impl Core {
    pub async fn refresh(&mut self) -> Result<RefreshOutcome> {
        let notifications = match self.state.active_account_id.clone() {
            Some(id) => self.refresh_account(&id).await?,
            None => Vec::new(),
        };
        Ok(RefreshOutcome {
            snapshot: self.snapshot(),
            notifications,
        })
    }

    /// Poll every saved account without ever changing the selected account on disk.
    pub async fn refresh_all(&mut self) -> Result<RefreshOutcome> {
        let ids: Vec<_> = self
            .state
            .accounts
            .iter()
            .map(|a| a.account.id.clone())
            .collect();
        let mut notifications = Vec::new();
        for id in ids {
            notifications.extend(self.refresh_account(&id).await?);
        }
        Ok(RefreshOutcome {
            snapshot: self.snapshot(),
            notifications,
        })
    }

    async fn refresh_account(&mut self, id: &str) -> Result<Vec<Notification>> {
        let selected = self.state.active_account_id.as_deref() == Some(id);
        let token = match self.ensure_token_for(id, false).await {
            Ok(token) => token,
            Err(error) => {
                let account = self
                    .state
                    .accounts
                    .iter_mut()
                    .find(|a| a.account.id == id)
                    .ok_or(Error::NoAccount)?;
                account
                    .cache
                    .errors
                    .insert("connection".into(), error.to_string());
                if selected {
                    self.offline = true;
                }
                self.save()?;
                return Ok(Vec::new());
            }
        };
        let institution = self
            .state
            .accounts
            .iter()
            .find(|a| a.account.id == id)
            .ok_or(Error::NoAccount)?
            .account
            .institution_code
            .clone();
        let today = Utc::now()
            .with_timezone(&chrono_tz::Europe::Budapest)
            .date_naive();
        let monday = today - Duration::days(today.weekday().num_days_from_monday().into());
        let timetable_from = (monday - Duration::days(7)).to_string();
        let timetable_to = (monday + Duration::days(20)).to_string();
        let year = today.year() - i32::from(today.month() < 9);
        let school_start = format!("{year}-09-01");
        let mut requests: Vec<(String, String)> = Vec::new();
        for (key, route) in [
            ("student", "TanuloAdatlap"),
            ("grades", "Ertekelesek"),
            ("absences", "Mulasztasok"),
            ("groups", "OsztalyCsoportok"),
            ("schoolYear", "Intezmenyek/TanevRendjeElemek"),
            ("consultations", "Fogadoorak"),
            ("guardian", "GondviseloAdatlap"),
            ("capabilities", "Intezmenyek"),
        ] {
            requests.push((
                key.into(),
                self.api
                    .school_url(&institution, &format!("{PREFIX}/{route}")),
            ));
        }
        for (key, route) in [("notices", "FaliujsagElemek"), ("notes", "Feljegyzesek")] {
            requests.push((
                key.into(),
                self.api.school_url(
                    &institution,
                    &format!("{PREFIX}/{route}?datumTol={school_start}"),
                ),
            ));
        }
        requests.push((
            "timetable".into(),
            self.api.school_url(
                &institution,
                &format!("{PREFIX}/OrarendElemek?datumTol={timetable_from}&datumIg={timetable_to}"),
            ),
        ));
        requests.push((
            "tests".into(),
            self.api.school_url(
                &institution,
                &format!("{PREFIX}/BejelentettSzamonkeresek?datumTol={school_start}"),
            ),
        ));
        requests.push((
            "lep".into(),
            self.api
                .school_url(&institution, "/ellenorzo/v3/Lep/Eloadasok"),
        ));
        requests.push((
            "dktSubjects".into(),
            self.api
                .school_url(&institution, "/dktapi/intezmenyek/munkaterek/tanulok"),
        ));
        for (key, folder) in [
            ("messagesInbox", "beerkezett"),
            ("messagesSent", "elkuldott"),
            ("messagesDeleted", "torolt"),
        ] {
            requests.push((
                key.into(),
                self.api
                    .admin_url(&format!("/api/v1/kommunikacio/postaladaelemek/{folder}")),
            ));
        }
        // Query full school-year homework (accepted without datumIg by standard KRÉTA instances).
        requests.push((
            "homeworkSchoolYear".into(),
            self.api.school_url(
                &institution,
                &format!("{PREFIX}/HaziFeladatok?datumTol={school_start}"),
            ),
        ));
        // Also add bounded chunks as backup for instances requiring <= 21 days window.
        let mut from = today - Duration::days(30);
        let end = today + Duration::days(30);
        let mut chunk = 0;
        while from <= end {
            let to = (from + Duration::days(21)).min(end);
            requests.push((
                format!("homeworkChunk{chunk}"),
                self.api.school_url(
                    &institution,
                    &format!("{PREFIX}/HaziFeladatok?datumTol={from}&datumIg={to}"),
                ),
            ));
            if to == end {
                break;
            }
            from = to;
            chunk += 1;
        }
        let api = &self.api;
        let mut results: Vec<_> = stream::iter(requests.clone())
            .map(|(key, url)| {
                let token = token.clone();
                async move { (key, api.get(&url, &token).await) }
            })
            .buffer_unordered(4)
            .collect()
            .await;
        if results
            .iter()
            .any(|(_, r)| matches!(r, Err(Error::Authentication)))
        {
            if let Ok(token) = self.ensure_token_for(id, true).await {
                for (key, result) in &mut results {
                    if matches!(result, Err(Error::Authentication)) {
                        let url = &requests.iter().find(|(k, _)| k == key).unwrap().1;
                        *result = self.api.get(url, &token).await;
                    }
                }
            }
        }
        // Class averages need the groups' study-task IDs, so they run after the batch.
        let groups = results
            .iter()
            .find(|(key, _)| key == "groups")
            .and_then(|(_, r)| r.as_ref().ok())
            .cloned();
        let visible = class_averages_visible(
            results
                .iter()
                .filter(|(key, _)| key == "student" || key == "capabilities")
                .filter_map(|(_, r)| r.as_ref().ok()),
        );
        if let Some(groups) = groups {
            if let Some(result) = self
                .fetch_class_averages(id, &institution, &groups, visible)
                .await
            {
                results.push(("classAverages".into(), result));
            }
        }
        let mut homework = Vec::new();
        let mut homework_failure = None;
        results.retain_mut(|(key, result)| {
            if !key.starts_with("homework") {
                return true;
            }
            match std::mem::replace(result, Ok(Value::Null)) {
                Ok(Value::Array(items)) => homework.extend(items),
                Ok(_) => {
                    if homework_failure.is_none() {
                        homework_failure = Some(Error::Response);
                    }
                }
                Err(error) => {
                    if homework_failure.is_none() {
                        homework_failure = Some(error);
                    }
                }
            }
            false
        });
        let mut seen = BTreeSet::new();
        homework.retain(|row| item_id(row).is_none_or(|id| seen.insert(id)));
        let homework_result = if !homework.is_empty() {
            Ok(Value::Array(homework))
        } else {
            homework_failure.map_or(Ok(Value::Array(homework)), Err)
        };
        results.push(("homework".into(), homework_result));
        let mut notifications = Vec::new();
        let account = self
            .state
            .accounts
            .iter_mut()
            .find(|a| a.account.id == id)
            .ok_or(Error::NoAccount)?;
        let mut success = 0;
        account.cache.errors.clear();
        for (key, result) in results {
            match result.and_then(|v| validate_bucket(&key, v)) {
                Ok(value) => {
                    success += 1;
                    let range = (key == "timetable")
                        .then_some((timetable_from.as_str(), timetable_to.as_str()));
                    if let Some(notification) = diff(
                        &mut account.cache,
                        &key,
                        &value,
                        id,
                        &account.account.name,
                        &self.state.settings,
                        range,
                    ) {
                        notifications.push(notification);
                    }
                    if key == "student" {
                        if let Some(name) = value.get("Nev").and_then(Value::as_str) {
                            account.account.name = name.into();
                        }
                        if let Some(name) = value
                            .get("IntezmenyNev")
                            .or_else(|| value.pointer("/Intezmeny/TeljesNev"))
                            .and_then(Value::as_str)
                        {
                            account.account.institution_name = name.into();
                        }
                    }
                    account.cache.data.insert(key, value);
                }
                Err(Error::Http(403)) if key == "consultations" || key == "guardian" => {
                    // Suppress expected 403 on guardian-only endpoints for student accounts.
                    let fallback = if key == "consultations" {
                        Value::Array(Vec::new())
                    } else {
                        Value::Null
                    };
                    account.cache.data.insert(key, fallback);
                }
                Err(error) => {
                    account.cache.errors.insert(key, error.to_string());
                }
            }
        }
        if success > 0 {
            account.cache.last_synced_at = Some(Utc::now().to_rfc3339());
        }
        if selected {
            self.offline = success == 0;
        }
        for notification in &notifications {
            self.state.notifications.insert(0, notification.clone());
        }
        self.state.notifications.truncate(100);
        self.save()?;
        Ok(notifications)
    }
}

impl Core {
    /// Fetch class averages for the student's study tasks.
    ///
    /// Returns `None` when KRÉTA cannot provide them (the school hid class
    /// averages or the server rejects every query form with an HTTP status).
    /// The previous cache is kept and no sync error is shown in that case,
    /// because the user cannot fix a server-side refusal.
    async fn fetch_class_averages(
        &self,
        id: &str,
        institution: &str,
        groups: &Value,
        visible: Option<bool>,
    ) -> Option<Result<Value>> {
        if visible == Some(false) {
            return Some(Ok(Value::Array(Vec::new())));
        }
        let uids = study_task_uids(groups);
        if uids.is_empty() {
            return Some(Ok(Value::Array(Vec::new())));
        }
        let base = self.api.school_url(
            institution,
            &format!("{PREFIX}/Ertekelesek/Atlagok/OsztalyAtlagok"),
        );
        let mut rows = Vec::new();
        let mut any_success = false;
        let mut hard_failure = None;
        for uid in uids {
            for url in class_average_urls(&base, &uid) {
                // Re-read the token: a 401 retry above may have rotated it.
                let token = self
                    .state
                    .accounts
                    .iter()
                    .find(|a| a.account.id == id)?
                    .tokens
                    .access_token
                    .clone();
                match self.api.get(&url, &token).await {
                    Ok(Value::Array(items)) => {
                        any_success = true;
                        rows.extend(items);
                        break;
                    }
                    // Wrong query form or unsupported study task: try the next form.
                    Ok(_) | Err(Error::Http(_)) | Err(Error::Response) => {}
                    Err(error) => {
                        hard_failure = Some(error);
                        break;
                    }
                }
            }
            if hard_failure.is_some() {
                break;
            }
        }
        if any_success {
            let mut seen = BTreeSet::new();
            rows.retain(|row| {
                row.pointer("/Tantargy/Uid")
                    .or_else(|| row.get("Uid"))
                    .map(crate::value_text)
                    .is_none_or(|key| seen.insert(key))
            });
            return Some(Ok(Value::Array(rows)));
        }
        hard_failure.map(Err)
    }
}

/// `IsOsztalyAtlagMegjeleniteseEllenorzoben` from the student profile or institution.
fn class_averages_visible<'a>(sources: impl Iterator<Item = &'a Value>) -> Option<bool> {
    sources
        .filter_map(|value| {
            value
                .pointer("/Intezmeny/TestreszabasBeallitasok/IsOsztalyAtlagMegjeleniteseEllenorzoben")
                .or_else(|| {
                    value.pointer("/TestreszabasBeallitasok/IsOsztalyAtlagMegjeleniteseEllenorzoben")
                })
                .and_then(Value::as_bool)
        })
        .next()
}

/// Unique study-task UIDs, the student's active class first.
fn study_task_uids(groups: &Value) -> Vec<String> {
    let mut groups: Vec<&Value> = groups.as_array().map(|g| g.iter().collect()).unwrap_or_default();
    let rank = |g: &Value| {
        let inactive = g.get("IsAktiv").and_then(Value::as_bool) == Some(false);
        let not_class = g.get("Tipus").and_then(Value::as_str) != Some("Osztaly");
        (inactive, not_class)
    };
    groups.sort_by_key(|g| rank(g));
    let mut seen = BTreeSet::new();
    groups
        .into_iter()
        .filter_map(|g| g.pointer("/OktatasNevelesiFeladat/Uid"))
        .map(crate::value_text)
        .filter(|uid| !uid.is_empty() && seen.insert(uid.clone()))
        .collect()
}

/// Query forms seen in KRÉTA clients: Firka sends the UID truncated at the first
/// comma (twice), older clients send the full UID once. Servers answer HTTP 500
/// to a form they do not accept, so each is tried in turn.
fn class_average_urls(base: &str, uid: &str) -> Vec<String> {
    let short = uid.split(',').next().unwrap_or_default();
    let mut forms: Vec<Vec<&str>> = Vec::new();
    if !short.is_empty() {
        forms.push(vec![short]);
        forms.push(vec![short, short]);
    }
    if uid != short {
        forms.push(vec![uid]);
    }
    forms
        .into_iter()
        .filter_map(|values| {
            let mut url = url::Url::parse(base).ok()?;
            {
                let mut query = url.query_pairs_mut();
                for value in values {
                    query.append_pair("oktatasiNevelesiFeladatUid", value);
                }
            }
            Some(url.into())
        })
        .collect()
}

fn validate_bucket(key: &str, value: Value) -> Result<Value> {
    let object = matches!(key, "student" | "guardian" | "capabilities");
    if (object && value.is_object())
        || (!object
            && value
                .as_array()
                .is_some_and(|a| a.iter().all(Value::is_object)))
    {
        Ok(value)
    } else {
        Err(Error::Response)
    }
}

fn item_id(value: &Value) -> Option<String> {
    ["Uid", "uid", "azonosito", "Id", "id"]
        .iter()
        .find_map(|key| value.get(key))
        .filter(|v| !v.is_null())
        .map(crate::value_text)
}

fn diff(
    cache: &mut Cache,
    key: &str,
    value: &Value,
    account_id: &str,
    account_name: &str,
    settings: &Settings,
    range: Option<(&str, &str)>,
) -> Option<Notification> {
    let title = match key {
        "grades" => "Új vagy módosult értékelés",
        "homework" => "Házi feladat frissült",
        "tests" => "Bejelentett dolgozat frissült",
        "absences" => "Mulasztás frissült",
        "notes" | "notices" => "Új iskolai közlemény",
        "messagesInbox" => "Új üzenet",
        "timetable" => "Órarendváltozás",
        _ => return None,
    };
    let old = cache.fingerprints.get(key);
    let rows = value.as_array()?;
    let mut fingerprints = BTreeMap::new();
    let mut count = 0;
    let today = Utc::now()
        .with_timezone(&chrono_tz::Europe::Budapest)
        .date_naive()
        .to_string();
    for row in rows {
        let Some(id) = item_id(row) else {
            continue;
        };
        let fingerprint = format!("{:x}", Sha256::digest(serde_json::to_vec(row).ok()?));
        if let Some(previous) = old {
            let changed = previous.get(&id).is_some_and(|old| old != &fingerprint);
            let new = !previous.contains_key(&id);
            let day = lesson_day(row);
            let is_future_lesson = day.is_some_and(|day| day >= today.as_str());
            let inside_previous_window = day.is_some_and(|day| {
                cache
                    .timetable_range
                    .as_ref()
                    .is_some_and(|(from, to)| day >= from.as_str() && day <= to.as_str())
            });
            // Rolling into a new week is silent; inserted lessons in the previously
            // observed window and edits/cancellations to future lessons are changes.
            let should_notify = match key {
                "timetable" => is_future_lesson && (changed || (new && inside_previous_window)),
                "messagesInbox" => new, // Read/unread flags are not new mail.
                _ => changed || new,
            };
            let muted = matches!(key, "grades" | "homework" | "tests")
                && row
                    .pointer("/Tantargy/Nev")
                    .or_else(|| row.get("TantargyNeve"))
                    .and_then(Value::as_str)
                    .is_some_and(|subject| settings.muted_subjects.iter().any(|s| s == subject));
            if should_notify && !muted {
                count += 1;
            }
        }
        fingerprints.insert(id, fingerprint);
    }
    if key == "timetable" {
        if let (Some((from, to)), Some(previous_rows)) =
            (range, cache.data.get(key).and_then(Value::as_array))
        {
            for previous in previous_rows {
                if item_id(previous).is_some_and(|id| !fingerprints.contains_key(&id))
                    && lesson_day(previous)
                        .is_some_and(|day| day >= today.as_str() && day >= from && day <= to)
                {
                    count += 1;
                }
            }
        }
        cache.timetable_range = range.map(|(from, to)| (from.into(), to.into()));
    }
    cache.fingerprints.insert(key.into(), fingerprints);
    if count == 0
        || !settings
            .notification_categories
            .iter()
            .any(|category| category == key)
    {
        return None;
    }
    Some(Notification {
        id: random_token(),
        kind: key.into(),
        title: title.into(),
        body: if settings.private_grades && key == "grades" {
            "Új értékelés érkezett. Nyisd meg a KRETÉN Desktopot.".into()
        } else {
            format!("{account_name} · {count} új vagy módosult elem")
        },
        created_at: Utc::now().to_rfc3339(),
        account_id: account_id.into(),
    })
}

fn lesson_day(row: &Value) -> Option<&str> {
    row.get("KezdetIdopont")
        .or_else(|| row.get("Datum"))
        .and_then(Value::as_str)?
        .get(..10)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn first_sync_is_silent_changes_notify_once_and_persist_baseline() {
        let mut cache = Cache::default();
        assert!(diff(
            &mut cache,
            "grades",
            &json!([{"Uid":"1","SzamErtek":4}]),
            "a",
            "Student",
            &Settings::default(),
            None
        )
        .is_none());
        let changed = json!([{"Uid":"1","SzamErtek":5},{"Uid":"2","SzamErtek":3}]);
        let n = diff(
            &mut cache,
            "grades",
            &changed,
            "a",
            "Student",
            &Settings {
                private_grades: true,
                ..Settings::default()
            },
            None,
        )
        .unwrap();
        assert!(!n.body.contains("Student"));
        assert!(diff(
            &mut cache,
            "grades",
            &changed,
            "a",
            "Student",
            &Settings::default(),
            None
        )
        .is_none());
        let mut restored: Cache =
            serde_json::from_str(&serde_json::to_string(&cache).unwrap()).unwrap();
        assert!(diff(
            &mut restored,
            "grades",
            &changed,
            "a",
            "Student",
            &Settings::default(),
            None
        )
        .is_none());
    }
    #[test]
    fn adding_future_week_does_not_alert_but_cancellation_does() {
        let mut cache = Cache::default();
        let lesson = json!({"Uid":"a","KezdetIdopont":"2099-10-10T08:00:00","Elmaradt":false});
        assert!(diff(
            &mut cache,
            "timetable",
            &json!([lesson]),
            "a",
            "Student",
            &Settings::default(),
            Some(("2099-10-01", "2099-10-15"))
        )
        .is_none());
        let new_week = json!({"Uid":"b","KezdetIdopont":"2099-10-20T08:00:00"});
        assert!(diff(
            &mut cache,
            "timetable",
            &json!([lesson, new_week]),
            "a",
            "Student",
            &Settings::default(),
            Some(("2099-10-01", "2099-10-25"))
        )
        .is_none());
        let canceled = json!({"Uid":"a","KezdetIdopont":"2099-10-10T08:00:00","Elmaradt":true});
        assert!(diff(
            &mut cache,
            "timetable",
            &json!([canceled, new_week]),
            "a",
            "Student",
            &Settings::default(),
            Some(("2099-10-01", "2099-10-25"))
        )
        .is_some());
    }
    #[test]
    fn category_and_subject_mutes_still_advance_baseline() {
        let mut cache = Cache::default();
        let mut settings = Settings {
            muted_subjects: vec!["Matematika".into()],
            ..Settings::default()
        };
        diff(
            &mut cache,
            "grades",
            &json!([]),
            "a",
            "Student",
            &settings,
            None,
        );
        let next = json!([{"Uid":"g1","Tantargy":{"Nev":"Matematika"},"SzamErtek":5}]);
        assert!(diff(&mut cache, "grades", &next, "a", "Student", &settings, None).is_none());
        settings.muted_subjects.clear();
        assert!(diff(&mut cache, "grades", &next, "a", "Student", &settings, None).is_none());
        settings.notification_categories.clear();
        let edited = json!([{"Uid":"g1","Tantargy":{"Nev":"Matematika"},"SzamErtek":4}]);
        assert!(diff(&mut cache, "grades", &edited, "a", "Student", &settings, None).is_none());
        assert!(diff(
            &mut cache,
            "grades",
            &edited,
            "a",
            "Student",
            &Settings::default(),
            None
        )
        .is_none());
    }
    #[test]
    fn mailbox_read_status_change_does_not_notify() {
        let mut cache = Cache::default();
        diff(
            &mut cache,
            "messagesInbox",
            &json!([{"azonosito":1,"isElolvasva":false}]),
            "a",
            "Student",
            &Settings::default(),
            None,
        );
        assert!(diff(
            &mut cache,
            "messagesInbox",
            &json!([{"azonosito":1,"isElolvasva":true}]),
            "a",
            "Student",
            &Settings::default(),
            None
        )
        .is_none());
        assert!(diff(
            &mut cache,
            "messagesInbox",
            &json!([{"azonosito":1,"isElolvasva":true},{"azonosito":2,"isElolvasva":false}]),
            "a",
            "Student",
            &Settings::default(),
            None
        )
        .is_some());
    }
}
