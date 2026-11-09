# KRETÉN Desktop — project brief and live handoff

## Final outcome / prompt for the next agent

Build a complete, working, local-first Rust desktop application named **KRETÉN Desktop** for Linux (including Ubuntu) and Windows. Reimplement the layout, glassy visual design, logo, and features of https://github.com/micr0softstore/KRETEN while connecting directly to the KRÉTA mobile APIs and preserving the OAuth login/session behavior of https://github.com/QwIT-Development/firka. Include Firka capabilities missing from the web app, especially background change detection and native notifications. Keep credentials, cached school data, preferences, and sessions on the user's device; do not add a hosted intermediary. Closing the main window must leave the app running with a Linux AppIndicator / Windows tray menu that can reopen, refresh, and fully quit it. Periodically refresh school data and notify about changes. Keep this file current with files being edited, completed work, remaining work, discovered bugs, implementation decisions, and honest validation limits. Preserve upstream license/attribution requirements. Never claim authenticated API behavior has been tested without a real authorized account.

## Status

- Phase: complete; all core modules, desktop shell, glass interface, translations, settings, native tray/notifications, build workflows, documentation, and automated test suites are verified.
- Deliverable files: `crates/kreten-core/**` (OAuth/API/encrypted persistence), `src/**` (React presentation and native bridge), `src-tauri/**` (Rust desktop lifecycle), `docs/**` (parity/protocol/license/validation), `.github/workflows/**` (platform builds), `scripts/**` (native build wrappers).
- Source references: cloned in `/tmp/kreten-reference/{firka,kreten}` (outside the deliverable).

## Work plan

- [x] Inspect Firka OAuth, mobile API, local storage, notifications, and feature set.
- [x] Inspect KRETEN screens, visual system, assets, and feature set.
- [x] Select and scaffold the Rust desktop architecture and local persistence.
- [x] Implement OAuth, secure local sessions, API client, refresh and offline cache (synthetic integration tests; real-account validation remains).
- [x] Implement desktop screens matching KRETEN plus Firka-only capabilities.
- [x] Implement native tray, close-to-background, polling, notifications, startup settings (native runtime checks passed).
- [x] Add platform build configuration, icons, documentation, and attribution.
- [x] Compile, test API/data transformations and background behavior, inspect UI, fix findings.
- [x] Record remaining integration/platform verification limits and exact run/build commands.

## Known issues / open questions

- Real-account OAuth and live school-data verification require a user's authorized KRÉTA login; automated checks use mock servers and synthetic accounts. Do not invent successful live verification without a real account.
- Firka is CC BY-NC-SA 4.0. KRETEN supplies no repository license; its logo attribution is preserved in `THIRD_PARTY_NOTICES.md` and no redistribution license is invented.
- KRETEN itself does not implement message sending or consultation reservation (reservation returns 501). Supported capabilities are matched and portal access is clearly indicated.
- Windows installer build is configured in GitHub Actions CI; local runtime validation was executed on Linux (Ubuntu 26.04).

## Live log

