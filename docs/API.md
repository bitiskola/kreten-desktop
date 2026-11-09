# Rust core and KRÉTA protocol

`crates/kreten-core` owns authentication, HTTP, persistence, account separation,
offline caching, and notification differences. The Tauri shell owns windows, tray
actions, OS notifications, and the polling timer. The web UI only receives the
`Snapshot` projection; access and refresh tokens are not serialized into it.

The native IPC wrappers require the page's captured `accountId` on account-specific
reads and writes, and compare it under the Core mutex before calling these methods.
This prevents an action queued on account A from executing against account B after
the user switches accounts.

## Stable interface

All methods below require the application to hold its `tokio::sync::Mutex<Core>`.
`Core::open(data_directory)` is synchronous, opens one exclusive process lock,
and returns `Result<Core>`. Normal local methods are synchronous:

```rust
snapshot(&self) -> Snapshot
begin_login(&mut self, username: Option<&str>, institution: Option<&str>) -> Result<LoginAttempt>
cancel_login(&mut self)
cancel_login_attempt(&mut self, attempt_id: &str)
select_account(&mut self, account_id: &str) -> Result<Snapshot>
logout(&mut self, account_id: &str) -> Result<Snapshot>
update_settings(&mut self, settings: Settings) -> Result<Snapshot>
complete_homework(&mut self, id: &str, complete: bool) -> Result<Snapshot>
dismiss_notification(&mut self, id: &str) -> Result<Snapshot>
```

Async methods:

```rust
complete_login(&mut self, attempt_id: &str, redirect_url: &str) -> Result<Snapshot>
refresh(&mut self) -> Result<RefreshOutcome>
refresh_all(&mut self) -> Result<RefreshOutcome>
schools(&mut self) -> Result<Vec<School>>
search_schools(&mut self, query: &str) -> Result<Vec<School>>
timetable(&mut self, from: &str, to: &str) -> Result<Value>
message_detail(&mut self, id: &str) -> Result<Value>
consulting_hour(&mut self, id: &str) -> Result<Value>
lep_permission(&mut self, event_id: &str, is_permitted: bool) -> Result<()>
update_contact(&mut self, email: &str, phone: &str) -> Result<()>
update_bank_account(&mut self, bank: BankAccountUpdate) -> Result<()>
delete_bank_account(&mut self) -> Result<()>
```

`LoginAttempt` is `{id, url}`. `School` is `{code, name, city}`. Dates use
`YYYY-MM-DD`; timetable requests may span at most 42 days. The homework checkbox
is **local only** and is stored separately for each account. Upstream homework
data is never rewritten to imply server-side completion.

`refresh_all` does not switch the selected account, including intermediate disk
writes. A collection failure leaves its previous successful cache intact and
records a safe localized message in `errors`. Total failure exposes the previous
snapshot with `offline: true`. An invalid refresh token leaves the cache and
account in place so the user can read offline and reauthenticate.

## JSON projection

All Rust field names serialize as camelCase. `data` holds the unmodified mobile
API values; normalize these at the presentation boundary, preserving the source
data. `Snapshot` is:

```text
accounts: [{ id, name, institutionCode, institutionName, username }]
activeAccountId: string | null
data: { [collectionName]: JSON }
lastSyncedAt: RFC3339 timestamp | null
offline: boolean
errors: { [collectionName]: localized safe message }
settings: {
  pollIntervalMinutes, notificationsEnabled, startMinimized, launchAtStartup,
  theme, palette, privateGrades, bellOffsetMinutes, mutedSubjects, notificationCategories
  language, wallpaperColor1, wallpaperColor2, animatedBackground, sidebarSide,
  titleFont, titleWeight, gradeThresholds, hiddenNav
}
notifications: [{ id, kind, title, body, createdAt, accountId }]
completedHomework: string[]
storageMode: "keyring" | "file"
```

`RefreshOutcome` is `{snapshot, notifications}` where `notifications` includes
only changes discovered by that refresh. `snapshot.notifications` is the local
history, capped at 100 entries. The shell decides whether OS notifications are
enabled; differences are recorded locally regardless. The first successful
collection fetch establishes a silent baseline. Grades, omissions, homework,
tests, notes and notice-board changes notify. Mailbox read-state changes do not.
Future lesson edits, cancellations and actual additions/removals inside an
already-observed date range notify; entering a new rolling week is silent.

