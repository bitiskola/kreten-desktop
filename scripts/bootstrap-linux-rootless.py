#!/usr/bin/env python3
"""Extract Ubuntu/Debian build dependencies without modifying the host.

This is a development fallback for hosts with the runtime libraries installed
but without their headers. It is not a portable SDK or a packaging environment.
apt-get uses the host's authenticated package indexes and verifies downloads.
"""

import json
import os
from pathlib import Path
import re
import subprocess


def main():
    root = Path(os.environ.get("KRETEN_NATIVE_DEPS", "/tmp/kreten-native-deps")).resolve()
    archives = root / "archives"
    sysroot = root / "sysroot"
    archives.mkdir(parents=True, exist_ok=True)
    dependencies = [
        "libwebkit2gtk-4.1-dev",
        "libgtk-3-dev",
        "libayatana-appindicator3-dev",
        "librsvg2-dev",
        "patchelf",
    ]
    plan = subprocess.check_output(
        ["apt-get", "-s", "--no-install-recommends", "install", *dependencies],
        text=True,
        env={**os.environ, "LC_ALL": "C"},
    )
    packages = []
    for line in plan.splitlines():
        match = re.match(r"Inst (\S+)(?: \[[^]]+\])? \((\S+)", line)
        if match:
            packages.append(f"{match[1]}={match[2]}")
    if not packages:
        print("All requested packages are already installed; no sysroot needed.")
        return
    (root / "packages.json").write_text(json.dumps(packages, indent=2) + "\n")
    print(f"Downloading {len(packages)} package archives into {archives}", flush=True)
    subprocess.run(["apt-get", "download", *packages], cwd=archives, check=True)
    # Extract only the current download plan, so old cached archives cannot
    # replace newer libraries if this script is rerun after a host upgrade.
    planned = {entry.split("=", 1)[0].split(":", 1)[0] for entry in packages}
    for archive in sorted(archives.glob("*.deb")):
        name = archive.name.split("_", 1)[0]
        if name not in planned:
            continue
        version = subprocess.check_output(
            ["dpkg-deb", "-f", str(archive), "Version"], text=True
        ).strip()
        if not any(item.split("=", 1)[1] == version and item.split("=", 1)[0].split(":", 1)[0] == name for item in packages):
            continue
        subprocess.run(["dpkg-deb", "-x", str(archive), str(sysroot)], check=True)
    # Development .so links normally point at their separately installed
    # runtime package. Reuse that exact host file when it exists.
    for link in (sysroot / "usr/lib").rglob("*"):
        if link.is_symlink() and not link.exists():
            host = Path("/") / link.relative_to(sysroot)
            candidate = host if host.exists() else host.parent / link.readlink()
            if candidate.exists():
                resolved = candidate.resolve()
                link.unlink()
                link.symlink_to(resolved)
    print(f"Prepared {sysroot}; run scripts/check-native.sh")


if __name__ == "__main__":
    main()
