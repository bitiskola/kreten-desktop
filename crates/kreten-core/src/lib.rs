//! Local-only KRÉTA mobile sessions, encrypted cache, and change notifications.
//! Protocol adapted from Firka (QwIT Development) and KRETEN (micr0softstore),
//! with Firka-derived protocol code under CC BY-NC-SA 4.0. See docs/UPSTREAM.md
//! for attribution and the separate rights status of KRETEN's visual assets.
mod api;
mod auth;
mod error;
mod model;
mod schools;
mod storage;
mod sync;

pub use auth::{validate_institution, LoginAttempt, REDIRECT_URI};
pub use error::{Error, Result};
pub use model::{Account, Attachment, BankAccountUpdate, Notification, RefreshOutcome, School, Settings, Snapshot};

use api::Api;
use auth::{jwt_claims, PendingLogin, CLIENT_ID};
use chrono::{NaiveDate, Utc};
use model::{Cache, State, StoredAccount, Tokens};
use reqwest::Method;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, path::Path};
use storage::Storage;

/// Own one Core per desktop process, behind an async Mutex. All token rotation,
/// persistence, and mutations are serialized by &mut self. No tokens enter IPC.
pub struct Core {
    storage: Storage,
    state: State,
    api: Api,
    pending: Option<PendingLogin>,
    offline: bool,
    school_search_cache: BTreeMap<String, (i64, Vec<School>)>,
}

impl Core {
    pub fn open(directory: impl AsRef<Path>) -> Result<Self> {
        let storage = Storage::open(directory)?;
        let state = storage.read()?;
        Ok(Self {
            storage,
            state,
            api: Api::new()?,
            pending: None,
            offline: true,
            school_search_cache: BTreeMap::new(),
        })
    }

    pub fn snapshot(&self) -> Snapshot {
        let account = self.selected().ok();
        let cache = account.map(|a| &a.cache);
        Snapshot {
            accounts: self.state.accounts.iter().map(|a| a.account.clone()).collect(),
            active_account_id: self.state.active_account_id.clone(),
            data: cache.map(|c| c.data.clone()).unwrap_or_default(),
            last_synced_at: cache.and_then(|c| c.last_synced_at.clone()),
            offline: self.offline,
            errors: cache.map(|c| c.errors.clone()).unwrap_or_default(),
            settings: self.state.settings.clone(),
            notifications: self.state.notifications.clone(),
            completed_homework: cache.map(|c| c.completed_homework.clone()).unwrap_or_default(),
            storage_mode: self.storage.mode.clone(),
        }
    }

    pub fn begin_login(&mut self, username: Option<&str>, institution: Option<&str>) -> Result<LoginAttempt> {
        let (pending, attempt) = PendingLogin::new(&self.api.idp, username, institution.filter(|v| !v.is_empty()))?;
        self.pending = Some(pending);
        Ok(attempt)
    }

    pub fn cancel_login(&mut self) {
        self.pending = None;
    }

    pub fn cancel_login_attempt(&mut self, id: &str) {
        if self.pending.as_ref().is_some_and(|pending| pending.id == id) {
            self.pending = None;
        }
    }