Defaults: 5-minute polling, notifications enabled, light theme, ocean palette,
no startup launch, no hidden grades, no muted subjects, zero bell offset.
Polling is clamped to 1–60 minutes; bell offsets to -30–30 minutes.

`notificationCategories` defaults to all eight collections listed above. Disabled
categories still advance their comparison baseline, so enabling them does not
produce historical alerts. `mutedSubjects` suppresses grade, homework and test
notifications with matching subject names; it does not hide timetable changes.

Desktop preferences default to Hungarian (`hu`; alternatives `en` and `de`),
animated `#629ef2`/`#9d7eea` wallpaper, a left sidebar, system title font at weight
650, and grade thresholds `[1.5, 2.5, 3.5, 4.5]`. Colors must be six-digit hex;
title fonts are `system`, `serif`, or `rounded`; title weights are clamped to
400–800. Thresholds must contain four increasing finite numbers in 1–5.
Navigation hiding accepts existing page IDs while preserving dashboard and
settings access. Missing settings in an older local store receive defaults.

## Direct upstream routes

No developer-owned relay, Firebase service, analytics, or hosted cache is used.
All production HTTP endpoints are fixed official `e-kreta.hu` services.
Institution codes are validated as a single DNS label. HTTP redirects are
disabled on authenticated calls so a redirect cannot forward a bearer token.
Timeouts are bounded and JSON responses are capped at 16 MiB. Upstream response
bodies and token values are never inserted into user-facing error text.

Under `https://{institution}.e-kreta.hu/ellenorzo/v3/sajat/`:

| Collection | Route |
| --- | --- |
| student | `TanuloAdatlap` |
| grades | `Ertekelesek` |
| absences | `Mulasztasok` |
| timetable | `OrarendElemek?datumTol=…&datumIg=…` |
| homework | `HaziFeladatok?datumTol=…&datumIg=…` |
| tests | `BejelentettSzamonkeresek?datumTol=…` |
| notices | `FaliujsagElemek?datumTol=…` |
| notes | `Feljegyzesek?datumTol=…` |
| groups | `OsztalyCsoportok` |
| classAverages | `Ertekelesek/Atlagok/OsztalyAtlagok?oktatasiNevelesiFeladatUid=…` |
| schoolYear | `Intezmenyek/TanevRendjeElemek` |
| consultations | `Fogadoorak` |
| guardian | `GondviseloAdatlap` |
| capabilities | `Intezmenyek` |

Additional school routes are `/ellenorzo/v3/Lep/Eloadasok` (`lep`) and
`/dktapi/intezmenyek/munkaterek/tanulok` (`dktSubjects`). Class-average queries
use the groups' unique `OktatasNevelesiFeladat.Uid` values, the active class
(`Tipus: "Osztaly"`) first. KRÉTA answers HTTP 500 to a query form it does not
accept, so each study task is tried as: UID truncated at the first comma (Firka),
the same parameter sent twice (current Firka endpoint), then the full UID (older
clients). Rows are merged and deduplicated by `Tantargy.Uid`. If the school hides
class averages (`TestreszabasBeallitasok.IsOsztalyAtlagMegjeleniteseEllenorzoben`
is `false` in `TanuloAdatlap.Intezmeny` or `Intezmenyek`) no request is sent and
the bucket is empty. If every form is refused with an HTTP status, the previous
cache is kept and no sync error is shown; network and session errors still are.
Class averages expose `Tantargy`, `TanuloAtlag`, and `OsztalyCsoportAtlag`.

Homework covers today minus 14 days to today plus 30 days in overlapping chunks
of at most 21 days, deduplicated by `Uid`. The normal timetable cache covers last
week through two weeks after the current week. Explicit timetable navigation
does not alter the notification baseline. School dates use Europe/Budapest.

Mailboxes use
`https://eugyintezes.e-kreta.hu/api/v1/kommunikacio/postaladaelemek/` with
`beerkezett`, `elkuldott`, and `torolt`, exposed as `messagesInbox`,
`messagesSent`, and `messagesDeleted`. Message detail uses the mailbox-element ID
at the same root. These calls use a neutral user agent plus
`X-Uzenet-Lokalizacio: hu-HU`, because KRETEN documents connection failures when
the diary mobile user agent is used against this service. Diary calls retain
Firka's Android mobile user agent and public `apiKey` header.

