//! Desktop-only integration. School data, OAuth and persistence live in kreten-core.
mod locale;

use kreten_core::{BankAccountUpdate, Core, Settings, Snapshot};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

struct DesktopState {
    core: Mutex<Core>,
    snapshot: RwLock<Snapshot>,
    tray_labels: RwLock<Option<TrayLabels>>,
    refreshing: AtomicBool,
    paused: AtomicBool,
    tray_available: AtomicBool,
    refresh_requested: AtomicBool,
}

struct TrayLabels {
    show: tauri::menu::MenuItem<tauri::Wry>,
    refresh: tauri::menu::MenuItem<tauri::Wry>,
    pause: tauri::menu::CheckMenuItem<tauri::Wry>,
    settings: tauri::menu::MenuItem<tauri::Wry>,
    quit: tauri::menu::MenuItem<tauri::Wry>,
}

fn update_tray_language(app: &tauri::AppHandle, language: &str) {
    if let Ok(labels) = app.state::<DesktopState>().tray_labels.read() {
        if let Some(labels) = labels.as_ref() {
            let _ = labels.show.set_text(locale::tray_text("show", language));
            let _ = labels
                .refresh
                .set_text(locale::tray_text("refresh", language));
            let _ = labels.pause.set_text(locale::tray_text("pause", language));
            let _ = labels
                .settings
                .set_text(locale::tray_text("settings", language));
            let _ = labels.quit.set_text(locale::tray_text("quit", language));
        }
    }
    if let Some(tray) = app.tray_by_id("kreten") {
        let _ = tray.set_tooltip(Some(locale::tray_text("tooltip", language)));
    }
}

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("This command is restricted to the local application window.".into())
    }
}

