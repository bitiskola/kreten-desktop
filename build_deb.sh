#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# build_deb.sh - Build an installable Debian/Ubuntu package (.deb) for KRETÉN Desktop
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}${BOLD}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $*"; }
warn() { echo -e "${YELLOW}${BOLD}[WARNING]${NC} $*"; }
error() { echo -e "${RED}${BOLD}[ERROR]${NC} $*" >&2; }

show_help() {
  cat <<EOF
Usage: ./build_deb.sh [OPTIONS]

Builds a production Debian/Ubuntu package (.deb) for KRETÉN Desktop using Tauri.

Options:
  -o, --output <dir>    Copy the generated .deb package to the specified directory.
  -c, --clean           Clean the release target before building.
  -d, --debug           Build in debug mode instead of release.
      --skip-tests      Skip running frontend and cargo tests prior to building.
  -h, --help            Show this help message.

Requirements:
  - Node.js (>= 18) and npm
  - Rust & Cargo (1.80+)
  - Linux GTK-3, WebKitGTK 4.1, Ayatana AppIndicator libraries
    (or rootless dev sysroot prepared via scripts/bootstrap-linux-rootless.py)
EOF
}

OUTPUT_DIR=""
CLEAN=false
DEBUG=false
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    -c|--clean)
      CLEAN=true
      shift
      ;;
    -d|--debug)
      DEBUG=true
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

info "Starting KRETÉN Desktop .deb package build..."

# 1. Check basic CLI tools
for tool in node npm cargo rustc pkg-config; do
  if ! command -v "$tool" &>/dev/null; then
    error "Required command '$tool' was not found in PATH."
    exit 1
  fi
done

# 2. Setup native build environment (system libraries or rootless sysroot fallback)
NATIVE_ROOT="${KRETEN_NATIVE_DEPS:-/tmp/kreten-native-deps}/sysroot"
if [[ -d "$NATIVE_ROOT/usr/lib" ]]; then
  info "Configuring rootless native dependency sysroot at $NATIVE_ROOT..."
  MULTIARCH="$(gcc -print-multiarch 2>/dev/null || echo "x86_64-linux-gnu")"
  NATIVE_LIB="$NATIVE_ROOT/usr/lib/$MULTIARCH"
  export PKG_CONFIG_PATH="$NATIVE_LIB/pkgconfig:$NATIVE_ROOT/usr/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
  export PKG_CONFIG_SYSROOT_DIR="$NATIVE_ROOT"
  export LIBRARY_PATH="$NATIVE_LIB${LIBRARY_PATH:+:$LIBRARY_PATH}"
  export PATH="$NATIVE_ROOT/usr/bin:$PATH"
fi

# Verify pkg-config finds the necessary libraries
MISSING_PKGS=()
for pkg in gtk+-3.0 webkit2gtk-4.1 ayatana-appindicator3-0.1; do
  if ! pkg-config --exists "$pkg" 2>/dev/null; then
    MISSING_PKGS+=("$pkg")
  fi
done

