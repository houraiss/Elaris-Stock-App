# Elaris — Progress Tracker

This file is the running status of the Elaris Jewelry shop app build. It is
auto-loaded every session via `CLAUDE.md`, so a brand new conversation
should read this first before doing anything else. Update it after every
meaningful step — new phases finished, environment quirks discovered,
credentials/services connected, bugs found and fixed or deferred.

Git commit history is the detailed authoritative record of *what changed
and why* (commit messages here are written thoroughly on purpose — read
`git log` for specifics). This file is the higher-level summary: what's
done, what's connected, what's blocked, what's next.

The original spec is `../elaris-app-implementation-plan.md` (one level up,
outside this repo).

---

## Repo

- GitHub: https://github.com/houraiss/Elaris-Stock-App (pushed to `main`
  after every phase — always check `git log --oneline` for the real
  sequence of work).
- App code lives in this folder (`elaris/`) — Expo (React Native) +
  TypeScript, `expo-sqlite` + Drizzle ORM as the local source of truth.

## Build status (against the implementation plan)

- **Sessions 1-4 (Phase 0-1)**: done. Schema (20 tables), migrations,
  i18n (EN/FR/AR + RTL), `suggestPrice()`, catalogue (pieces/variants/
  photos), stock intake (barcode/QR scan tier 1 + manual), log-sale
  screen with the exact layaway flow from section 5.3.
- **Session 5 (Phase 2, partial)**: purchases, both credit ledgers,
  Balances screen.
- **Session 6**: Settings — language switcher, markup rules editor
  (append-only), backup export (JSON via share sheet).
- **Phase 3**: Home dashboard (booked/collected/margin/owed/inventory
  value/low stock/top pieces/recent activity) + Insights screen
  (hand-rolled SVG bar charts: revenue over time, realised markup vs.
  rule table, sales breakdown, cost trends, ring size popularity, dead
  stock). Social correlations skipped — no Phase 6 data source yet.
- **Phase 4**: Supabase cloud sync — push (outbox via `synced_at`),
  photo upload to Storage, restore-on-fresh-install. Tested against a
  live project; two real bugs found and fixed (see "Known issues"
  below for the one still open).
- **Phase 5**: Tier 2 visual match + Tier 3 vision pre-fill via Claude,
  proxied through a Supabase Edge Function so the API key never ships
  in the app. Code complete, deployed, but **gated behind "Pro"** — see
  Cloud services below.
- **Phase 2 remainder**: custom orders pipeline (quote → ordered → in
  production → ready → deliver, delivery converts to a real sale) and
  reservations (short holds, "Hold" button on piece detail).
- **Phase 6 (Social, manual)**: NOT started.
- **Phase 7 (Social, automated)**: NOT started — explicitly optional in
  the plan itself, deprioritized until Phase 6 shows which numbers
  matter.

## Cloud services connected

- **Supabase project**: URL `https://ilalkpkcechktsscgasa.supabase.co`.
  Anon key lives in `elaris/.env` (gitignored — see `.env.example` for
  the shape). Schema mirror: `supabase/schema.sql`. RLS policies:
  `supabase/policies.sql` (RLS is ON — Supabase nudged the user into
  enabling it — with a single permissive `allow_all` policy per table,
  appropriate for this single-user app). Both already run in the
  Supabase SQL Editor — don't re-run blindly, check first if unsure.
  Storage bucket `piece-photos` exists (public).
- **Anthropic vision (Tier 2/3)**: Edge Function `vision` is deployed
  (source: `supabase/functions/vision/index.ts`). `ANTHROPIC_API_KEY`
  secret is **deliberately not set** — the user wants to defer this paid
  feature until willing to spend money. The app shows it as "Photo
  match (Pro)" and surfaces a friendly "not turned on yet" message
  instead of an error. To enable: add `ANTHROPIC_API_KEY` as a secret
  on the `vision` function in the Supabase dashboard — no app code
  changes needed.

## Known issues (open)

- Restored photo thumbnails don't always refresh on-device after
  `restore.ts` downloads them — looks like React Native / Expo Go image
  cache invalidation (same local file path, stale cached decode), not a
  data bug. The underlying restore logic is verified correct (piece,
  variant, materials all restore correctly; the file on disk is valid).
  Deferred — not chased further as of the last session.

