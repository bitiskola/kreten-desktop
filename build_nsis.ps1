<#
.SYNOPSIS
    Builds a Windows NSIS installer (.exe) for KRETÉN Desktop using Tauri.

.DESCRIPTION
    This script verifies build prerequisites, installs npm dependencies,
    runs test suites, and bundles KRETÉN Desktop into a self-contained
    NSIS setup installer for Windows.

.PARAMETER OutputDir
    Optional directory where the generated .exe installer should be copied.

.PARAMETER Clean
    Cleans previous build artifacts before building.

.PARAMETER DebugBuild
    Builds the debug binary and installer instead of release.

.PARAMETER TargetTriple
    Custom Rust target triple (default: x86_64-pc-windows-msvc).

.PARAMETER SkipTests
    Skips frontend test execution prior to building.

.EXAMPLE
    .\build_nsis.ps1
    .\build_nsis.ps1 -OutputDir .\dist\windows -Clean
    .\build_nsis.ps1 -TargetTriple x86_64-pc-windows-msvc
#>

[CmdletBinding()]
param (
    [Alias("o")]
    [string]$OutputDir = "",

    [Alias("c")]
    [switch]$Clean,

    [Alias("d")]
    [switch]$DebugBuild,

    [Alias("t")]
    [string]$TargetTriple = "",

    [switch]$SkipTests,

    [Alias("h")]
    [switch]$Help
)

$ErrorActionPreference = "Stop"

function Write-Info    { Write-Host "[INFO] " -ForegroundColor Cyan -NoNewline; Write-Host $args }
function Write-Success { Write-Host "[SUCCESS] " -ForegroundColor Green -NoNewline; Write-Host $args }
function Write-Warn    { Write-Host "[WARNING] " -ForegroundColor Yellow -NoNewline; Write-Host $args }
function Write-ErrorMsg { Write-Host "[ERROR] " -ForegroundColor Red -NoNewline; Write-Host $args }

if ($Help) {
    Get-Help $MyInvocation.MyCommand.Path -Detailed
    exit 0
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Info "Starting KRETÉN Desktop Windows NSIS installer build..."

# 1. Verify required CLI tools
$RequiredTools = @("node", "npm", "cargo", "rustc")
foreach ($tool in $RequiredTools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-ErrorMsg "Required tool '$tool' was not found in PATH."
        Write-Host "Please install Node.js (https://nodejs.org) and Rust (https://rustup.rs)."
        exit 1
    }
}

# 2. Configure target triple
if (-not $TargetTriple) {
    # If on 64-bit Windows, default to x86_64-pc-windows-msvc
    if ([IntPtr]::Size -eq 8) {
        $TargetTriple = "x86_64-pc-windows-msvc"
    } else {
        $TargetTriple = "i686-pc-windows-msvc"
    }
}
Write-Info "Target triple: $TargetTriple"

# Check if target is installed via rustup
if (Get-Command rustup -ErrorAction SilentlyContinue) {
    $installedTargets = & rustup target list --installed
    if ($installedTargets -notcontains $TargetTriple) {
        Write-Info "Adding Rust target '$TargetTriple' via rustup..."
        & rustup target add $TargetTriple
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Could not automatically add target '$TargetTriple'. Proceeding with installed toolchain..."
        }
    }
}

# 3. Ensure frontend dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Info "Installing npm dependencies (node_modules not found)..."
    & npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "npm ci failed."
        exit 1
    }
}

# 4. Run tests
if (-not $SkipTests) {
    Write-Info "Running frontend test suite..."
    & npm test
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Tests failed. Fix test failures or pass -SkipTests to bypass."
        exit 1
    }
}

# 5. Handle clean build
$ModeDir = if ($DebugBuild) { "debug" } else { "release" }

if ($Clean) {
    Write-Info "Cleaning previous build artifacts..."
    & cargo clean -p kreten-desktop
    $nsisCleanPaths = @(
        "target\$ModeDir\bundle\nsis",
        "target\$TargetTriple\$ModeDir\bundle\nsis"
    )
    foreach ($p in $nsisCleanPaths) {
        if (Test-Path $p) { Remove-Item -Recurse -Force $p }
    }
}

# 6. Execute Tauri NSIS build
Write-Info "Building Windows NSIS installer via Tauri ($ModeDir mode)..."

$tauriArgs = @("run", "tauri", "build", "--", "--bundles", "nsis")
if ($DebugBuild) {
    $tauriArgs += "--debug"
}
if ($TargetTriple) {
    $tauriArgs += @("--target", $TargetTriple)
}

& npm @tauriArgs
if ($LASTEXITCODE -ne 0) {
    Write-ErrorMsg "Tauri NSIS build failed."
    exit 1
}

# 7. Locate generated NSIS installer (.exe)
$SearchDirs = @(
    "target\$TargetTriple\$ModeDir\bundle\nsis",
    "target\$ModeDir\bundle\nsis",
    "target\bundle\nsis"
)

$InstallerFile = $null
foreach ($dir in $SearchDirs) {
    if (Test-Path $dir) {
        $found = Get-ChildItem -Path $dir -Filter "*setup*.exe" -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $found) {
            $found = Get-ChildItem -Path $dir -Filter "*.exe" -File -ErrorAction SilentlyContinue | Select-Object -First 1
        }
        if ($found) {
            $InstallerFile = $found.FullName
            break
        }
    }
}

if (-not $InstallerFile -or -not (Test-Path $InstallerFile)) {
    Write-ErrorMsg "Build completed but NSIS .exe installer was not found in expected target directories:"
    $SearchDirs | ForEach-Object { Write-Host "   - $_" }
    exit 1
}

$InstallerItem = Get-Item $InstallerFile
$InstallerName = $InstallerItem.Name
$InstallerSize = "{0:N2} MB" -f ($InstallerItem.Length / 1MB)
$InstallerHash = (Get-FileHash -Path $InstallerFile -Algorithm SHA256).Hash

# 8. Copy to OutputDir if specified
$FinalPath = $InstallerFile
if ($OutputDir) {
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    $FinalPath = Join-Path $OutputDir $InstallerName
    Copy-Item -Path $InstallerFile -Destination $FinalPath -Force
    Write-Info "Copied installer to $FinalPath"
}

Write-Host ""
Write-Success "=========================================================="
Write-Success " KRETÉN Desktop Windows NSIS installer built successfully!"
Write-Success "=========================================================="
Write-Host "File:       $FinalPath" -ForegroundColor White
Write-Host "Size:       $InstallerSize" -ForegroundColor White
Write-Host "SHA256:     $InstallerHash" -ForegroundColor White
Write-Host ""
Write-Host "To install interactively:"
Write-Host "    Start-Process `"$FinalPath`"" -ForegroundColor Green
Write-Host "To install silently (unattended):"
Write-Host "    Start-Process `"$FinalPath`" -ArgumentList `"/S`" -Wait" -ForegroundColor Green
Write-Host ""