if [[ ${#MISSING_PKGS[@]} -gt 0 ]]; then
  warn "Missing required pkg-config libraries: ${MISSING_PKGS[*]}"
  if [[ -f "scripts/bootstrap-linux-rootless.py" ]] && ! [[ -d "$NATIVE_ROOT/usr/lib" ]]; then
    info "Attempting rootless dependency bootstrap via scripts/bootstrap-linux-rootless.py..."
    python3 scripts/bootstrap-linux-rootless.py
    if [[ -d "$NATIVE_ROOT/usr/lib" ]]; then
      MULTIARCH="$(gcc -print-multiarch 2>/dev/null || echo "x86_64-linux-gnu")"
      NATIVE_LIB="$NATIVE_ROOT/usr/lib/$MULTIARCH"
      export PKG_CONFIG_PATH="$NATIVE_LIB/pkgconfig:$NATIVE_ROOT/usr/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
      export PKG_CONFIG_SYSROOT_DIR="$NATIVE_ROOT"
      export LIBRARY_PATH="$NATIVE_LIB${LIBRARY_PATH:+:$LIBRARY_PATH}"
      export PATH="$NATIVE_ROOT/usr/bin:$PATH"
    fi
  fi

  # Check again
  REMAINING_MISSING=()
  for pkg in "${MISSING_PKGS[@]}"; do
    if ! pkg-config --exists "$pkg" 2>/dev/null; then
      REMAINING_MISSING+=("$pkg")
    fi
  done

  if [[ ${#REMAINING_MISSING[@]} -gt 0 ]]; then
    error "Could not resolve pkg-config packages: ${REMAINING_MISSING[*]}"
    echo -e "Please install the system development packages using:"
    echo -e "    ${BOLD}./scripts/install-linux-deps.sh${NC}"
    echo -e "or (on Ubuntu/Debian):"
    echo -e "    ${BOLD}sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev${NC}"
    exit 1
  fi
fi

# 3. Ensure frontend dependencies are installed
if [[ ! -d "node_modules" ]]; then
  info "Installing npm dependencies (node_modules not found)..."
  npm ci
fi

# 4. Run tests if requested
if [[ "$SKIP_TESTS" = false ]]; then
  info "Running frontend tests..."
  npm test
fi

# 5. Optional clean
MODE_DIR="release"
EXTRA_ARGS=()
if [[ "$DEBUG" = true ]]; then
  MODE_DIR="debug"
  EXTRA_ARGS+=("--debug")
fi

if [[ "$CLEAN" = true ]]; then
  info "Cleaning previous build artifacts..."
  cargo clean -p kreten-desktop
  rm -rf "target/$MODE_DIR/bundle/deb"
fi

# 6. Build Tauri application deb package
info "Building .deb bundle via Tauri ($MODE_DIR mode)..."
npm run tauri build -- --bundles deb "${EXTRA_ARGS[@]}"

# 7. Locate generated .deb
DEB_DIR="target/$MODE_DIR/bundle/deb"
DEB_FILE="$(find "$DEB_DIR" -maxdepth 1 -type f -name "*.deb" 2>/dev/null | head -n 1 || true)"

if [[ -z "$DEB_FILE" || ! -f "$DEB_FILE" ]]; then
  error "Build completed but .deb file was not found in $DEB_DIR."
  exit 1
fi

DEB_NAME="$(basename "$DEB_FILE")"
DEB_SIZE="$(du -h "$DEB_FILE" | cut -f1)"
SHA256="$(sha256sum "$DEB_FILE" | awk '{print $1}')"

# 8. Copy to output directory if specified
FINAL_PATH="$DEB_FILE"
if [[ -n "$OUTPUT_DIR" ]]; then
  mkdir -p "$OUTPUT_DIR"
  cp "$DEB_FILE" "$OUTPUT_DIR/$DEB_NAME"
  FINAL_PATH="$OUTPUT_DIR/$DEB_NAME"
  info "Copied package to $FINAL_PATH"
fi

echo ""
success "=========================================================="
success " KRETÉN Desktop .deb package built successfully!"
success "=========================================================="
echo -e "${BOLD}File:${NC}     $FINAL_PATH"
echo -e "${BOLD}Size:${NC}     $DEB_SIZE"
echo -e "${BOLD}SHA256:${NC}   $SHA256"
echo ""
echo -e "To install the package on Ubuntu/Debian:"
echo -e "    ${GREEN}${BOLD}sudo apt install ./${FINAL_PATH}${NC}"
echo -e "or:"
echo -e "    ${GREEN}${BOLD}sudo dpkg -i ./${FINAL_PATH}${NC}"
echo -e "    ${GREEN}${BOLD}sudo apt-get install -f${NC}  # to resolve any missing runtime dependencies"
echo ""