fn account_matches(core: &Core, account_id: &str) -> Result<(), String> {
    if core.snapshot().active_account_id.as_deref() == Some(account_id) {
        Ok(())
    } else {
        Err(
            "A fiók időközben megváltozott. Ismételd meg a műveletet a kiválasztott fióknál."
                .into(),
        )
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn publish(app: &tauri::AppHandle, snapshot: &Snapshot) {
    if let Ok(mut cached) = app.state::<DesktopState>().snapshot.write() {
        *cached = snapshot.clone();
    }
    let _ = app.emit_to("main", "data-updated", snapshot);
}

struct RefreshGuard<'a>(&'a AtomicBool);
impl Drop for RefreshGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

async fn refresh_data(app: &tauri::AppHandle) -> Result<Snapshot, String> {
    let state = app.state::<DesktopState>();
    if state.refreshing.swap(true, Ordering::AcqRel) {
        return state
            .snapshot
            .read()
            .map(|s| s.clone())
            .map_err(|_| "A helyi nézet nem érhető el.".to_string());
    }
    let _guard = RefreshGuard(&state.refreshing);
    let _ = app.emit_to("main", "sync-started", ());
    let mut core = state.core.lock().await;
    let result = core.refresh_all().await;
    match result {
        Ok(outcome) => {
            if outcome.snapshot.settings.notifications_enabled {
                // Avoid displaying a burst of popups after a long offline interval.
                let total = outcome.notifications.len();
                let language = &outcome.snapshot.settings.language;
                for notification in outcome.notifications.iter().take(3) {
                    let body = if outcome.snapshot.settings.private_grades {
                        locale::tray_text("private_body", language).to_string()
                    } else if language == "hu" {
                        notification.body.clone()
                    } else {
                        let account = outcome
                            .snapshot
                            .accounts
                            .iter()
                            .find(|a| a.id == notification.account_id)
                            .map(|a| a.name.as_str())
                            .unwrap_or_default();
                        locale::generic_notification_body(account, None, language)
                    };
                    if app
                        .notification()
                        .builder()
                        .title(locale::notification_title(&notification.kind, language))
                        .body(body)
                        .show()
                        .is_err()
                    {
                        tracing::warn!("The desktop notification service rejected a notification");
                    }
                }
                if total > 3 {
                    let _ = app
                        .notification()
                        .builder()
                        .title("KRETÉN Desktop")
                        .body(locale::additional_notifications_body(total - 3, language))
                        .show();
                }
            }
            publish(app, &outcome.snapshot);
            Ok(outcome.snapshot)
        }
        Err(error) => {
            let snapshot = core.snapshot();
            publish(app, &snapshot);
            let message = error.to_string();
            let _ = app.emit_to("main", "sync-error", &message);
            Err(message)
        }
    }
}

#[tauri::command]
async fn get_bootstrap(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    state
        .snapshot
        .read()
        .map(|s| s.clone())
        .map_err(|_| "A helyi nézet nem érhető el.".to_string())
}

#[tauri::command]
async fn refresh(window: WebviewWindow, app: tauri::AppHandle) -> Result<Snapshot, String> {
    main_only(&window)?;
    refresh_data(&app).await
}

#[tauri::command]
async fn login(
    window: WebviewWindow,
    app: tauri::AppHandle,
    institution_code: Option<String>,
) -> Result<(), String> {
    main_only(&window)?;
    if let Some(existing) = app.get_webview_window("oauth") {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    let attempt = app
        .state::<DesktopState>()
        .core
        .lock()
        .await
        .begin_login(None, institution_code.as_deref())
        .map_err(|e| e.to_string())?;
    let url = url::Url::parse(&attempt.url).map_err(|_| "Invalid login URL".to_string())?;
    let app_for_navigation = app.clone();
    let canceled_attempt_id = attempt.id.clone();
    let completed = Arc::new(AtomicBool::new(false));
    let completed_for_navigation = completed.clone();
    let oauth = WebviewWindowBuilder::new(&app, "oauth", WebviewUrl::External(url))
        .title("KRÉTA – Bejelentkezés")
        .inner_size(520.0, 800.0)
        .min_inner_size(400.0, 560.0)
        .center()
        .incognito(true)
        .on_navigation(move |url| {
            if url.scheme() == "https"
                && url.host_str() == Some("mobil.e-kreta.hu")
                && url.path() == "/ellenorzo-student/prod/oauthredirect"
            {
                if completed_for_navigation.swap(true, Ordering::AcqRel) {
                    return false;
                }
                let redirect = url.to_string();
                let attempt_id = attempt.id.clone();
                let handle = app_for_navigation.clone();
                tauri::async_runtime::spawn(async move {
                    let result = handle
                        .state::<DesktopState>()
                        .core
                        .lock()
                        .await
                        .complete_login(&attempt_id, &redirect)
                        .await;
                    if let Some(login) = handle.get_webview_window("oauth") {
                        let _ = login.close();
                    }
                    show_main(&handle);
                    match result {
                        Ok(snapshot) => {
                            publish(&handle, &snapshot);
                            let _ = refresh_data(&handle).await;
                        }
                        Err(error) => {
                            let _ = handle.emit_to("main", "auth-error", error.to_string());
                        }
                    }
                });
                return false;
            }
            // No non-TLS schemes or navigation outside KRÉTA's hosted authentication.
            url.scheme() == "https"
                && url
                    .host_str()
                    .is_some_and(|host| host == "e-kreta.hu" || host.ends_with(".e-kreta.hu"))
        })
        .build()
        .map_err(|e| format!("Nem sikerült megnyitni a KRÉTA bejelentkezést: {e}"))?;
    let handle = app.clone();
    oauth.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) && !completed.load(Ordering::Acquire) {
            let cancel_handle = handle.clone();
            let canceled_id = canceled_attempt_id.clone();
            tauri::async_runtime::spawn(async move {
                cancel_handle
                    .state::<DesktopState>()
                    .core
                    .lock()
                    .await
                    .cancel_login_attempt(&canceled_id);
            });
            let _ = handle.emit_to("main", "auth-cancelled", ());
        }
    });
    Ok(())
}

#[tauri::command]
async fn cancel_login(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    main_only(&window)?;
    app.state::<DesktopState>().core.lock().await.cancel_login();
    if let Some(oauth) = app.get_webview_window("oauth") {
        oauth.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn select_account(
    window: WebviewWindow,
    app: tauri::AppHandle,
    account_id: String,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    let state = app.state::<DesktopState>();
    let mut core = state.core.lock().await;
    let snapshot = core
        .select_account(&account_id)
        .map_err(|e| e.to_string())?;
    publish(&app, &snapshot);
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = refresh_data(&handle).await;
    });
    Ok(snapshot)
}