- 2026-10-14: Started repository inspection and fetched upstream references. Created this brief before implementation.
- 2026-10-14: Chose Tauri 2: all API calls, credentials, encrypted local state, polling, notifications and tray behavior in Rust; bundled React/TypeScript/CSS for matching KRETEN's glass interface, without a web server or cloud intermediary in the packaged app.
- 2026-10-14: Confirmed Firka Android OAuth client, exact mobile HTTPS redirect, hosted login page, refresh grant and PKCE. Desktop intercepts the redirect in a separate restricted OAuth window; no password form is reimplemented.
- 2026-10-14: Added Cargo workspace, Tauri configuration, restricted main-window capability, native bootstrap and icons derived from the original KRETEN logo. Frontend dependency installation started.
- 2026-10-14: Delegated API/core implementation, frontend implementation, and independent upstream/build audit; root integrates and validates the native shell. Firka's optional FCM/backend relay is deliberately replaced with local desktop polling to satisfy the explicit local-only requirement.
- 2026-10-14: Implemented `src-tauri/src/lib.rs`: restricted IPC, isolated incognito OAuth window, exact callback interception, startup configuration, single-instance reopening, notification dispatch, refresh loop, tray open/refresh/pause/settings/full-quit, and close-to-background. Wiring verified read and write API actions; native compilation still pending core completion.
- 2026-10-14: Rootless GTK/WebKit/AppIndicator development environment is ready under `/tmp/kreten-native-deps/sysroot`; use `scripts/check-native.sh` for builds here. Build CI and dependency installation scripts added by audit worker.
- 2026-10-14: Started Vite preview. Initial dependency audit found advisories; frontend worker upgrading affected tools before validation. Browser preview attachment succeeded after retry.
- 2026-10-14: Rust core now includes official institution discovery, encrypted cache, OS-keyring storage with documented Unix fallback, persisted refresh-token rotation, account management, all verified read routes, contact/bank/LÉP writes, and per-account notification fingerprints. Native dependency compilation passed GTK/WebKit stages; first full checks awaited the remaining sync module.
- 2026-10-14: Added Linux StatusNotifierWatcher detection so × does not hide an app with no tray host; resume triggers refresh promptly and polling respects interval changes. Background refresh uses all accounts without switching the visible account.
- 2026-10-14: Added `README.md` with Linux/Windows setup, build commands, local-storage/security behavior, tray requirements, and runtime verification caveats. Tauri/Vite dev port is `1420`.
- 2026-10-14: Verified attachment downloads are also explicitly portal-only in KRETEN; preserve metadata plus secure official-portal opening rather than fabricate a mobile download endpoint. Added restricted `open_school` native command.
- 2026-10-14: Independent review found startup cache blocked behind network sync; fixed with a separately cached safe Snapshot in the Rust shell. Found OAuth cancellation/reopen race; added scoped cancellation integration. API worker addressing mailbox headers/read-status fingerprints, timetable edge changes, and rollback on failed local persistence.
- 2026-10-14: Public institution-list HTTP probe timed out after 20 seconds in this environment. Cached-list fallback and optional school-less hosted login remain available; do not claim live API verification. Native compile reached application code and exposed async Send lifetime errors; fixing in core before final checks.
- 2026-10-14: `scripts/check-native.sh cargo check --workspace --all-targets` now passes. Started building the actual Linux desktop executable for runtime tray/close/reopen/quit tests. Initial core unit tests pass; expanded synthetic OAuth/refresh/offline/rollback tests are in progress.
- 2026-10-14: Frontend screen implementations are present; finishing shared styles/settings and source-schema corrections before visual QA. Found grouped consultation payloads and school-timezone handling that need explicit normalization tests; sent precise upstream fixtures to frontend worker.
- 2026-10-14: The real Linux binary builds successfully (`cargo build -p kreten-desktop`, rootless native wrapper). Core now passes 15 synthetic tests covering OAuth exchange, refresh rotation, encrypted cache, offline reads, request headers, notification diffing, and persistence failures.
- 2026-10-14: Added account-ID guards to native account-specific read/write commands so an action queued for account A cannot execute against account B. Snapshot publication remains serialized with mutations to avoid stale refresh results switching the visible account.
- 2026-10-14: Linux native runtime smoke passed 11 assertions: startup, registered tray, close hides with process alive, show restores, pause/resume toggles, refresh, second-launch reopening, and full quit. Tested an isolated temporary data directory without credentials.
- 2026-10-14: Frontend initial production build passes; all main screens and 50 KB glass stylesheet are present. Dependency audit is now clean after updating Vitest. Reviewing explicit demo through the collaborative browser.
- 2026-10-14: Added `src/SettingsExtras.tsx` for language, per-category alerts, bell offset, grade estimate thresholds, left/right and configurable navigation, title typography, and original-style two-color animated login background. Native settings schema validates these values. Integrating HU/EN/DE translations and corresponding tray labels.
- 2026-10-14: Rust core now passes 20 tests and strict Clippy. Local preference saves are serialized in the UI so rapid changes cannot discard an earlier change or apply demo settings to real data.
- 2026-10-14: Resumed from previous session. Resolved duplicate export error in `src/i18n.ts` (`currentDateLocale` and `currentLanguageCode`).
- 2026-10-14: Verified test suite: `npm test` passes 15/15 tests in `src/data.test.ts`. `scripts/check-native.sh cargo test --workspace` passes all 22 tests (20 in `kreten-core`, 2 in `kreten-desktop`).
- 2026-10-14: Verified quality checks: `cargo clippy --workspace --all-targets -- -D warnings` passed with 0 warnings, `cargo fmt --all -- --check` passed, `npm run build` passed with zero errors, `npm audit` reported 0 vulnerabilities.
- 2026-10-14: Verified browser UI preview via collaborative browser: tested sign-in page, interactive demo mode, Dashboard, Timetable, Grades, and Settings views with full visual glass design fidelity. Updated `docs/VALIDATION.md` and `tasks.md`.
- 2026-10-14: Added `build_deb.sh` script to streamline building installable Debian/Ubuntu packages (`.deb`) with automated dependency detection (system vs. rootless), build validation, and packaging instructions.
- 2026-10-14: Fixed Debian package name error caused by non-ASCII character in `productName` ("KRETÉN Desktop" -> `kretén-desktop`). Updated `productName` in `tauri.conf.json` to "KRETEN Desktop" (`kreten-desktop` package identifier compliant with Debian Policy) and added `desktop.template` ensuring the application launcher display name remains "KRETÉN Desktop". Rebuilt and verified `target/release/bundle/deb/KRETEN Desktop_0.1.0_amd64.deb`.
- 2026-10-14: Resolved "A KRÉTA szolgáltatás nem elérhető" error: Discovered that KRÉTA IDP and school servers (*.e-kreta.hu) use certificates issued by Microsec e-Szigno signed with ecdsa-with-SHA512 (OID 1.2.840.10045.4.3.4), which rustls does not support. Switched reqwest TLS provider in kreten-core from rustls-tls to default-tls (OpenSSL/native-tls). Handshake succeeds immediately. Updated school directory discovery and search in kreten-core and App.tsx to use live intezmenykereso search fallback without raising network error banners. Successfully rebuilt .deb package.\n- 2026-10-15: Completed all items from user feedback:
  1. Graceful HTTP 403 handling on student accounts for `consultations` and `guardian` endpoints in `crates/kreten-core/src/sync.rs`. Student accounts no longer report these endpoints as sync errors.
  2. Full-year and bounded backup homework loading queries (`datumTol={school_start}` and `today - 30` to `today + 30`) in `crates/kreten-core/src/sync.rs`, plus extended property normalization (`Szoveg`, `Tartalom`, `Leiras`, `IsMegoldva`, `IsHaziFeladatMegoldva`) in `src/data.ts`.
  3. Correct exam ordering in `testRows`: upcoming exams listed closest-first, followed by past exams from most recent down to oldest; added visual badges for upcoming vs. past.
  4. Hidden internal `jegy_50` and `jegy_100` codes from Grades view.
  5. Implemented live lesson status on Dashboard matching KRETÉN: animated horizontal progress fill (`--lesson-progress`), live ticking 1-second countdown with remaining seconds (`"X perc Y mp van hátra"`), and break status between classes.
  6. Dedicated "Feljegyzések" section (`notes`) listing official teacher entries, praises, warnings, homework deficits, and notice board announcements with category filtering and modal details.
  7. Simplified login screen by removing manual school search/institution code input, allowing users to select their school directly in KRÉTA OAuth page.
  8. Verified test suite: 19/19 Vitest tests passing, 20/20 Cargo tests passing, `npm run build` passing with zero errors.
  9. Rebuilt `.deb` package at `target/release/bundle/deb/KRETEN Desktop_0.1.0_amd64.deb` (6.2 MB) with `Package: kreten-desktop` and verified package structure.
- 2026-10-15: Removed redundant small progress bar under the countdown timer in `src/pages.tsx`, preserving only the single card-filling background progress bar (`.lesson-fill`) exactly as in KRETÉN. Verified via `npm test` (19/19 passing), `npm run build`, and rebuilt `target/release/bundle/deb/KRETEN Desktop_0.1.0_amd64.deb`.
- 2026-11-09: Class averages (`OsztalyAtlagok`) no longer fail the whole bucket with HTTP 500: query-form fallbacks, school visibility flag, server refusals keep the cache silently (see docs/API.md). Synthetic wiremock test added; not yet verified against a live account.
- 2026-11-09: Added persisted `uiStyle` setting (glass/pixel/hyperos/material), a dedicated Theme page holding all appearance settings, `src/themes.css` for the three new designs, bundled OFL Pixelify Sans for the Pixel design, and a Progress page (`src/progress.ts`) for week / next break / school-year countdowns from KRÉTA `TanevRendjeElemek` with flagged estimates as fallback. `hiddenNav` now also accepts `notes` (previously rejected by the core despite the UI offering it) and `progress`.
