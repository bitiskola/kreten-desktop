//! Synthetic-only contract tests; no school credentials or production traffic.
use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use wiremock::{
    matchers::{body_string_contains, header, method, path},
    Mock, MockServer, ResponseTemplate,
};

fn test_core(directory: &Path) -> Core {
    Core {
        storage: Storage::for_test(directory, [8; 32]),
        state: State::default(),
        api: Api::new().unwrap(),
        pending: None,
        offline: true,
        school_search_cache: BTreeMap::new(),
    }
}

fn add_account(core: &mut Core, id: &str, expired: bool) {
    core.state.accounts.push(StoredAccount {
        account: Account {
            id: id.into(),
            name: "Synthetic Student".into(),
            institution_code: "synthetic-school".into(),
            institution_name: "Synthetic School".into(),
            username: "synthetic-user".into(),
        },
        tokens: Tokens {
            access_token: "PRIVATE-ACCESS-MARKER".into(),
            refresh_token: "PRIVATE-REFRESH-MARKER".into(),
            expires_at: Utc::now().timestamp() + if expired { -10 } else { 3600 },
        },
        cache: Cache::default(),
    });
    core.state.active_account_id = Some(id.into());
}

#[tokio::test]
async fn oauth_sends_real_pkce_form_and_never_exposes_credentials_in_snapshot() {
    let temp = tempfile::tempdir().unwrap();
    let mut core = test_core(temp.path());
    let server = MockServer::start().await;
    core.api.idp = server.uri();
    let attempt = core.begin_login(None, Some("synthetic-school")).unwrap();
    let pending = core.pending.as_ref().unwrap();
    let verifier = pending.verifier.clone();
    let state = pending.state.clone();
    let claims = json!({"nonce":pending.nonce,"aud":CLIENT_ID,"kreta:institute_code":"synthetic-school","kreta:user_name":"synthetic-user","kreta:institute_user_id":"123"});
    let jwt = format!(
        "e30.{}.signature",
        URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap())
    );
    Mock::given(method("POST")).and(path("/connect/token"))
        .and(body_string_contains(format!("code_verifier={verifier}")))
        .and(body_string_contains("grant_type=authorization_code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id_token":jwt,"access_token":"PRIVATE-ACCESS-MARKER","refresh_token":"PRIVATE-REFRESH-MARKER","expires_in":3600})))
        .expect(1).mount(&server).await;
    let snapshot = core
        .complete_login(
            &attempt.id,
            &format!("{REDIRECT_URI}?state={state}&code=synthetic-code"),
        )
        .await
        .unwrap();
    assert_eq!(snapshot.accounts.len(), 1);
    assert_eq!(snapshot.accounts[0].institution_code, "synthetic-school");
    let public = serde_json::to_string(&snapshot).unwrap();
    assert!(!public.contains("PRIVATE-"));
    assert!(!public.contains("refresh_token"));
    assert!(core
        .complete_login(
            &attempt.id,
            &format!("{REDIRECT_URI}?state={state}&code=synthetic-code")
        )
        .await
        .is_err());
    assert!(
        !String::from_utf8_lossy(&std::fs::read(temp.path().join("store.enc")).unwrap())
            .contains("PRIVATE-")
    );
}

#[tokio::test]
async fn refresh_rotates_tokens_before_authenticated_request_and_restart() {
    let temp = tempfile::tempdir().unwrap();
    let mut core = test_core(temp.path());
    add_account(&mut core, "account-a", true);
    let server = MockServer::start().await;
    core.api.idp = server.uri();
    core.api.override_base = Some(server.uri());
    Mock::given(method("POST")).and(path("/connect/token"))
        .and(body_string_contains("institute_code=synthetic-school"))
        .and(body_string_contains("refresh_token=PRIVATE-REFRESH-MARKER"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"access_token":"ROTATED-ACCESS","refresh_token":"ROTATED-REFRESH","expires_in":3600})))
        .expect(1).mount(&server).await;
    Mock::given(method("GET"))
        .and(path("/ellenorzo/v3/sajat/OrarendElemek"))
        .and(header("authorization", "Bearer ROTATED-ACCESS"))
        .and(header("apikey", auth::API_KEY))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([])))
        .expect(1)
        .mount(&server)
        .await;
    assert_eq!(
        core.timetable("2026-10-12", "2026-10-18").await.unwrap(),
        json!([])
    );
    assert_eq!(
        core.storage.read().unwrap().accounts[0]
            .tokens
            .refresh_token,
        "ROTATED-REFRESH"
    );
}

