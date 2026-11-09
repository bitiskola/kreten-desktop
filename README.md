<p align="center"><img src="public/brand/logo-dark.png" width="138" alt="KRETÉN"></p>

# KRETÉN Desktop

A local-first KRÉTA desktop client for Linux, Windows, and macOS. The Rust application uses Firka's mobile OAuth/API protocol and KRETEN's glass interface and branding. API requests, sessions, cache, background refresh, notifications, and desktop integration run in Rust. The bundled React interface runs inside the operating system's webview; the installed application needs no Python, Node.js, web server, or hosted proxy.

## Run from source

Install Rust (1.90+), Node.js (22.12+), and the platform prerequisites below, then:

```sh
npm ci
npm run tauri dev
```

Linux / Ubuntu prerequisites:

```sh
./scripts/install-linux-deps.sh
```

Windows prerequisites: Microsoft C++ Build Tools with the **Desktop development with C++** workload, the Windows SDK, Rust's MSVC toolchain, and Microsoft Edge WebView2 Runtime. Run the same npm commands in a developer terminal.

macOS prerequisites: Xcode Command Line Tools (`xcode-select --install`), Rust (`rustup target add aarch64-apple-darwin x86_64-apple-darwin`), and Node.js.

### Build installers

Dedicated build scripts are provided for each operating system target:

```sh
# 1. Linux Debian/Ubuntu (.deb package)
./build_deb.sh
# or: npm run build:deb

# 2. Windows NSIS setup installer (.exe)
# In PowerShell on Windows:
.\build_nsis.ps1
# or in Bash / Git Bash / WSL / CI:
./build_nsis.sh
# or: npm run build:nsis

# 3. macOS Drag-and-Drop Apple Disk Image (.dmg)
./build_dmg.sh
# or: npm run build:dmg
```

All build scripts accept options such as `-o/--output <dir>`, `-c/--clean`, and `-d/--debug`. Generated installer packages are placed under `target/release/bundle/` (or your designated output directory). CI automatically builds and validates installers for Linux, Windows, and macOS.

To inspect just the interface in a browser, use `npm run dev` and choose the explicitly labeled demo; authentication and native functions require the desktop app.

## Everyday use

- **Sign in:** select your institution (optional) and open the official KRÉTA login. It appears unchanged in its own private window. The app uses the same Android OAuth client, scopes, redirect URI, authorization-code exchange and refresh grant as Firka, with a fresh PKCE verifier and state for each attempt. Your password is handled by KRÉTA's page.
- **Background operation:** the main window's × hides it. The tray icon can reopen it, refresh now, pause background refresh, open settings, or fully quit. Launching the app again brings the existing instance forward.
- **Notifications:** Rust periodically checks school data independently of the window. The first successful sync establishes a silent baseline; later changes produce native notifications and a local notification history. This is local polling, not a Firebase relay. The default interval is five minutes and is configurable.
- **Ubuntu top bar:** Ubuntu's AppIndicator extension displays the tray menu. On other GNOME installations, enable the AppIndicator/KStatusNotifierItem extension. If tray creation fails, closing the window quits instead of leaving an inaccessible process.
- **Windows tray:** the icon may initially appear in the notification-area overflow. Native toast behavior should be checked from the installed app, since development executables can have different notification identity.
- **Autostart:** enable launch at login in settings. The app can start minimized and continue checking while the window is hidden. A sleeping or powered-off computer cannot poll; refreshing resumes after wake/start.
- **Offline use:** the latest successfully fetched data stays available. Individual unavailable school APIs report their errors while other sections remain usable.
- **Homework checkboxes:** completion is a local personal checklist; it does not submit work to a teacher.

## Local data and security

The application stores account tokens, cached data, preferences, and notification history in an authenticated encrypted store inside the OS application-local-data directory for `hu.kreten.desktop` (typically `$XDG_DATA_HOME/hu.kreten.desktop` or `~/.local/share/hu.kreten.desktop` on Linux and `%LOCALAPPDATA%\hu.kreten.desktop` on Windows).

The encryption key is held in the OS credential store. On Unix systems without an available Secret Service, a clearly reported fallback uses a separate local key file with mode `0600` inside a `0700` directory. That fallback protects against other OS users, not software already running as you. Windows requires the credential store. Do not delete or move the key independently of the encrypted store. Logging out removes the account's locally stored session and school data; it does not revoke sessions in other KRÉTA apps.

Tokens never enter the interface, browser storage, logs, or URLs sent to a third-party service. The OAuth window has no desktop IPC capabilities. The application has no analytics, hosted account service, Firebase registration, or cloud sync. School API requests and the hosted authentication page necessarily communicate with KRÉTA.

## Development and verification

```sh
cargo test -p kreten-core
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
npm test
npm run build
npm audit
```

On a Debian/Ubuntu development machine without sudo, `python3 scripts/bootstrap-linux-rootless.py` extracts development packages into `/tmp/kreten-native-deps`. Then prefix native cargo/npm commands with `scripts/check-native.sh`. This is a development convenience, not an installer or runtime dependency bundle.

See [tasks.md](tasks.md) for the live implementation handoff and exact validation status, [feature coverage](docs/FEATURES.md), [upstream provenance](docs/UPSTREAM.md), and [third-party notices](THIRD_PARTY_NOTICES.md). Do not infer live account or Windows runtime verification from a passing unit test or Linux build. The referenced KRETEN snapshot has no blanket license; consult the notices before redistribution.
