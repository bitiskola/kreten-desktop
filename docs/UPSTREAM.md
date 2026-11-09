# Upstream references and protocol notes

This rewrite was audited against these pinned repository snapshots on 2026-10-14:

| Reference | Commit | Purpose |
| --- | --- | --- |
| [QwIT-Development/firka](https://github.com/QwIT-Development/firka) | `8645e7d4c74c8d0dc051e04d33ca1c8dd5f2ec0b` | Mobile OAuth, mobile API contracts, local caches, notification behavior, additional student features |
| [micr0softstore/KRETEN](https://github.com/micr0softstore/KRETEN) | `7dcde270d4fe4aa03f75ea76d07289affb51c67d` | Desktop layout, glass appearance, Hungarian copy, feature structure and supplied logos |

The snapshots are behavioral references, not proof that a live school account
accepts every endpoint. Authenticated requests must be verified with an account
entered by its owner through the official login window.

## Firka's OAuth contract

The source of truth is `firka_common/lib/core/consts.dart`,
`firka/lib/ui/phone/widgets/login_webview.dart`,
`firka/lib/api/token_grant.dart`, and
`firka_common/lib/data/models/token_model.dart` at the pinned commit.

- Identity provider: `https://idp.e-kreta.hu`.
- The Android client ID is `kreta-ellenorzo-student-mobile-android`. Firka uses
  `kreta-ellenorzo-student-mobile-ios` on its other platform branch.
- The official page is `/Account/Login` with a `ReturnUrl` containing the encoded
  `/connect/authorize/callback` path and authorization parameters.
- Redirect URI: `https://mobil.e-kreta.hu/ellenorzo-student/prod/oauthredirect`.
  This is a registered HTTPS URI, not a desktop localhost callback. Intercept its
  navigation in the isolated login webview before it leaves the app.
- Parameters: `response_type=code`, `prompt=login`, `suppressed_prompt=login`,
  random `state`, random `nonce`, `code_challenge`, and
  `code_challenge_method=S256`. Firka produces its verifier from 32 random bytes
  with unpadded base64url, then hashes the UTF-8 verifier using SHA-256.
- Scopes: `openid email offline_access kreta-ellenorzo-webapi.public
  kreta-eugyintezes-webapi.public kreta-fileservice-webapi.public
  kreta-mobile-global-webapi.public kreta-dkt-webapi.public
  kreta-ier-webapi.public`.
- Reauthentication may supply `login_hint` and `institute_code`.
- Exchange the code at `/connect/token` as URL-encoded form data containing
  `grant_type=authorization_code`, `code`, `code_verifier`, `client_id`, and the
  same `redirect_uri`.
- Refresh uses URL-encoded `grant_type=refresh_token`, `refresh_token`,
  `client_id`, and `institute_code`. Replace a rotated refresh token atomically,
  serialize refresh requests, and do not retry an invalid grant indefinitely.
- Firka extracts `kreta:institute_code`, `kreta:user_name`,
  `kreta:institute_user_id`, and, for guardian sessions, `kreta:student_id` from
  the ID token. An institution code is a validated school subdomain, not a
  numeric directory ID. Treat decoded claims as routing/account metadata;
  decoding alone does not verify a JWT signature.

Preserving the login experience does not require preserving upstream security
weaknesses. Generate new PKCE/state/nonce values per attempt, verify the full
callback origin and path plus state, enforce expiry and one-time consumption,
keep OAuth URLs and token responses out of logs, and give the login webview no
local application IPC permissions. Do not inject a replacement credential form.

## API contracts and pitfalls

Firka's diary service is `https://{institute_code}.e-kreta.hu`, under
`/ellenorzo/v3/sajat/`. The principal resources are `TanuloAdatlap`,
`OsztalyCsoportok`, `Ertekelesek`, `Mulasztasok`, `OrarendElemek`,
`HaziFeladatok`, `BejelentettSzamonkeresek`, `Feljegyzesek`, and
`FaliujsagElemek`. Date queries use `datumTol` / `datumIg` in `YYYY-MM-DD` form.
DKT subjects use `/dktapi/intezmenyek/munkaterek/tanulok`.

KRETEN supplements these with `Fogadoorak`, `Lep/Eloadasok`, `Elerhetoseg`,
`Bankszamla`, and school-year/week information. Preserve the service's own
capability/read-only checks. Its bank mutation fields are `BankszamlaSzam`,
`BankszamlaTulajdonosNeve`, numeric `BankszamlaTulajdonosTipusId`, and
`SzamlavezetoBank`. Contact updates use `email` and `telefonszam`.

The e-administration mailbox is a separate service at
`https://eugyintezes.e-kreta.hu/api/v1/kommunikacio/postaladaelemek/`, with
`beerkezett`, `elkuldott`, and `torolt` folders and a numeric-ID detail endpoint.
It is not the diary `Feljegyzesek` / `FaliujsagElemek` feed. KRETEN's tests document
that the mobile diary User-Agent causes connection resets at the mailbox service;
use that service's own neutral headers and `X-Uzenet-Lokalizacio: hu-HU`.

Additional regression cases from KRETEN:

- Homework queries longer than three weeks must be split and merged by stable ID.
- Parse nested teacher consultation groups and reserved slot information.
- A forbidden endpoint must appear as unavailable, not as a successful empty list.
- Mailbox optional/nested fields vary; attachment names do not imply working downloads.
- Treat school-provided HTML as untrusted plain text or sanitize it rigorously.
- Convert offset timestamps to `Europe/Budapest` before deriving calendar dates.
  Preserve date-only values and handle daylight-saving boundaries.
- Weight numeric grades 1–5 by explicit percentages; textual grades are not zero.
  Unknown or empty arithmetic must remain absent instead of displaying a fabricated zero.

KRETEN already marks consultation booking as unsupported, opens official KRÉTA
for it, and does not download mailbox attachments. Do not claim either upstream
feature as implemented based only on a visible button or filename.

## Notifications and local operation

Firka has two Android wakeup transports: Firebase silent wakeups and Android
AlarmManager. The Firebase branch registers a Firebase token, a student ID, and
preferences with a Firka backend; the actual diary fetch/diff happens locally.
Consequently, "everything local" must be interpreted as the requested desktop
design, not as a claim that the Android app never contacts any notification
backend.

KRETÉN Desktop uses a resident Rust process and local polling. Native desktop
notifications are generated from locally compared KRÉTA responses. It does not
need Firebase credentials, Firka backend keys, a cloud relay, or a hosted session
server. These are polling-based notifications, not a KRÉTA server push stream.
They require the process to be running and the computer awake; tray Quit stops
the process and its background checks.

Firka seeds each account/category's initial notification baseline silently, then
reports new grades, homework, tests, absences, messages and timetable changes.
Cancellations and substitute teachers have distinct notification wording. Data
change notifications and application binary update delivery are separate features.

## Brand provenance

KRETEN's `static/brand/logo-dark.png` is the black wordmark for light surfaces;
`static/brand/logo-light.png` is the white wordmark for dark surfaces. Both are
138 × 60 RGBA PNGs, copied without modification to `public/brand/` here.
`public/brand/ASSETS.md` preserves the upstream provenance note. Desktop icon
variants are derived from that same wordmark for packaging and tray use.

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for the actual upstream
license declarations and the distinction between source and brand permissions.