#[tokio::test]
async fn inbox_uses_service_headers_and_offline_details_remain_local() {
    let temp = tempfile::tempdir().unwrap();
    let mut core = test_core(temp.path());
    add_account(&mut core, "account-a", false);
    let server = MockServer::start().await;
    core.api.override_base = Some(server.uri());
    Mock::given(method("GET"))
        .and(path("/api/v1/kommunikacio/postaladaelemek/123"))
        .and(header("user-agent", "KRETENDesktop/0.1"))
        .and(header("X-Uzenet-Lokalizacio", "hu-HU"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"uzenet":{"targy":"Synthetic message"}})),
        )
        .expect(1)
        .mount(&server)
        .await;
    let value = core.message_detail("123").await.unwrap();
    assert_eq!(value["uzenet"]["targy"], "Synthetic message");
    let requests = server.received_requests().await.unwrap();
    assert!(!requests[0].headers.contains_key("apiKey"));
    assert!(core.message_detail("../../untrusted").await.is_err());
    core.api.override_base = Some("http://127.0.0.1:1".into());
    assert_eq!(core.message_detail("123").await.unwrap(), value);
}

#[tokio::test]
async fn full_sync_preserves_failed_collections_offline_and_selected_account() {
    let temp = tempfile::tempdir().unwrap();
    let mut core = test_core(temp.path());
    add_account(&mut core, "account-a", false);
    add_account(&mut core, "account-b", false);
    core.state.accounts[0]
        .cache
        .data
        .insert("grades".into(), json!([{"Uid":"existing","SzamErtek":5}]));
    let server = MockServer::start().await;
    core.api.override_base = Some(server.uri());
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&server)
        .await;
    let outcome = core.refresh_all().await.unwrap();
    assert!(outcome.snapshot.offline);
    assert_eq!(
        outcome.snapshot.active_account_id.as_deref(),
        Some("account-b")
    );
    assert!(outcome.notifications.is_empty());
    assert_eq!(
        core.state.accounts[0].cache.data["grades"][0]["Uid"],
        "existing"
    );
    assert_eq!(
        core.storage.read().unwrap().active_account_id.as_deref(),
        Some("account-b")
    );
}

#[tokio::test]
async fn invalid_grant_preserves_cache_and_does_not_loop() {
    let temp = tempfile::tempdir().unwrap();
    let mut core = test_core(temp.path());
    add_account(&mut core, "account-a", true);
    core.state.accounts[0]
        .cache
        .data
        .insert("grades".into(), json!([{"Uid":"cached"}]));
    let server = MockServer::start().await;
    core.api.idp = server.uri();
    Mock::given(method("POST"))
        .and(path("/connect/token"))
        .respond_with(
            ResponseTemplate::new(400)
                .set_body_json(json!({"error":"invalid_grant","error_description":"PRIVATE-DATA"})),
        )
        .expect(1)
        .mount(&server)
        .await;
    let outcome = core.refresh().await.unwrap();
    assert_eq!(outcome.snapshot.data["grades"][0]["Uid"], "cached");
    assert!(outcome.snapshot.errors.contains_key("connection"));
    assert!(!serde_json::to_string(&outcome)
        .unwrap()
        .contains("PRIVATE-DATA"));
}