    pub async fn complete_login(&mut self, attempt_id: &str, redirect: &str) -> Result<Snapshot> {
        if !self.pending.as_ref().is_some_and(|pending| pending.id == attempt_id) {
            return Err(Error::Login);
        }
        let pending = self.pending.take().ok_or(Error::Login)?;
        let code = pending.code(attempt_id, redirect)?;
        let token = self.api.token(&[
            ("code", &code),
            ("code_verifier", &pending.verifier),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", CLIENT_ID),
            ("grant_type", "authorization_code"),
        ]).await?;
        let claims = jwt_claims(token.get("id_token").and_then(Value::as_str).ok_or(Error::Response)?)?;
        if claims.get("nonce").and_then(Value::as_str) != Some(pending.nonce.as_str()) {
            return Err(Error::Login);
        }
        if let Some(audience) = claims.get("aud") {
            if audience.as_str() != Some(CLIENT_ID) && !audience.as_array().is_some_and(|a| a.iter().any(|v| v.as_str() == Some(CLIENT_ID))) {
                return Err(Error::Login);
            }
        }
        let institution = validate_institution(&claim(&claims, "kreta:institute_code")?)?;
        let username = claim(&claims, "kreta:user_name")?;
        let user_id = claim(&claims, "kreta:institute_user_id")?;
        let student_id = claims.get("kreta:student_id").map(value_text).unwrap_or_else(|| user_id.clone());
        let id = format!("{:x}", Sha256::digest(format!("{institution}\0{user_id}\0{student_id}")));
        let account = Account {
            id: id.clone(),
            name: claims.get("name").map(value_text).unwrap_or_else(|| username.clone()),
            institution_name: institution.clone(),
            institution_code: institution,
            username,
        };
        let tokens = token_values(&token, None)?;
        if let Some(previous) = self.state.accounts.iter_mut().find(|a| a.account.id == id) {
            previous.tokens = tokens;
        } else {
            self.state.accounts.push(StoredAccount { account, tokens, cache: Cache::default() });
        }
        self.state.active_account_id = Some(id);
        self.save()?;
        Ok(self.snapshot())
    }

    pub fn select_account(&mut self, id: &str) -> Result<Snapshot> {
        if !self.state.accounts.iter().any(|a| a.account.id == id) {
            return Err(Error::NoAccount);
        }
        let mut state = self.state.clone();
        state.active_account_id = Some(id.into());
        self.commit(state)?;
        self.offline = true;
        Ok(self.snapshot())
    }

    pub fn logout(&mut self, id: &str) -> Result<Snapshot> {
        let mut state = self.state.clone();
        state.accounts.retain(|a| a.account.id != id);
        state.notifications.retain(|n| n.account_id != id);
        if state.active_account_id.as_deref() == Some(id) {
            state.active_account_id = state.accounts.first().map(|a| a.account.id.clone());
        }
        self.commit(state)?;
        Ok(self.snapshot())
    }

