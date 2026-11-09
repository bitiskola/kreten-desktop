#!/usr/bin/env bash
set -euo pipefail

# Ubuntu 22.04+ / Debian with WebKitGTK 4.1. Run this explicitly to install
# system dependencies; the rootless check helper never invokes this script.
if [[ "$(id -u)" -eq 0 ]]; then
  privilege=()
else
  privilege=(sudo)
fi
"${privilege[@]}" apt-get update
"${privilege[@]}" apt-get install --yes --no-install-recommends \
  build-essential curl wget file pkg-config libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf
