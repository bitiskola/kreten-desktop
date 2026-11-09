# Third-party notices

## Firka

Firka is developed by QwIT Development and its contributors:
<https://github.com/QwIT-Development/firka>.

The reference snapshot `8645e7d4c74c8d0dc051e04d33ca1c8dd5f2ec0b` declares
Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International in
`LICENSE.txt`. Its unmodified license text is retained in
[`docs/licenses/Firka.LICENSE.txt`](docs/licenses/Firka.LICENSE.txt).
License text: <https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode>.

KRETÉN Desktop is a Rust/Tauri desktop reimplementation, using Firka as a reference
for mobile OAuth, API contracts, offline behavior and notification features. The
platform, UI, persistence and background lifecycle differ from Firka. No Firka
application icons, bundled fonts or screenshots are included. This notice does
not suggest endorsement by the Firka authors.

The Firka license is retained for upstream material and any adaptations of that
material; it does not grant rights to unrelated third-party logos or dependencies.

## KRETÉN web application and concept logos

Web reference: <https://github.com/micr0softstore/KRETEN>, snapshot
`7dcde270d4fe4aa03f75ea76d07289affb51c67d`.

That snapshot does not contain a repository-wide LICENSE file. Its README and
`static/brand/ASSETS.md` identify the concept at
<https://e-kreten.github.io/naplo/login/> and state that its two logo PNGs were
retrieved on 2026-09-23 at the project owner's request. This project reuses the
same logos at the user's explicit request; no independent license for the logos
or the web repository is asserted here.

- `public/brand/logo-dark.png`: <https://e-kreten.github.io/src/logo-dark.png>.
- `public/brand/logo-light.png`: <https://e-kreten.github.io/src/logo.png>.
- Desktop bundle/tray icons derived from those assets retain the same provenance.

The KRETÉN web project is a design and behavior reference for the desktop UI.
See [`public/brand/ASSETS.md`](public/brand/ASSETS.md) for the original asset note.

## Fonts

- `public/fonts/PixelifySans.ttf`: Pixelify Sans, Copyright 2021 The Pixelify
  Sans Project Authors (<https://github.com/eifetx/Pixelify-Sans>), used by the
  optional "Pixel" interface style. Licensed under the SIL Open Font License 1.1;
  the full license text is shipped next to the font as
  `public/fonts/PixelifySans-OFL.txt`.

## Dependencies and service names

Rust and JavaScript dependencies keep their respective licenses. Exact versions
are recorded in `Cargo.lock` and `package-lock.json`; this notice does not replace
their license files. Tauri, React, Lucide and the remaining packages are separate
projects and do not endorse this application.

KRÉTA and service names identify the remote services this independent client
connects to. This project is not the official KRÉTA application.

No blanket root license has been added: the audited sources have different
permission declarations, and the KRETÉN logos have no asserted redistribution
license. A future distributor must keep these notices and establish the intended
licensing of their own contributions and reused brand assets.