#[tauri::command]
async fn logout(
    window: WebviewWindow,
    app: tauri::AppHandle,
    account_id: String,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    let state = app.state::<DesktopState>();
    let mut core = state.core.lock().await;
    let snapshot = core.logout(&account_id).map_err(|e| e.to_string())?;
    publish(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
async fn update_settings(
    window: WebviewWindow,
    app: tauri::AppHandle,
    settings: Settings,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    let state = app.state::<DesktopState>();
    let mut core = state.core.lock().await;
    let previous = core.snapshot().settings;
    if settings.launch_at_startup != previous.launch_at_startup {
        let manager = app.autolaunch();
        if settings.launch_at_startup {
            manager.enable()
        } else {
            manager.disable()
        }
        .map_err(|e| format!("Az automatikus indítás beállítása sikertelen: {e}"))?;
    }
    state.refresh_requested.store(true, Ordering::Release);
    match core.update_settings(settings) {
        Ok(snapshot) => {
            update_tray_language(&app, &snapshot.settings.language);
            publish(&app, &snapshot);
            Ok(snapshot)
        }
        Err(error) => {
            if previous.launch_at_startup {
                let _ = app.autolaunch().enable();
            } else {
                let _ = app.autolaunch().disable();
            }
            Err(error.to_string())
        }
    }
}

#[tauri::command]
async fn complete_homework(
    window: WebviewWindow,
    app: tauri::AppHandle,
    account_id: String,
    id: String,
    complete: bool,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    let state = app.state::<DesktopState>();
    let mut core = state.core.lock().await;
    account_matches(&core, &account_id)?;
    let snapshot = core
        .complete_homework(&id, complete)
        .map_err(|e| e.to_string())?;
    publish(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
async fn dismiss_notification(
    window: WebviewWindow,
    app: tauri::AppHandle,
    id: String,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    let snapshot = app
        .state::<DesktopState>()
        .core
        .lock()
        .await
        .dismiss_notification(&id)
        .map_err(|e| e.to_string())?;
    publish(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
async fn schools(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<Vec<kreten_core::School>, String> {
    main_only(&window)?;
    state
        .core
        .lock()
        .await
        .schools()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_schools(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
    query: String,
) -> Result<Vec<kreten_core::School>, String> {
    main_only(&window)?;
    state
        .core
        .lock()
        .await
        .search_schools(&query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn timetable(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
    account_id: String,
    from: String,
    to: String,
) -> Result<Value, String> {
    main_only(&window)?;
    let mut core = state.core.lock().await;
    account_matches(&core, &account_id)?;
    core.timetable(&from, &to).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn message_detail(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
    account_id: String,
    id: String,
) -> Result<Value, String> {
    main_only(&window)?;
    let mut core = state.core.lock().await;
    account_matches(&core, &account_id)?;
    core.message_detail(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn consulting_hour(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
    account_id: String,
    id: String,
) -> Result<Value, String> {
    main_only(&window)?;
    let mut core = state.core.lock().await;
    account_matches(&core, &account_id)?;
    core.consulting_hour(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn lep_permission(
    window: WebviewWindow,
    app: tauri::AppHandle,
    account_id: String,
    event_id: String,
    is_permitted: bool,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    {
        let state = app.state::<DesktopState>();
        let mut core = state.core.lock().await;
        account_matches(&core, &account_id)?;
        core.lep_permission(&event_id, is_permitted)
            .await
            .map_err(|e| e.to_string())?;
    }
    refresh_data(&app).await
}

#[tauri::command]
async fn update_contact(
    window: WebviewWindow,
    app: tauri::AppHandle,
    account_id: String,
    email: String,
    phone: String,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    {
        let state = app.state::<DesktopState>();
        let mut core = state.core.lock().await;
        account_matches(&core, &account_id)?;
        core.update_contact(&email, &phone)
            .await
            .map_err(|e| e.to_string())?;
    }
    refresh_data(&app).await
}

#[tauri::command]
async fn update_bank_account(
    window: WebviewWindow,
    app: tauri::AppHandle,
    account_id: String,
    bank_account: BankAccountUpdate,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    {
        let state = app.state::<DesktopState>();
        let mut core = state.core.lock().await;
        account_matches(&core, &account_id)?;
        core.update_bank_account(bank_account)
            .await
            .map_err(|e| e.to_string())?;
    }
    refresh_data(&app).await
}

#[tauri::command]
async fn delete_bank_account(
    window: WebviewWindow,
    app: tauri::AppHandle,
    account_id: String,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    {
        let state = app.state::<DesktopState>();
        let mut core = state.core.lock().await;
        account_matches(&core, &account_id)?;
        core.delete_bank_account()
            .await
            .map_err(|e| e.to_string())?;
    }
    refresh_data(&app).await
}

#[tauri::command]
async fn open_school(
    window: WebviewWindow,
    app: tauri::AppHandle,
    institution_code: String,
) -> Result<(), String> {
    main_only(&window)?;
    let code = kreten_core::validate_institution(&institution_code).map_err(|e| e.to_string())?;
    app.opener()
        .open_url(format!("https://{code}.e-kreta.hu"), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_notification(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    main_only(&window)?;
    let language = app
        .state::<DesktopState>()
        .snapshot
        .read()
        .map_err(|_| "Settings unavailable")?
        .settings
        .language
        .clone();
    app.notification()
        .builder()
        .title(locale::tray_text("test_title", &language))
        .body(locale::tray_text("test_body", &language))
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    main_only(&window)?;
    app.exit(0);
    Ok(())
}

fn tray_host_available() -> bool {
    #[cfg(target_os = "linux")]
    {
        let Ok(connection) = dbus::blocking::Connection::new_session() else {
            return false;
        };
        let proxy = connection.with_proxy(
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            Duration::from_secs(2),
        );
        let answer: Result<(bool,), _> = proxy.method_call(
            "org.freedesktop.DBus",
            "NameHasOwner",
            ("org.kde.StatusNotifierWatcher",),
        );
        matches!(answer, Ok((true,)))
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    let show = MenuItem::with_id(app, "show", "KRETÉN Desktop megnyitása", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Frissítés most", true, None::<&str>)?;
    let pause = CheckMenuItem::with_id(
        app,
        "pause",
        "Háttérfrissítés szüneteltetése",
        true,
        false,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "settings", "Beállítások", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Kilépés – teljes bezárás", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &refresh,
            &pause,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    if let Ok(mut labels) = app.state::<DesktopState>().tray_labels.write() {
        *labels = Some(TrayLabels {
            show,
            refresh,
            pause: pause.clone(),
            settings,
            quit,
        });
    }
    TrayIconBuilder::with_id("kreten")
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/32x32.png"
        ))?)
        .tooltip("KRETÉN Desktop – háttérben is veled")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "refresh" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = refresh_data(&app).await;
                });
            }
            "pause" => {
                let state = app.state::<DesktopState>();
                let paused = !state.paused.load(Ordering::Acquire);
                state.paused.store(paused, Ordering::Release);
                if !paused {
                    state.refresh_requested.store(true, Ordering::Release);
                }
                let _ = pause.set_checked(paused);
                let _ = app.emit_to("main", "background-paused", paused);
            }
            "settings" => {
                show_main(app);
                let _ = app.emit_to("main", "navigate", "settings");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("kreten_desktop=info")
        .init();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--background"])
                .build(),
        )
        .setup(|app| {
            let core = Core::open(app.path().app_local_data_dir()?)?;
            let snapshot = core.snapshot();
            let settings = snapshot.settings.clone();
            app.manage(DesktopState {
                core: Mutex::new(core),
                snapshot: RwLock::new(snapshot),
                tray_labels: RwLock::new(None),
                refreshing: AtomicBool::new(false),
                paused: AtomicBool::new(false),
                tray_available: AtomicBool::new(false),
                refresh_requested: AtomicBool::new(true),
            });
            let tray_available = tray_host_available()
                && match setup_tray(app.handle()) {
                    Ok(()) => true,
                    Err(_) => {
                        tracing::warn!("Tray unavailable; closing the window will quit the app");
                        false
                    }
                };
            app.state::<DesktopState>()
                .tray_available
                .store(tray_available, Ordering::Release);
            update_tray_language(app.handle(), &settings.language);
            if tray_available
                && (settings.start_minimized || std::env::args().any(|arg| arg == "--background"))
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut last_refresh: Option<tokio::time::Instant> = None;
                loop {
                    let state = handle.state::<DesktopState>();
                    let (minutes, has_account) = {
                        let snapshot = state.snapshot.read().expect("snapshot lock poisoned");
                        (
                            snapshot.settings.poll_interval_minutes.clamp(1, 60) as u64,
                            snapshot.active_account_id.is_some(),
                        )
                    };
                    if !state.paused.load(Ordering::Acquire)
                        && has_account
                        && (state.refresh_requested.swap(false, Ordering::AcqRel)
                            || last_refresh.is_none_or(|last| {
                                last.elapsed() >= Duration::from_secs(minutes * 60)
                            }))
                    {
                        let _ = refresh_data(&handle).await;
                        last_refresh = Some(tokio::time::Instant::now());
                    }
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if window
                        .state::<DesktopState>()
                        .tray_available
                        .load(Ordering::Acquire)
                        && window.hide().is_ok()
                    {
                        api.prevent_close();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap,
            refresh,
            login,
            cancel_login,
            select_account,
            logout,
            update_settings,
            complete_homework,
            dismiss_notification,
            test_notification,
            quit_app,
            schools,
            search_schools,
            timetable,
            message_detail,
            consulting_hour,
            lep_permission,
            update_contact,
            update_bank_account,
            delete_bank_account,
            open_school,
        ])
        .run(tauri::generate_context!())
        .expect("KRETÉN Desktop could not start");
}
