#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# build_dmg.sh - Build a macOS Drag-and-Drop DMG (.dmg) for KRETÉN Desktop
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
Usage: ./build_dmg.sh [OPTIONS]

Builds a macOS application (.app) and packages it into a drag-and-drop Apple Disk Image (.dmg)
for KRETÉN Desktop using Tauri.

Options:
  -o, --output <dir>        Copy the generated .dmg package to the specified directory.
  -c, --clean               Clean previous build artifacts before building.
  -d, --debug               Build in debug mode instead of release.
  -a, --arch <arch>         Target architecture:
                              'arm64' or 'aarch64' (Apple Silicon M1/M2/M3/M4)
                              'x86_64' or 'intel'   (Intel Macs)
                              'universal'          (Both Apple Silicon and Intel)
                              'host'               (Current machine architecture, default)
  -t, --target <triple>     Explicit Rust target triple (e.g. aarch64-apple-darwin,
                            x86_64-apple-darwin, universal-apple-darwin).
      --no-sign             Skip code signing (recommended for local development builds
                            without an Apple Developer ID certificate).
      --skip-tests          Skip running frontend test suite before building.
  -h, --help                Show this help message.

Requirements:
  - macOS (Darwin) host system or macOS runner on GitHub Actions
  - Node.js (>= 18) and npm
  - Rust & Cargo (1.80+)
  - Xcode Command Line Tools ('xcode-select --install')
EOF
}

OUTPUT_DIR=""
CLEAN=false
DEBUG=false
ARCH_CHOICE="host"
TARGET_TRIPLE=""
NO_SIGN=false
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
    -a|--arch)
      ARCH_CHOICE="$2"
      shift 2
      ;;
    -t|--target)
      TARGET_TRIPLE="$2"
      shift 2
      ;;
    --no-sign|--skip-signing)
      NO_SIGN=true
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

info "Starting KRETÉN Desktop macOS drag-and-drop DMG build..."

# 1. Platform verification
OS_NAME="$(uname -s)"
if [[ "$OS_NAME" != "Darwin" ]]; then
  warn "Current OS is $OS_NAME, not Darwin (macOS)."
  warn "Building macOS application bundles (.app) and DMG disk images requires Apple native tools ('hdiutil', 'lipo', Darwin SDK)."
  echo ""
  echo -e "${YELLOW}To build the DMG on macOS:${NC}"
  echo -e "    1. Clone this repository on a Mac (or checkout via GitHub Actions on 'macos-latest')."
  echo -e "    2. Run: ${BOLD}./build_dmg.sh${NC}"
  echo ""
  echo -e "If you are running in CI (GitHub Actions), ensure your job runs on ${BOLD}macos-latest${NC}."
  error "Aborting DMG build on non-macOS host."
  exit 1
fi

# 2. Check CLI tools
for tool in node npm cargo rustc; do
  if ! command -v "$tool" &>/dev/null; then
    error "Required command '$tool' was not found in PATH."
    exit 1
  fi
done

# Check Xcode tools
if ! command -v xcode-select &>/dev/null || ! xcode-select -p &>/dev/null; then
  warn "Xcode Command Line Tools may be missing. Run: xcode-select --install"
fi

# 3. Resolve target architecture
if [[ -z "$TARGET_TRIPLE" ]]; then
  case "$ARCH_CHOICE" in
    arm64|aarch64)
      TARGET_TRIPLE="aarch64-apple-darwin"
      ;;
    x86_64|intel)
      TARGET_TRIPLE="x86_64-apple-darwin"
      ;;
    universal)
      TARGET_TRIPLE="universal-apple-darwin"
      ;;
    host)
      HOST_ARCH="$(uname -m)"
      if [[ "$HOST_ARCH" == "arm64" ]]; then
        TARGET_TRIPLE="aarch64-apple-darwin"
      else
        TARGET_TRIPLE="x86_64-apple-darwin"
      fi
      ;;
    *)
      error "Unknown architecture choice: $ARCH_CHOICE. Use 'arm64', 'intel', 'universal', or 'host'."
      exit 1
      ;;
  esac
fi

info "Selected target triple: $TARGET_TRIPLE"

# 4. Verify/install Rust targets via rustup
if command -v rustup &>/dev/null; then
  if [[ "$TARGET_TRIPLE" == "universal-apple-darwin" ]]; then
    # Universal builds require both aarch64 and x86_64 toolchains
    for req_target in aarch64-apple-darwin x86_64-apple-darwin; do
      if ! rustup target list --installed | grep -q "^${req_target}$"; then
        info "Adding required Rust target '$req_target' for universal build..."
        rustup target add "$req_target" || warn "Could not add '$req_target' via rustup."
      fi
    done
  else
    if ! rustup target list --installed | grep -q "^${TARGET_TRIPLE}$"; then
      info "Adding required Rust target '$TARGET_TRIPLE'..."
      rustup target add "$TARGET_TRIPLE" || warn "Could not add '$TARGET_TRIPLE' via rustup."
    fi
  fi