School discovery uses the official public endpoint
`https://kretaglobalapi.e-kreta.hu/intezmenyek/kreta/publikus`; the last successful
directory is cached locally. The hosted KRÉTA login includes its own institution
selector, so directory unavailability does not prevent opening login.

`search_schools` first filters a locally cached directory, ignoring Hungarian
diacritics. If necessary it uses the official selector at
`https://intezmenykereso.e-kreta.hu/instituteSelector/{query}?showOnlyLive=true`,
parses `a[data-val]` into validated school codes, and caches searches for one hour.
Public lookups have an 8-second timeout; search requires at least two characters,
is bounded to 150 characters and 100 local results, and HTML responses are capped
at 2 MiB. No account authorization header is sent to either directory service.

Contact and bank updates and LÉP guardian permission reuse the verified KRETEN
mobile routes and payloads. Bank changes first reread the student sheet and
honor `Bankszamla.IsReadOnly`. These are real remote writes and must only be
called after a deliberate user action.

## OAuth and local storage

The hosted, unmodified KRÉTA login flow comes from Firka's
`firka_common/lib/core/consts.dart` and `firka/lib/api/token_grant.dart`:

- Android public client: `kreta-ellenorzo-student-mobile-android`.
- IDP: `https://idp.e-kreta.hu/Account/Login` with encoded authorization ReturnUrl.
- PKCE SHA-256, cryptographically random verifier, state and nonce per attempt.
- Redirect: `https://mobil.e-kreta.hu/ellenorzo-student/prod/oauthredirect`.
- Token endpoint: `https://idp.e-kreta.hu/connect/token`.
- The original mobile scopes, including offline access, are retained.
- Authorization code callbacks require the exact HTTPS host/path, matching
  state, a unique code, and an attempt younger than 15 minutes; duplicate query
  state/code values, URL credentials, fragments and wrong schemes are rejected.
- The returned ID token nonce must match and its audience, when present, must
  contain the mobile client. ID token claims come only from the TLS-protected
  token response and are used as account metadata; they are never accepted from
  the web UI. The core does not implement independent JWKS signature validation.
- Old-window cancellation is attempt-scoped and cannot consume a new attempt.
- Token refresh uses `institute_code`, `refresh_token`, `grant_type`, and the same
  mobile client. Refreshed credentials are persisted before subsequent API
  calls. A 401 triggers one token rotation and one retry, never a login loop.
- Passwords are entered only on KRÉTA's hosted page and are not handled by Core.

`store.enc` contains both sessions and cached student data, encrypted using
XChaCha20-Poly1305 with a fresh 192-bit nonce for each atomic write. The random
256-bit key is in the OS credential store (Secret Service on Linux, Credential
Manager on Windows). Unix desktops with no available Secret Service may use a
0600 `store.key` file inside the 0700 application data directory; `storageMode`
discloses this weaker fallback. It protects against other OS users, not programs
already running as that user or copies of the complete data directory. Windows
has no plaintext fallback: an unavailable credential store is a startup error.
An existing keyring-backed store is never silently switched to a new key.

The process lock prevents two writers. Local user mutations stage a new state
and commit it only after an atomic durable disk write succeeds. A rotated
refresh token is retained in memory even if persistence fails, because rolling
back to an invalidated token would be unsafe. No raw tokens or student records
are logged. Logging out removes the account, its cache, local homework state,
tokens and notification history from the encrypted store.

## Deliberate upstream limitations

Neither reference implements working consultation booking; KRETEN explicitly
returns HTTP 501. Its messages are read-only, and attachments are metadata with
an instruction to use official KRÉTA for downloading. This client does not invent
undocumented reservation, send/delete-mail, or attachment-download calls. Firka's
phone/watch pairing and Firebase relay are platform/service-specific; desktop
notifications are generated by local polling to honor the local-only requirement.

Authenticated tests use synthetic local Wiremock servers and private temporary
stores. Live account access requires a real user completing KRÉTA OAuth, which
must be validated separately on installed Linux and Windows builds.
