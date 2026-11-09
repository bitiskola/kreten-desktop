//! Native application copy only. School messages, subject names and account
//! names remain exactly as received; this module never translates their content.

/// Translates native tray and notification utility copy. Unknown languages use
/// Hungarian; unknown keys retain the product name instead of exposing a key.
pub fn tray_text(key: &str, language: &str) -> &'static str {
    match (language, key) {
        ("en", "show") => "Open KRETÉN Desktop",
        ("de", "show") => "KRETÉN Desktop öffnen",
        (_, "show") => "KRETÉN Desktop megnyitása",
        ("en", "refresh") => "Refresh now",
        ("de", "refresh") => "Jetzt aktualisieren",
        (_, "refresh") => "Frissítés most",
        ("en", "pause") => "Pause background refresh",
        ("de", "pause") => "Hintergrundaktualisierung pausieren",
        (_, "pause") => "Háttérfrissítés szüneteltetése",
        ("en", "settings") => "Settings",
        ("de", "settings") => "Einstellungen",
        (_, "settings") => "Beállítások",
        ("en", "quit") => "Quit completely",
        ("de", "quit") => "Vollständig beenden",
        (_, "quit") => "Kilépés – teljes bezárás",
        ("en", "tooltip") => "KRETÉN Desktop – running in the background",
        ("de", "tooltip") => "KRETÉN Desktop – im Hintergrund aktiv",
        (_, "tooltip") => "KRETÉN Desktop – háttérben is veled",
        (_, "test_title" | "more_title") => "KRETÉN Desktop",
        ("en", "test_body") => "Notifications are working. New school updates will appear here.",
        ("de", "test_body") => {
            "Benachrichtigungen funktionieren. Neue schulische Änderungen erscheinen hier."
        }
        (_, "test_body") => "Az értesítések működnek. Az új iskolai változásokról itt értesítünk.",
        ("en", "private_body") => "New school notification. Open KRETÉN Desktop for details.",
        ("de", "private_body") => {
            "Neue schulische Benachrichtigung. Öffne KRETÉN Desktop für weitere Informationen."
        }
        (_, "private_body") => "Új iskolai értesítés. Nyisd meg a KRETÉN Desktopot a részletekért.",
        ("en", "more_body") => "More notifications are available in the app.",
        ("de", "more_body") => "Weitere Benachrichtigungen sind in der App verfügbar.",
        (_, "more_body") => "További értesítések az alkalmazásban.",
        _ => "KRETÉN Desktop",
    }
}

/// `kind` is the stable notification collection identifier from kreten-core.
pub fn notification_title(kind: &str, language: &str) -> &'static str {
    match (language, kind) {
        ("en", "grades") => "New or updated grade",
        ("de", "grades") => "Neue oder geänderte Bewertung",
        (_, "grades") => "Új vagy módosult értékelés",
        ("en", "homework") => "Homework updated",
        ("de", "homework") => "Hausaufgaben aktualisiert",
        (_, "homework") => "Házi feladat frissült",
        ("en", "tests") => "Announced test updated",
        ("de", "tests") => "Angekündigte Prüfung aktualisiert",
        (_, "tests") => "Bejelentett dolgozat frissült",
        ("en", "absences") => "Absence record updated",
        ("de", "absences") => "Fehlzeiten aktualisiert",
        (_, "absences") => "Mulasztás frissült",
        ("en", "notes" | "notices") => "New school announcement",
        ("de", "notes" | "notices") => "Neue schulische Mitteilung",
        (_, "notes" | "notices") => "Új iskolai közlemény",
        ("en", "messagesInbox") => "New message",
        ("de", "messagesInbox") => "Neue Nachricht",
        (_, "messagesInbox") => "Új üzenet",
        ("en", "timetable") => "Timetable changed",
        ("de", "timetable") => "Stundenplan geändert",
        (_, "timetable") => "Órarendváltozás",
        _ => "KRETÉN Desktop",
    }
}

/// Summarizes a known change count without parsing previously localized text.
/// Use `None` when the core supplies no structured count. Privacy mode should
/// instead use `tray_text("private_body", language)` to omit the account name.
pub fn generic_notification_body(account: &str, count: Option<usize>, language: &str) -> String {
    let message = match (language, count) {
        ("en", Some(1)) => "1 new or updated item".into(),
        ("en", Some(count)) => format!("{count} new or updated items"),
        ("de", Some(1)) => "1 neuer oder geänderter Eintrag".into(),
        ("de", Some(count)) => format!("{count} neue oder geänderte Einträge"),
        (_, Some(count)) => format!("{count} új vagy módosult elem"),
        ("en", None) => "New school updates are available. Open KRETÉN Desktop for details.".into(),
        ("de", None) => "Neue schulische Änderungen sind verfügbar. Öffne KRETÉN Desktop für weitere Informationen.".into(),
        (_, None) => "Új iskolai változások érkeztek. Nyisd meg a KRETÉN Desktopot a részletekért.".into(),
    };
    if account.is_empty() {
        message
    } else {
        format!("{account} · {message}")
    }
}

/// Used for the one summary notification after the desktop's popup burst limit.
pub fn additional_notifications_body(count: usize, language: &str) -> String {
    match (language, count) {
        ("en", 1) => "1 more notification in the app.".into(),
        ("en", count) => format!("{count} more notifications in the app."),
        ("de", 1) => "1 weitere Benachrichtigung in der App.".into(),
        ("de", count) => format!("{count} weitere Benachrichtigungen in der App."),
        (_, count) => format!("További {count} új értesítés az alkalmazásban."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_copy_covers_languages_and_safe_fallbacks() {
        assert_eq!(tray_text("refresh", "hu"), "Frissítés most");
        assert_eq!(tray_text("refresh", "en"), "Refresh now");
        assert_eq!(tray_text("refresh", "de"), "Jetzt aktualisieren");
        assert_eq!(tray_text("refresh", "unknown"), tray_text("refresh", "hu"));
        for language in ["hu", "en", "de"] {
            for key in [
                "show",
                "refresh",
                "pause",
                "settings",
                "quit",
                "tooltip",
                "test_title",
                "test_body",
                "private_body",
                "more_title",
                "more_body",
            ] {
                assert!(!tray_text(key, language).is_empty());
            }
            for kind in [
                "grades",
                "homework",
                "tests",
                "absences",
                "notes",
                "notices",
                "messagesInbox",
                "timetable",
            ] {
                assert_ne!(notification_title(kind, language), "KRETÉN Desktop");
            }
        }
        assert_eq!(tray_text("untrusted-key", "en"), "KRETÉN Desktop");
        assert_eq!(notification_title("untrusted-kind", "de"), "KRETÉN Desktop");
    }

    #[test]
    fn bodies_keep_names_verbatim_and_handle_singular_plural_and_privacy() {
        let name = "Árvíztűrő Ödön";
        assert_eq!(
            generic_notification_body(name, Some(1), "en"),
            "Árvíztűrő Ödön · 1 new or updated item"
        );
        assert_eq!(
            generic_notification_body(name, Some(2), "de"),
            "Árvíztűrő Ödön · 2 neue oder geänderte Einträge"
        );
        assert!(generic_notification_body(name, None, "hu").starts_with(name));
        assert!(!generic_notification_body("", None, "en").starts_with(" · "));
        assert_eq!(
            additional_notifications_body(1, "en"),
            "1 more notification in the app."
        );
        assert_eq!(
            additional_notifications_body(2, "de"),
            "2 weitere Benachrichtigungen in der App."
        );
        assert!(!tray_text("private_body", "hu").contains(name));
    }
}