    pub fn update_settings(&mut self, mut settings: Settings) -> Result<Snapshot> {
        settings.poll_interval_minutes = settings.poll_interval_minutes.clamp(1, 60);
        settings.bell_offset_minutes = settings.bell_offset_minutes.clamp(-30, 30);
        settings.title_weight = settings.title_weight.clamp(400, 800);
        if !["hu", "en", "de"].contains(&settings.language.as_str()) {
            return Err(Error::Invalid("nyelv"));
        }
        if !["left", "right"].contains(&settings.sidebar_side.as_str()) {
            return Err(Error::Invalid("oldalsáv"));
        }
        if !["system", "serif", "rounded"].contains(&settings.title_font.as_str()) {
            return Err(Error::Invalid("betűtípus"));
        }
        for color in [&settings.wallpaper_color1, &settings.wallpaper_color2] {
            if color.len() != 7 || !color.starts_with('#') || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit) {
                return Err(Error::Invalid("háttérszín"));
            }
        }
        if settings.grade_thresholds.len() != 4
            || settings.grade_thresholds.iter().any(|t| !t.is_finite() || !(1.0..=5.0).contains(t))
            || settings.grade_thresholds.windows(2).any(|pair| pair[0] >= pair[1]) {
            return Err(Error::Invalid("jegyhatárok"));
        }
        let pages = ["timetable", "grades", "statistics", "progress", "homework", "absences", "messages", "notes", "consultations", "lep", "profile", "notifications"];
        if settings.hidden_nav.len() > pages.len() || settings.hidden_nav.iter().any(|page| !pages.contains(&page.as_str())) {
            return Err(Error::Invalid("navigáció"));
        }
        if !["dark", "light", "system"].contains(&settings.theme.as_str()) {
            return Err(Error::Invalid("téma"));
        }
        if !["glass", "pixel", "hyperos", "material"].contains(&settings.ui_style.as_str()) {
            return Err(Error::Invalid("felület stílusa"));
        }
        if settings.palette.len() > 40 {
            return Err(Error::Invalid("színpaletta"));
        }
        if settings.muted_subjects.len() > 200 || settings.muted_subjects.iter().any(|s| s.len() > 200) {
            return Err(Error::Invalid("tantárgyak"));
        }
        let allowed = ["grades", "homework", "tests", "absences", "timetable", "notes", "notices", "messagesInbox"];
        if settings.notification_categories.iter().any(|v| !allowed.contains(&v.as_str())) || settings.notification_categories.len() > allowed.len() {
            return Err(Error::Invalid("értesítési kategória"));
        }
        let mut state = self.state.clone();
        state.settings = settings;
        self.commit(state)?;
        Ok(self.snapshot())
    }

    pub fn complete_homework(&mut self, id: &str, complete: bool) -> Result<Snapshot> {
        if id.is_empty() || id.len() > 256 {
            return Err(Error::Invalid("házi feladat"));
        }
        let mut state = self.state.clone();
        let completed = &mut state
            .accounts
            .iter_mut()
            .find(|a| Some(&a.account.id) == state.active_account_id.as_ref())
            .ok_or(Error::NoAccount)?
            .cache
            .completed_homework;
        if complete {
            completed.insert(id.into());
        } else {
            completed.remove(id);
        }
        self.commit(state)?;
        Ok(self.snapshot())
    }

    pub fn dismiss_notification(&mut self, id: &str) -> Result<Snapshot> {
        let mut state = self.state.clone();
        state.notifications.retain(|n| n.id != id);
        self.commit(state)?;
        Ok(self.snapshot())
    }

    pub async fn schools(&mut self) -> Result<Vec<School>> {
        let response = self
            .api
            .client
            .get("https://kretaglobalapi.e-kreta.hu/intezmenyek/kreta/publikus")
            .header("accept", "application/json")
            .timeout(std::time::Duration::from_secs(8))
            .send()
            .await;
        let result = match response {
            Ok(response) => api::json(response).await,
            Err(_) => Err(Error::Network),
        };
        match result.and_then(normalize_schools) {
            Ok(schools) => {
                self.state.schools = schools;
                self.save()?;
                Ok(self.state.schools.clone())
            }
            Err(_) if !self.state.schools.is_empty() => Ok(self.state.schools.clone()),
            Err(_) => Ok(Vec::new()),
        }
    }

    pub async fn timetable(&mut self, from: &str, to: &str) -> Result<Value> {
        validate_range(from, to, 42)?;
        self.get_selected(&format!("/ellenorzo/v3/sajat/OrarendElemek?datumTol={from}&datumIg={to}"), false).await
    }

    pub async fn message_detail(&mut self, id: &str) -> Result<Value> {
        api::id(id)?;
        let result = self.get_selected(&format!("/api/v1/kommunikacio/postaladaelemek/{id}"), true).await;
        match result {
            Ok(value) => {
                self.selected_mut()?.cache.message_details.insert(id.into(), value.clone());
                self.save()?;
                Ok(value)
            }
            Err(Error::Network) => self.selected()?.cache.message_details.get(id).cloned().ok_or(Error::Network),
            Err(error) => Err(error),
        }
    }

    pub async fn consulting_hour(&mut self, id: &str) -> Result<Value> {
        self.get_selected(&format!("/ellenorzo/v3/sajat/Fogadoorak/{}", api::id(id)?), false).await
    }

    pub async fn lep_permission(&mut self, event_id: &str, is_permitted: bool) -> Result<()> {
        api::id(event_id)?;
        self.change_selected(
            Method::POST,
            "/ellenorzo/v3/Lep/Eloadasok/GondviseloEngedelyezes",
            Some(json!({"eventId": event_id, "isPermitted": is_permitted.to_string()})),
            false,
        ).await
    }

    pub async fn update_contact(&mut self, email: &str, phone: &str) -> Result<()> {
        if email.len() > 254 || phone.len() > 64 {
            return Err(Error::Invalid("elérhetőség"));
        }
        self.change_selected(
            Method::POST,
            "/ellenorzo/v3/sajat/Elerhetoseg",
            Some(json!({"email": email, "telefonszam": phone})),
            true,
        ).await
    }

    pub async fn update_bank_account(&mut self, bank: BankAccountUpdate) -> Result<()> {
        if bank.account_number.len() > 64
            || bank.owner_name.len() > 200
            || bank.bank_name.len() > 200
            || bank.account_number.trim().is_empty()
            || bank.owner_name.trim().is_empty()
            || bank.bank_name.trim().is_empty()
        {
            return Err(Error::Invalid("bankszámla"));
        }
        self.check_bank_access().await?;
        self.change_selected(
            Method::POST,
            "/ellenorzo/v3/sajat/Bankszamla",
            Some(json!({
                "BankszamlaSzam": bank.account_number,
                "BankszamlaTulajdonosNeve": bank.owner_name,
                "BankszamlaTulajdonosTipusId": bank.owner_type_id,
                "SzamlavezetoBank": bank.bank_name
            })),
            false,
        ).await
    }

    pub async fn delete_bank_account(&mut self) -> Result<()> {
        self.check_bank_access().await?;
        self.change_selected(Method::DELETE, "/ellenorzo/v3/sajat/Bankszamla", None, false).await
    }

    async fn check_bank_access(&mut self) -> Result<()> {
        let student = self.get_selected("/ellenorzo/v3/sajat/TanuloAdatlap", false).await?;
        if student.pointer("/Bankszamla/IsReadOnly").and_then(Value::as_bool) == Some(true) {
            return Err(Error::Http(403));
        }
        Ok(())
    }

    fn selected(&self) -> Result<&StoredAccount> {
        self.state.accounts.iter().find(|a| Some(&a.account.id) == self.state.active_account_id.as_ref()).ok_or(Error::NoAccount)
    }

    fn selected_mut(&mut self) -> Result<&mut StoredAccount> {
        self.state.accounts.iter_mut().find(|a| Some(&a.account.id) == self.state.active_account_id.as_ref()).ok_or(Error::NoAccount)
    }

    fn save(&self) -> Result<()> {
        self.storage.write(&self.state)
    }

    fn commit(&mut self, state: State) -> Result<()> {
        self.storage.write(&state)?;
        self.state = state;
        Ok(())
    }

    async fn ensure_token(&mut self, force: bool) -> Result<String> {
        let id = self.selected()?.account.id.clone();
        self.ensure_token_for(&id, force).await
    }

    pub(crate) async fn ensure_token_for(&mut self, account_id: &str, force: bool) -> Result<String> {
        let account = self.state.accounts.iter().find(|a| a.account.id == account_id).ok_or(Error::NoAccount)?;
        if !force && account.tokens.expires_at > Utc::now().timestamp() + 60 {
            return Ok(account.tokens.access_token.clone());
        }
        let institution = account.account.institution_code.clone();
        let old = account.tokens.clone();
        let token = self.api.token(&[
            ("institute_code", &institution),
            ("refresh_token", &old.refresh_token),
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT_ID),
        ]).await?;
        let tokens = token_values(&token, Some(&old))?;
        let access_token = tokens.access_token.clone();
        self.state.accounts.iter_mut().find(|a| a.account.id == account_id).ok_or(Error::NoAccount)?.tokens = tokens;
        // Rotated refresh tokens must reach disk before any API call can fail.
        self.save()?;
        Ok(access_token)
    }

    async fn get_selected(&mut self, path: &str, admin: bool) -> Result<Value> {
        let token = self.ensure_token(false).await?;
        let url = if admin {
            self.api.admin_url(path)
        } else {
            self.api.school_url(&self.selected()?.account.institution_code, path)
        };
        match self.api.get(&url, &token).await {
            Err(Error::Authentication) => {
                let fresh = self.ensure_token(true).await?;
                self.api.get(&url, &fresh).await
            }
            result => result,
        }
    }

    async fn change_selected(&mut self, method: Method, path: &str, body: Option<Value>, form: bool) -> Result<()> {
        let token = self.ensure_token(false).await?;
        let url = self.api.school_url(&self.selected()?.account.institution_code, path);
        match self.api.change(method.clone(), &url, &token, body.as_ref(), form).await {
            Err(Error::Authentication) => {
                let fresh = self.ensure_token(true).await?;
                self.api.change(method, &url, &fresh, body.as_ref(), form).await
            }
            result => result,
        }
    }
}