fi

# 5. Verify macOS icon exists
ICNS_FILE="src-tauri/icons/icon.icns"
if [[ ! -f "$ICNS_FILE" ]]; then
  if [[ -f "src-tauri/icons/icon.png" ]]; then
    info "Generating macOS icon ($ICNS_FILE) from src-tauri/icons/icon.png..."
    npx tauri icon src-tauri/icons/icon.png
  else
    warn "macOS icon '$ICNS_FILE' not found. Bundle will use default Tauri icon."
  fi
fi

# 6. Ensure frontend dependencies are installed
if [[ ! -d "node_modules" ]]; then
  info "Installing npm dependencies (node_modules not found)..."
  npm ci
fi

# 7. Run tests
if [[ "$SKIP_TESTS" = false ]]; then
  info "Running frontend tests..."
  npm test
fi

# 8. Clean handling
MODE_DIR="release"
EXTRA_ARGS=()
if [[ "$DEBUG" = true ]]; then
  MODE_DIR="debug"
  EXTRA_ARGS+=("--debug")
fi

if [[ "$NO_SIGN" = true ]]; then
  EXTRA_ARGS+=("--no-sign")
fi

if [[ -n "$TARGET_TRIPLE" ]]; then
  EXTRA_ARGS+=("--target" "$TARGET_TRIPLE")
fi

if [[ "$CLEAN" = true ]]; then
  info "Cleaning previous build artifacts..."
  cargo clean -p kreten-desktop
  rm -rf "target/$MODE_DIR/bundle/dmg" "target/$MODE_DIR/bundle/macos"
  rm -rf "target/$TARGET_TRIPLE/$MODE_DIR/bundle/dmg" "target/$TARGET_TRIPLE/$MODE_DIR/bundle/macos"
fi

# 9. Build Tauri DMG package
info "Building macOS drag-and-drop DMG via Tauri ($MODE_DIR mode)..."
npm run tauri build -- --bundles dmg "${EXTRA_ARGS[@]}"

# 10. Locate generated .dmg
SEARCH_DIRS=(
  "target/$TARGET_TRIPLE/$MODE_DIR/bundle/dmg"
  "target/$MODE_DIR/bundle/dmg"
  "target/bundle/dmg"
)

DMG_FILE=""
for dir in "${SEARCH_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    DMG_FILE="$(ls -1t "$dir"/*.dmg 2>/dev/null | head -n 1 || true)"
    if [[ -n "$DMG_FILE" && -f "$DMG_FILE" ]]; then
      break
    fi
  fi
done

if [[ -z "$DMG_FILE" || ! -f "$DMG_FILE" ]]; then
  error "Build finished but .dmg file was not found in expected target directories:"
  for dir in "${SEARCH_DIRS[@]}"; do
    echo "  - $dir"
  done
  exit 1
fi

DMG_NAME="$(basename "$DMG_FILE")"
DMG_SIZE="$(du -h "$DMG_FILE" | cut -f1)"

SHA256=""
if command -v shasum &>/dev/null; then
  SHA256="$(shasum -a 256 "$DMG_FILE" | awk '{print $1}')"
elif command -v sha256sum &>/dev/null; then
  SHA256="$(sha256sum "$DMG_FILE" | awk '{print $1}')"
fi

# 11. Copy to output directory if specified
FINAL_PATH="$DMG_FILE"
if [[ -n "$OUTPUT_DIR" ]]; then
  mkdir -p "$OUTPUT_DIR"
  cp "$DMG_FILE" "$OUTPUT_DIR/$DMG_NAME"
  FINAL_PATH="$OUTPUT_DIR/$DMG_NAME"
  info "Copied DMG to $FINAL_PATH"
fi

echo ""
success "=========================================================="
success " KRETÉN Desktop macOS Drag-and-Drop DMG built successfully!"
success "=========================================================="
echo -e "${BOLD}File:${NC}     $FINAL_PATH"
echo -e "${BOLD}Size:${NC}     $DMG_SIZE"
if [[ -n "$SHA256" ]]; then
  echo -e "${BOLD}SHA256:${NC}   $SHA256"
fi
echo ""
echo -e "To install on macOS:"
echo -e "    1. Double click the DMG or run in terminal:"
echo -e "       ${GREEN}${BOLD}hdiutil attach \"$FINAL_PATH\"${NC}"
echo -e "    2. Drag ${BOLD}KRETÉN Desktop.app${NC} into the ${BOLD}/Applications${NC} folder shortcut."
echo -e "    3. Unmount the DMG image:"
echo -e "       ${GREEN}${BOLD}hdiutil detach /Volumes/\"KRETEN Desktop\"${NC}"
echo ""
