#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# build_nsis.sh - Build a Windows NSIS installer (.exe) for KRETÉN Desktop
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
Usage: ./build_nsis.sh [OPTIONS]

Builds a Windows NSIS setup installer (.exe) for KRETÉN Desktop using Tauri.

Options:
  -o, --output <dir>        Copy the generated .exe installer to the specified directory.
  -c, --clean               Clean previous build artifacts before building.
  -d, --debug               Build in debug mode instead of release.
  -t, --target <triple>     Custom Rust target triple (default: x86_64-pc-windows-msvc).
      --skip-tests          Skip running frontend test suite before building.
  -h, --help                Show this help message.

Requirements:
  - Node.js (>= 18) and npm
  - Rust & Cargo (1.80+) with Windows MSVC/GNU target installed
  - Windows environment (or Windows runner on GitHub Actions / GitLab CI)
EOF
}

OUTPUT_DIR=""
CLEAN=false
DEBUG=false
TARGET_TRIPLE=""
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
    -t|--target)
      TARGET_TRIPLE="$2"
      shift 2
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

info "Starting KRETÉN Desktop Windows NSIS installer build..."

# 1. Check CLI tools
for tool in node npm cargo rustc; do
  if ! command -v "$tool" &>/dev/null; then
    error "Required command '$tool' was not found in PATH."
    exit 1
  fi
done

# 2. Determine target triple
DEFAULT_TARGET="x86_64-pc-windows-msvc"
if [[ -z "$TARGET_TRIPLE" ]]; then
  TARGET_TRIPLE="$DEFAULT_TARGET"
fi
info "Target triple: $TARGET_TRIPLE"

# Check target in rustup if rustup is available
if command -v rustup &>/dev/null; then
  if ! rustup target list --installed | grep -q "^${TARGET_TRIPLE}$"; then
    info "Installing Rust target '$TARGET_TRIPLE' via rustup..."
    rustup target add "$TARGET_TRIPLE" || warn "Could not add '$TARGET_TRIPLE' via rustup. Continuing..."
  fi
fi

# 3. Ensure frontend dependencies are installed
if [[ ! -d "node_modules" ]]; then
  info "Installing npm dependencies (node_modules not found)..."
  npm ci
fi

# 4. Run tests
if [[ "$SKIP_TESTS" = false ]]; then
  info "Running frontend tests..."
  npm test
fi

# 5. Clean handling
MODE_DIR="release"
EXTRA_ARGS=()
if [[ "$DEBUG" = true ]]; then
  MODE_DIR="debug"
  EXTRA_ARGS+=("--debug")
fi

if [[ -n "$TARGET_TRIPLE" ]]; then
  EXTRA_ARGS+=("--target" "$TARGET_TRIPLE")
fi

if [[ "$CLEAN" = true ]]; then
  info "Cleaning previous build artifacts..."
  cargo clean -p kreten-desktop
  rm -rf "target/$MODE_DIR/bundle/nsis"
  rm -rf "target/$TARGET_TRIPLE/$MODE_DIR/bundle/nsis"
fi

# 6. Execute Tauri build for NSIS bundle
info "Building Windows NSIS installer via Tauri ($MODE_DIR mode)..."
npm run tauri build -- --bundles nsis "${EXTRA_ARGS[@]}"

# 7. Locate generated .exe
SEARCH_DIRS=(
  "target/$TARGET_TRIPLE/$MODE_DIR/bundle/nsis"
  "target/$MODE_DIR/bundle/nsis"
  "target/bundle/nsis"
)

EXE_FILE=""
for dir in "${SEARCH_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    EXE_FILE="$(find "$dir" -maxdepth 1 -type f -name "*setup*.exe" 2>/dev/null | head -n 1 || true)"
    if [[ -z "$EXE_FILE" ]]; then
      EXE_FILE="$(find "$dir" -maxdepth 1 -type f -name "*.exe" 2>/dev/null | head -n 1 || true)"
    fi
    if [[ -n "$EXE_FILE" && -f "$EXE_FILE" ]]; then
      break
    fi
  fi
done

if [[ -z "$EXE_FILE" || ! -f "$EXE_FILE" ]]; then
  error "Build finished but NSIS .exe installer was not found in expected target directories:"
  for dir in "${SEARCH_DIRS[@]}"; do
    echo "  - $dir"
  done
  exit 1
fi

EXE_NAME="$(basename "$EXE_FILE")"
EXE_SIZE="$(du -h "$EXE_FILE" | cut -f1)"

SHA256=""
if command -v sha256sum &>/dev/null; then
  SHA256="$(sha256sum "$EXE_FILE" | awk '{print $1}')"
elif command -v shasum &>/dev/null; then
  SHA256="$(shasum -a 256 "$EXE_FILE" | awk '{print $1}')"
fi

# 8. Copy to output directory if specified
FINAL_PATH="$EXE_FILE"
if [[ -n "$OUTPUT_DIR" ]]; then
  mkdir -p "$OUTPUT_DIR"
  cp "$EXE_FILE" "$OUTPUT_DIR/$EXE_NAME"
  FINAL_PATH="$OUTPUT_DIR/$EXE_NAME"
  info "Copied installer to $FINAL_PATH"
fi

echo ""
success "=========================================================="
success " KRETÉN Desktop Windows NSIS installer built successfully!"
success "=========================================================="
echo -e "${BOLD}File:${NC}     $FINAL_PATH"
echo -e "${BOLD}Size:${NC}     $EXE_SIZE"
if [[ -n "$SHA256" ]]; then
  echo -e "${BOLD}SHA256:${NC}   $SHA256"
fi
echo ""
echo -e "To install interactively:"
echo -e "    ${GREEN}${BOLD}$FINAL_PATH${NC}"
echo -e "To install silently (unattended):"
echo -e "    ${GREEN}${BOLD}$FINAL_PATH /S${NC}"
echo ""