fn value_text(value: &Value) -> String {
    value.as_str().map(String::from).unwrap_or_else(|| value.to_string())
}

fn claim(claims: &Value, key: &str) -> Result<String> {
    claims.get(key).filter(|v| v.is_string() || v.is_number()).map(value_text).filter(|v| !v.is_empty()).ok_or(Error::Response)
}

fn token_values(value: &Value, old: Option<&Tokens>) -> Result<Tokens> {
    let access_token = value.get("access_token").and_then(Value::as_str).filter(|v| !v.is_empty()).ok_or(Error::Response)?.to_owned();
    let refresh_token = value.get("refresh_token").and_then(Value::as_str).filter(|v| !v.is_empty()).map(String::from)
        .or_else(|| old.map(|v| v.refresh_token.clone())).ok_or(Error::Response)?;
    let expires = value.get("expires_in").and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|v| v.parse().ok()))).ok_or(Error::Response)?;
    if !(1..=7 * 24 * 3600).contains(&expires) {
        return Err(Error::Response);
    }
    Ok(Tokens { access_token, refresh_token, expires_at: Utc::now().timestamp() + expires })
}

fn validate_range(from: &str, to: &str, maximum_days: i64) -> Result<()> {
    let start = NaiveDate::parse_from_str(from, "%Y-%m-%d").map_err(|_| Error::Invalid("dátum"))?;
    let end = NaiveDate::parse_from_str(to, "%Y-%m-%d").map_err(|_| Error::Invalid("dátum"))?;
    if from.len() != 10 || to.len() != 10 || !(0..=maximum_days).contains(&(end - start).num_days()) {
        return Err(Error::Invalid("dátumtartomány"));
    }
    Ok(())
}

fn normalize_schools(payload: Value) -> Result<Vec<School>> {
    let rows = payload.as_array().or_else(|| ["institutes", "Institutes", "items"].iter().find_map(|key| payload.get(key).and_then(Value::as_array))).ok_or(Error::Response)?;
    let mut schools = BTreeMap::new();
    for row in rows {
        let code = ["instituteCode", "InstituteCode", "code"].iter().find_map(|key| row.get(key).and_then(Value::as_str));
        if let Some(Ok(code)) = code.map(validate_institution) {
            let name = row.get("name").or_else(|| row.get("Name")).and_then(Value::as_str).unwrap_or(&code).to_owned();
            let city = row.get("city").or_else(|| row.get("City")).and_then(Value::as_str).unwrap_or_default().to_owned();
            schools.insert(code.clone(), School { code, name, city });
        }
    }
    if schools.is_empty() {
        return Err(Error::Response);
    }
    let mut schools: Vec<_> = schools.into_values().collect();
    schools.sort_by_key(|s| s.name.to_lowercase());
    Ok(schools)
}

#[cfg(test)]
mod integration_tests;