## Environment setup on this machine (Windows 10, PC + user's Samsung S24 Ultra)

Read this before touching tooling — several non-obvious gotchas cost real
time to work out.

- **Node.js**: installed but PATH isn't refreshed in already-running
  shell sessions. Prefix commands with:
  `$env:Path += ";C:\Program Files\nodejs"` (PowerShell) each session.
- **Windows Firewall**: a rule named "Node.js (Expo Metro)" was created
  (inbound allow, Private profile) so the phone can reach Metro over
  LAN Wi-Fi. This is network-specific — if the PC joins a *new* Wi-Fi
  network Windows treats as a different profile, the connection may
  need re-testing (fixed once already, see git history commentary in
  the conversation, not in a commit).
- **ADB / platform-tools** (for the physical phone via USB, when Wi-Fi
  direct connection isn't available): `C:\Users\User\Elaris Stock
  App\tools\platform-tools\adb.exe`. After reconnecting the phone:
  `adb reverse tcp:8081 tcp:8081`. Phone must be in "File transfer"
  USB mode, not tethering, with USB debugging authorized.
- **Android emulator** (in progress — see Immediate next step): JDK 17
  (Temurin) at `C:\Users\User\android-tools\jdk17`. Android SDK
  (cmdline-tools, platform-tools, emulator, android-34 google_apis
  x86_64 system image) at `C:\Users\User\android-tools\android-sdk`.
  AVD created: `elaris_test` (Pixel 5 device profile).
  - **Gotcha**: Java/Android SDK tools fail on paths containing
    spaces — that's why these live under `C:\Users\User\android-tools\`
    and NOT inside "Elaris Stock App" (which has a space in the name).
  - **Gotcha**: Avast Antivirus does HTTPS inspection with its own
    locally-generated root CA, trusted by Windows/curl but NOT by
    Java's bundled `cacerts` — this breaks `sdkmanager`/`avdmanager`
    with `PKIX path building failed`. Fix: set
    `JAVA_OPTS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` before
    running any Java-based SDK tool, so Java uses the Windows trust
    store instead of its own.
  - **Gotcha**: the emulator needs Windows Hypervisor Platform enabled
    (`Enable-WindowsOptionalFeature -Online -FeatureName
    HypervisorPlatform -All`, admin PowerShell, reboot required). The
    user ran this and rebooted — next step is to confirm it actually
    took and relaunch the emulator.
- **Metro dev server**: needs restarting after PC sleep/reboot — from
  `elaris/`: `npx expo start` (with the PATH prefix above). Runs in
  background; check `http://localhost:8081/status` to confirm it's up.

## Testing approach

- Always run `npx tsc --noEmit` and `npx jest --silent` after changes,
  before committing — both must be clean.
- Live UI testing has so far been on the user's physical phone via Expo
  Go, which means *I* cannot drive the UI myself — only the user can tap
  through and report back what they see. The Android emulator (once
  working) changes this: I can install the APK, drive it, and take my
  own screenshots via `adb`, which is a meaningfully better feedback
  loop for the remaining phases.
- REST/API-level verification (Supabase tables, Storage) I *can* do
  myself directly via `curl` with the anon key — useful for confirming
  sync actually happened without waiting on the user.

## Immediate next step

1. Relaunch the Android emulator (`emulator -avd elaris_test`) now that
   Hypervisor Platform should be enabled post-reboot; confirm it boots
   via `adb wait-for-device` + polling `sys.boot_completed`.
2. Download the Expo Go APK matching Expo SDK 57 and `adb install` it
   (sideload — no Play Store login needed).
3. Point it at the running Metro server (`adb reverse tcp:8081
   tcp:8081`, then launch Expo Go with `exp://localhost:8081`, or set
   the manifest URL directly).
4. Verify with an `adb shell screencap` that the app actually renders.
5. Once the emulator is the working preview loop, continue with
   whatever the user directs — Phase 6 (manual social tracking) is the
   next unbuilt phase per the plan, but check with the user first
   rather than assuming.
