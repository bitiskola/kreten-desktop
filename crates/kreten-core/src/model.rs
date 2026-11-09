// Adapted from Firka's KRÉTA mobile models, QwIT Development, CC BY-NC-SA 4.0.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub poll_interval_minutes: u32,
    pub notifications_enabled: bool,
    pub start_minimized: bool,
    pub launch_at_startup: bool,
    pub theme: String,
    pub palette: String,
    pub private_grades: bool,
    pub bell_offset_minutes: i32,
    pub muted_subjects: Vec<String>,
    pub notification_categories: Vec<String>,
    pub language: String,
    pub wallpaper_color1: String,
    pub wallpaper_color2: String,
    pub animated_background: bool,
    pub sidebar_side: String,
    pub title_font: String,
    pub title_weight: u16,
    pub grade_thresholds: Vec<f64>,
    pub hidden_nav: Vec<String>,
    /// Visual design language: glass, pixel, hyperos or material.
    pub ui_style: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            poll_interval_minutes: 5,
            notifications_enabled: true,
            start_minimized: false,
            launch_at_startup: false,
            theme: "light".into(),
            palette: "ocean".into(),
            private_grades: false,
            bell_offset_minutes: 0,
            muted_subjects: Vec::new(),
            notification_categories: [
                "grades",
                "homework",
                "tests",
                "absences",
                "timetable",
                "notes",
                "notices",
                "messagesInbox",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            language: "hu".into(),
            wallpaper_color1: "#629ef2".into(),
            wallpaper_color2: "#9d7eea".into(),
            animated_background: true,
            sidebar_side: "left".into(),
            title_font: "system".into(),
            title_weight: 650,
            grade_thresholds: vec![1.5, 2.5, 3.5, 4.5],
            hidden_nav: Vec::new(),
            ui_style: "glass".into(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub institution_code: String,
    pub institution_name: String,
    pub username: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub created_at: String,
    pub account_id: String,
}

/// Only this projection is sent to the desktop UI. OAuth tokens never cross IPC.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub accounts: Vec<Account>,
    pub active_account_id: Option<String>,
    pub data: BTreeMap<String, Value>,
    pub last_synced_at: Option<String>,
    pub offline: bool,
    pub errors: BTreeMap<String, String>,
    pub settings: Settings,
    pub notifications: Vec<Notification>,
    pub completed_homework: BTreeSet<String>,
    pub storage_mode: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshOutcome {
    pub snapshot: Snapshot,
    pub notifications: Vec<Notification>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct School {
    pub code: String,
    pub name: String,
    pub city: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct Cache {
    pub data: BTreeMap<String, Value>,
    pub last_synced_at: Option<String>,
    pub errors: BTreeMap<String, String>,
    pub completed_homework: BTreeSet<String>,
    pub fingerprints: BTreeMap<String, BTreeMap<String, String>>,
    pub message_details: BTreeMap<String, Value>,
    pub timetable_range: Option<(String, String)>,
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct StoredAccount {
    pub account: Account,
    pub tokens: Tokens,
    pub cache: Cache,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct State {
    pub accounts: Vec<StoredAccount>,
    pub active_account_id: Option<String>,
    pub settings: Settings,
    pub notifications: Vec<Notification>,
    pub schools: Vec<School>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BankAccountUpdate {
    pub account_number: String,
    pub owner_name: String,
    pub owner_type_id: u32,
    pub bank_name: String,
}

/// Attachments are bytes returned to the trusted Rust shell; never an arbitrary URL.
pub struct Attachment {
    pub bytes: Vec<u8>,
    pub file_name: String,
}
