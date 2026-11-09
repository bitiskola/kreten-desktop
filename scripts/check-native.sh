#!/usr/bin/env bash
set -euo pipefail

# Normal installations need no overrides. A rootless development sysroot can
# instead be prepared with bootstrap-linux-rootless.py on Debian/Ubuntu.
native_root="${KRETEN_NATIVE_DEPS:-/tmp/kreten-native-deps}/sysroot"
if [[ -d "$native_root/usr/lib" ]]; then
  multiarch="$(gcc -print-multiarch)"
  native_lib="$native_root/usr/lib/$multiarch"
  export PKG_CONFIG_PATH="$native_lib/pkgconfig:$native_root/usr/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
  export PKG_CONFIG_SYSROOT_DIR="$native_root"
  export LIBRARY_PATH="$native_lib${LIBRARY_PATH:+:$LIBRARY_PATH}"
  export PATH="$native_root/usr/bin:$PATH"
fi

if [[ $# -gt 0 ]]; then
  exec "$@"
fi
exec cargo check --workspace --all-targets
