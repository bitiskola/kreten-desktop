# Validation record

This file records checks actually performed, separately from the intended
feature matrix in [FEATURES.md](FEATURES.md). Date: 2026-10-14.

## Build environment

- Host: Ubuntu 26.04, x86-64, GNOME Wayland session with XWayland available.
- Session services: `org.kde.StatusNotifierWatcher` and
  `org.freedesktop.Notifications` both present on the user's session bus.
- Native development packages were downloaded through apt and extracted under
  `/tmp/kreten-native-deps/sysroot`, without installing packages into the host.
  The package archives totaled approximately 29 MiB; extracted SDK and archives
  occupied approximately 174 MiB.
- `pkg-config` reported GTK 3.24.52, WebKitGTK 2.52.6 (API 4.1), and Ayatana
  AppIndicator 0.5.94 through `scripts/check-native.sh`.

## Completed checks

| Check | Result |
| --- | --- |
| `bash -n scripts/check-native.sh scripts/install-linux-deps.sh` | Passed |
| Python syntax check for `scripts/bootstrap-linux-rootless.py` | Passed |
| Native GTK/WebKit/AppIndicator pkg-config resolution | Passed |
| `scripts/check-native.sh cargo check --workspace --all-targets` | Passed, including the Tauri shell and core test compilation |
| `scripts/check-native.sh cargo build -p kreten-desktop` | Passed; linked Linux debug executable, 1m 52s |
| `scripts/check-native.sh cargo test --workspace` | Passed; 22/22 tests (20 in kreten-core, 2 in kreten-desktop) |
| `scripts/check-native.sh cargo clippy --workspace --all-targets -- -D warnings` | Passed with zero warnings |
| `cargo fmt --all -- --check` | Passed |
| `npm test` | Passed; 15/15 unit/transform tests in `src/data.test.ts` |
| `npm run build` | Passed; TypeScript typecheck + Vite production bundle |
| `npm audit` | Passed; 0 vulnerabilities found |
| Browser preview UI inspection | Passed; verified login, demo mode, dashboard, timetable, grades, settings |
| GitHub Actions workflow YAML parsing | Passed; both platform matrix entries and package targets present |
| Native Linux startup and AppIndicator registration | Passed in an isolated data directory |
| Main-window close keeps process running and hides window | Passed using a scoped window-manager close request |
| Tray Show restores hidden window | Passed |
| Tray Pause / Resume updates check state | Passed |
| Tray Refresh on an unauthenticated instance | Passed; process remained responsive |
| Second launch exits and reopens the original instance | Passed |
| Tray Quit fully stops the process | Passed |

The native smoke used `GDK_BACKEND=x11` inside the GNOME Wayland session, the
real Ayatana AppIndicator D-Bus menu, and `wmctrl` scoped to the application's
window. All eleven assertions passed. Its temporary data and evidence directory
was `/tmp/kreten-native-smoke-l4srbmft`; no personal account was used. The only
native log output was an upstream Ayatana deprecation warning. This checks
XWayland desktop behavior, not every Linux compositor or native Wayland path.

## Pending runtime/package checks

The GitHub Actions workflow is configured to test and build Linux Debian/AppImage
packages and a Windows NSIS installer, but a workflow file is not evidence that
remote CI has run.

No real account credentials have been supplied. Successful authentication,
refresh-token rotation against KRÉTA, school-specific data, and authenticated
write actions require live verification by the account owner. Automated core
tests use loopback mock endpoints and synthetic accounts only. Windows shell
behavior and installer execution also require a Windows machine.