#[test]
fn failed_local_writes_leave_memory_unchanged() {
    let temp = tempfile::tempdir().unwrap();
    let mut core = test_core(temp.path());
    add_account(&mut core, "account-a", false);
    add_account(&mut core, "account-b", false);
    // Atomic file replacement must fail when its destination is a directory.
    std::fs::create_dir(temp.path().join("store.enc")).unwrap();
    assert!(core.select_account("account-a").is_err());
    assert_eq!(core.state.active_account_id.as_deref(), Some("account-b"));
    assert!(core.logout("account-b").is_err());
    assert_eq!(core.state.accounts.len(), 2);
    let settings = Settings {
        notifications_enabled: false,
        ..Settings::default()
    };
    assert!(core.update_settings(settings).is_err());
    assert!(core.state.settings.notifications_enabled);
    assert!(core.complete_homework("hw", true).is_err());
    assert!(core.selected().unwrap().cache.completed_homework.is_empty());
}

#[test]
fn old_login_window_cannot_cancel_or_consume_new_attempt() {
    let temp = tempfile::tempdir().unwrap();
    let mut core = test_core(temp.path());
    let first = core.begin_login(None, None).unwrap();
    let second = core.begin_login(None, None).unwrap();
    core.cancel_login_attempt(&first.id);
    assert_eq!(core.pending.as_ref().unwrap().id, second.id);
    core.cancel_login_attempt(&second.id);
    assert!(core.pending.is_none());
}

#[test]
fn institution_directory_rejects_untrusted_domain_names() {
    let schools = normalize_schools(json!({"institutes":[
        {"instituteCode":"SCHOOL-A","name":"Synthetic School","city":"Budapest"},
        {"instituteCode":"evil.example","name":"Must be discarded"}
    ]}))
    .unwrap();
    assert_eq!(schools.len(), 1);
    assert_eq!(schools[0].code, "school-a");
}

#[test]
fn old_settings_receive_desktop_defaults_without_losing_preferences() {
    let settings: Settings =
        serde_json::from_value(json!({"theme":"dark","privateGrades":true})).unwrap();
    assert_eq!(settings.language, "hu");
    assert_eq!(settings.theme, "dark");
    assert!(settings.private_grades);
    assert_eq!(settings.wallpaper_color1, "#629ef2");
    assert_eq!(settings.wallpaper_color2, "#9d7eea");
    assert_eq!(settings.sidebar_side, "left");
    assert_eq!(settings.title_font, "system");
    assert_eq!(settings.title_weight, 650);
    assert_eq!(settings.grade_thresholds, vec![1.5, 2.5, 3.5, 4.5]);
    assert!(settings.animated_background);
    assert!(settings.hidden_nav.is_empty());
    assert_eq!(settings.ui_style, "glass");
    let exported = serde_json::to_value(&settings).unwrap();
    assert_eq!(exported["wallpaperColor1"], "#629ef2");
    assert_eq!(exported["titleWeight"], 650);
}

#[test]
fn unsafe_or_inconsistent_preferences_are_rejected_without_changing_store() {
    let temp = tempfile::tempdir().unwrap();
    let mut core = test_core(temp.path());
    let invalid = [
        Settings {
            language: "xx".into(),
            ..Settings::default()
        },
        Settings {
            wallpaper_color1: "url(https://untrusted.example)".into(),
            ..Settings::default()
        },
        Settings {
            wallpaper_color2: "#12345g".into(),
            ..Settings::default()
        },
        Settings {
            sidebar_side: "floating".into(),
            ..Settings::default()
        },
        Settings {
            title_font: "external-font".into(),
            ..Settings::default()
        },
        Settings {
            grade_thresholds: vec![2.0, 2.0, 3.5, 4.5],
            ..Settings::default()
        },
        Settings {
            grade_thresholds: vec![1.5, f64::NAN, 3.5, 4.5],
            ..Settings::default()
        },
        Settings {
            hidden_nav: vec!["settings".into()],
            ..Settings::default()
        },
        Settings {
            hidden_nav: vec!["dashboard".into()],
            ..Settings::default()
        },
        Settings {
            ui_style: "winamp".into(),
            ..Settings::default()
        },
    ];
    for settings in invalid {
        assert!(core.update_settings(settings).is_err());
    }
    assert_eq!(core.snapshot().settings.wallpaper_color1, "#629ef2");
    let snapshot = core
        .update_settings(Settings {
            language: "de".into(),
            title_weight: 900,
            hidden_nav: vec!["lep".into(), "notes".into(), "progress".into()],
            ui_style: "material".into(),
            ..Settings::default()
        })
        .unwrap();
    assert_eq!(snapshot.settings.title_weight, 800);
    assert_eq!(core.storage.read().unwrap().settings.ui_style, "material");
    assert_eq!(core.storage.read().unwrap().settings.language, "de");
}

