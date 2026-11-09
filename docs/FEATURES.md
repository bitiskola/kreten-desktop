# Feature parity and verification ledger

The target is a local Rust desktop client named **KRETÉN Desktop**, with KRETEN's
glassy desktop layout and logos, Firka's official mobile OAuth login and mobile
API sessions, and useful Firka features absent from the web client. The process
must stay alive after closing its main window, keep refreshing locally, and
offer tray controls and native notifications on Linux and Windows.

This is a feature inventory, not a claim that every item has passed live testing.
The comparison uses the commits in [UPSTREAM.md](UPSTREAM.md).
The implementation/check status is updated during development; detailed file
ownership, current work and remaining bugs live in [tasks.md](../tasks.md).

## Cross-platform student features

| Feature | KRETEN web reference | Firka reference | Desktop acceptance requirement |
| --- | --- | --- | --- |
| Login | IDP form submission followed by OAuth | Official IDP webview with mobile OAuth/PKCE | Official unthemed IDP in an isolated window; no password collection by app UI |
| Session renewal | Per-server-session refresh | Persisted mobile refresh tokens and retry | Local tokens; serialized refresh; expire cleanly; never leak tokens to UI/logs |
| Multiple accounts | Separate browser/server sessions | Add, switch, remove; background sync for all | Local account picker and per-account cache/notification state |
| Overview | Current/next lesson, today, grades, tasks, school-year dates | Lesson/status feed and upcoming tasks | Real data, live lesson/break countdown, partial failure visibility |
| Timetable | Weekly navigation, teacher/room/subject filter, details, weekends | Cached lessons, timetable changes, A/B week information | Navigate arbitrary weeks; preserve canceled/substitute details and weekends |
| Grade list | Subject groups, weights, textual marks, semester filtering | Subject groups, local opened/unopened state | Match grade semantics, include explicit weights, accessible details |
| Grade privacy | Reveal grades and averages by click | Reveal and surprise-grade experience | Hide both grades and dependent averages until revealed |
| Grade statistics | Weighted overall/monthly/subject/date-range calculations | Class averages, rounded subject averages | Numeric 1–5 only; preserve weights; null on empty; explain calculation scope |
| Grade planning | Not exposed as a distinct feature | Add hypothetical grades and see effect | Local hypothetical-grade calculator, never write fictional grades to KRÉTA |
| Rounding | Web numeric averages | Four configurable grade thresholds | Configurable local estimates, never presented as official final marks |
| Homework | Bounded date-range queries and task list | Cached homework and subject-linked data | Query windows ≤21 days; stable-ID merge; display deadlines/details |
| Announced tests | Upcoming tests | Cached announced tests | Dates/subject/topic/teacher and native updates |
| Absences | Justification status and lateness minutes | Cached absences and breakdowns | Justified/unjustified/pending status, minutes, totals and details |
| School notices | Feljegyzések + Faliújság combined/searchable | Same diary notice sources | Keep source and stable identity; text safe to display |
| E-administration mailbox | Inbox/sent/deleted and detail | No separate mailbox UI in inspected app | Separate mailbox folders, defensive nested parsing and detail view |
| Message attachments | Filename display; download unsupported | No matching mailbox attachment feature | Label unsupported downloads honestly until a verified contract is implemented |
| Consultations | Grouped teacher sessions/reserved slots | No matching screen in inspected app | Show schedule and permission errors; official booking link |
| Consultation reservation | Explicitly unsupported; official KRÉTA link | No matching feature | Do not fake success; official service handles booking until implemented |
| LEP events | Event list and guardian permission mutation | No matching screen in inspected app | Display events; authorized allow/deny actions with honest API result |
| Profile | Student fields/contact edit/bank update/delete | Account/student data | Display student fields; contact edit; honor bank read-only capability |
| Bank mutations | Hungarian field names and numeric owner type | No matching screen in inspected app | Validate input; check read-only before request; surface additional-auth rejection |
| DKT subjects | Not a primary visible page | DKT subjects API/cache | Keep supported subject data available without claiming a full DKT classroom |
| Offline reads | No offline sync claimed | Persistent local Isar caches | Last successful data remains readable; show stale/offline state |
| Local logout | Deletes local server session | Removes local account/token | Remove that account's tokens, cache and notification baseline |

## Appearance, accessibility and settings

| Feature | Reference behavior | Desktop acceptance requirement |
| --- | --- | --- |
| Glass design | KRETEN translucent cards/navigation, spacious desktop sidebar | Responsive sidebar/header/content hierarchy, local assets, legible blur treatment |
| Theme modes | KRETEN light/dark; Firka system/light/dark | Persist mode independently from palette; support system preference |
| Color palettes | KRETEN Ocean/Lavender/Mint/Sunset/Rose/Graphite | All six palettes across surfaces/accents |
| Wallpaper | KRETEN custom two-color animated background and pause | Local colors/presets; motion toggle; respect reduced motion |
| Custom theme editor | Firka custom core/grade themes and locally stored copies | Track separately from fixed KRETEN palette parity |
| Typography | Firka title font, weight and capitalization | Track separately from default KRETEN typography |
| Navigation customization | Firka customized bottom bar/left-handed mode | Desktop-equivalent navigation control, or explicit deferred status |
| Bell delay | Firka configurable bell offset | Persist offset; apply consistently to countdown/current lesson logic |
| Localization | Firka Hungarian/English/German; KRETEN Hungarian | Hungarian initial UI; English/German remain separate parity work if absent |
| Alternative/seasonal icons | Firka application-icon selector | Desktop uses requested KRETEN logo; do not include Firka icons |
| Accessibility | KRETEN reduced-motion and semantic progress | Keyboard controls, labeled forms, readable focus/contrast and reduced-motion behavior |

## Background lifecycle and notifications

| Feature | Reference behavior | Desktop acceptance requirement |
| --- | --- | --- |
| Close window | New desktop requirement | Hide main window while resident background process remains running |
| Tray control | New desktop requirement | Show/hide, refresh, pause/resume polling, and full Quit on Linux/Windows |
| Ubuntu top panel | Desktop AppIndicator integration | Requires shell support for AppIndicators; detect/report unavailable tray rather than stranding a hidden app |
| Autostart | Firka Android wakeup after reboot | User-controlled login autostart; distinguish start hidden from full exit |
| Reopen | Desktop requirement | Second launch reuses/shows existing instance |
| Notification transport | Firka FCM wakeup or AlarmManager; local fetch/diff | Resident local polling and native desktop notifications, no relay service |
| First sync | Firka silently seeds each baseline | Avoid notifying about the entire historical backlog |
| Change detection | Firka grades/tasks/absences/messages/lessons | Persist per-account/category baseline; detect changes to an existing ID as well as additions |
| Timetable alerts | Firka cancellation/substitution/change wording | Include useful subject/date/teacher details where present |
| Category controls | Firka master/category toggles and muted subjects | Persist notification categories and subject mute preferences |
| Notification interval | Firka hourly/two-hourly wakeups | Configurable bounded polling; no overlapping refresh cycles; pause/resume |
| Account isolation | Firka checks every local account | Cross-account notifications identify the account without mixing cached records |
| Offline/retry | Firka retry/reauth behavior | Preserve data and baseline on failure; visible failure; resume after network returns |
| Binary app updates | Not the diary-change notification feature | Must have a real release endpoint/signing process before claiming automatic binary updates |

Native desktop notifications depend on OS permission and the notification
daemon. Closing the window keeps polling alive; using **Quit**, logging out of
the OS, powering down, or suspending the computer stops checks until the process
runs again. Local polling cannot notify while the computer is off.

## Mobile-specific Firka features

Firka includes an Android home-screen timetable widget, Wear OS pairing and
background phone/watch synchronization, Android app-icon switching, vibration,
sensor-driven animation, and Android-specific notification/permission screens.
Those mechanisms cannot run unchanged in Linux or Windows. A tray and desktop
notifications cover the desktop background use case; a Wear OS bridge, desktop
widget or equivalent customization requires explicit additional implementation.
Do not silently count these as completed by creating a settings label.

## Validation gates

- Rust core tests: PKCE/state and callback validation, URL/ID validation, token
  refresh, local session/cache behavior, notification baselines and diffing.
- Frontend tests: weighted grade and date calculations, parsing, empty/error/demo
  state boundaries; typecheck and production bundle.
- Native Linux check/build with GTK 3, WebKitGTK 4.1 and AppIndicator libraries.
- Windows CI: compile/test and NSIS package; Linux CI: Debian/AppImage packages.
- Manual native smoke: real login page, account creation, restart restoration,
  manual/background refresh, window-close survival, tray reopen/pause/refresh/Quit,
  native notification permissions, autostart and offline cache.
- Live school-account verification: grades, timetable, notices, mailbox,
  consultations and allowed mutations must be checked with the user's own login.
  Fixtures/demo data never establish live authentication or endpoint success.

CI configuration is not itself a successful CI run, and compiling the app is not
proof of desktop-shell behavior. The final [tasks.md](../tasks.md) records which
checks actually ran and any remaining feature or environment limitations.