#[tokio::test]
async fn class_averages_fall_back_to_accepted_query_form_and_hide_server_refusals() {
    use wiremock::matchers::query_param;
    let temp = tempfile::tempdir().unwrap();
    let mut core = test_core(temp.path());
    add_account(&mut core, "account-a", false);
    let server = MockServer::start().await;
    core.api.override_base = Some(server.uri());
    let averages = "/ellenorzo/v3/sajat/Ertekelesek/Atlagok/OsztalyAtlagok";
    Mock::given(method("GET"))
        .and(path("/ellenorzo/v3/sajat/OsztalyCsoportok"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([
            {"Uid":"g2","Tipus":"Csoport","IsAktiv":true,"OktatasNevelesiFeladat":{"Uid":"9,Szakgimnazium"}},
            {"Uid":"g1","Tipus":"Osztaly","IsAktiv":true,"OktatasNevelesiFeladat":{"Uid":"7,Gimnazium"}}
        ])))
        .mount(&server)
        .await;
    // The class's study task only answers to the full UID; the short form fails with 500.
    Mock::given(method("GET"))
        .and(path(averages))
        .and(query_param("oktatasiNevelesiFeladatUid", "7,Gimnazium"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([
            {"Uid":"a1","Tantargy":{"Uid":"math","Nev":"Matematika"},"TanuloAtlag":4.5,"OsztalyCsoportAtlag":3.9}
        ])))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(averages))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([])))
        .mount(&server)
        .await;
    core.refresh().await.unwrap();
    let cache = &core.state.accounts[0].cache;
    assert_eq!(cache.data["classAverages"][0]["Tantargy"]["Nev"], "Matematika");
    assert!(!cache.errors.contains_key("classAverages"));

    // A server that refuses every form keeps the previous rows and shows no error.
    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/ellenorzo/v3/sajat/OsztalyCsoportok"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([
            {"Uid":"g1","Tipus":"Osztaly","OktatasNevelesiFeladat":{"Uid":"7,Gimnazium"}}
        ])))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(averages))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([])))
        .mount(&server)
        .await;
    core.refresh().await.unwrap();
    let cache = &core.state.accounts[0].cache;
    assert_eq!(cache.data["classAverages"][0]["TanuloAtlag"], 4.5);
    assert!(!cache.errors.contains_key("classAverages"));

    // The school's own "hide class averages" switch skips the request entirely.
    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/ellenorzo/v3/sajat/TanuloAdatlap"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "Nev":"Synthetic Student",
            "Intezmeny":{"TestreszabasBeallitasok":{"IsOsztalyAtlagMegjeleniteseEllenorzoben":false}}
        })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(averages))
        .respond_with(ResponseTemplate::new(500))
        .expect(0)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([
            {"Uid":"g1","Tipus":"Osztaly","OktatasNevelesiFeladat":{"Uid":"7,Gimnazium"}}
        ])))
        .mount(&server)
        .await;
    core.refresh().await.unwrap();
    let cache = &core.state.accounts[0].cache;
    assert_eq!(cache.data["classAverages"], json!([]));
    assert!(!cache.errors.contains_key("classAverages"));
}
