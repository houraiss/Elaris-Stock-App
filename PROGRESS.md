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
- **Phase 6 (Social, manual)**: done. New Social screen (per-platform
  follower trend, weekly snapshot entry, post entry with piece
  tagging), piece detail now lists "posts featuring this piece",
  Insights gained follower-growth-vs-sales and post-to-sales
  correlation sections. Self-tested end-to-end on the emulator.
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

## Android emulator — DONE, this is now the primary preview loop

Working end-to-end as of the session that set it up. Recap for a fresh
session:

- JDK: `C:\Users\User\android-tools\jdk17`
- Android SDK: `C:\Users\User\android-tools\android-sdk`
- AVD name: `elaris_test` (Pixel 5 profile, android-34 google_apis x86_64)
- Expo Go APK (SDK 57, v57.0.9) sideloaded at
  `C:\Users\User\android-tools\expo-go-57.apk` — re-download via
  `https://api.expo.dev/v2/versions/latest` → `data.sdkVersions["57.0.0"].androidClientUrl`
  if a newer Expo Go build is ever needed (`curl --ssl-no-revoke` needed
  because of the Avast interception noted above).

**Launch sequence from a cold start:**
```
# 1. Start the emulator (background)
"C:\Users\User\android-tools\android-sdk\emulator\emulator.exe" -avd elaris_test -no-snapshot-load

# 2. Wait for boot
adb wait-for-device
adb shell getprop sys.boot_completed   # poll until "1"

# 3. Start Metro from elaris/ (background), then:
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"
```
(`adb` = `C:\Users\User\android-tools\android-sdk\platform-tools\adb.exe`,
already on PATH-equivalent via full path — always prefix with
`export ANDROID_HOME=...` in a fresh Bash session.)

**Screenshotting to self-verify** (I can now do this myself, no need to
ask the user what they see): `adb shell screencap -p //sdcard/x.png` then
`adb pull //sdcard/x.png <local path>` then Read the local file. **Use a
leading `//` on the device-side path** — Git Bash's MSYS layer mangles a
single-leading-slash path into a bogus Windows path otherwise.

**Important**: the emulator has its own local SQLite database, separate
from the phone's. It starts empty. Use Settings → "Restore from cloud"
in the emulator to pull the same data that's been synced from the phone,
if realistic data is needed for a test.

## Emulator self-testing — Custom Orders & Reservations (DONE)

Both flows fully self-tested end-to-end via the emulator, driving the UI
myself with `adb` (tap coordinates read fresh from `uiautomator dump`
each time — screenshots alone are unreliable for tap coordinates because
scroll position shifts when the keyboard shows/hides).

- **Custom orders**: created a test order, walked it through
  quote → ordered → in_production → ready → deliver. Delivery correctly
  created a one-off unique piece + variant, wrote opening 'purchase' and
  closing 'sale' stock movements netting to zero, and re-parented the
  deposit `customerPayments` row from the custom order onto the new sale.
- **Reservations**: created piece "Test Bangle" (qty 5), tapped Hold for
  customer "Khadija Test" qty 1 → found and fixed a real bug (below),
  then verified Available dropped to 4 with a "Layaway — held" badge.
  Tapped Release → verified the reservation disappeared from the list and
  Available returned to 5, badge gone.

**Bugs found and fixed this session:**
1. `src/db/repositories/insights.ts` — Home dashboard's low-stock counter
   was flagging sold-out `unique` pieces (e.g. a delivered custom order)
   as low stock, which is meaningless since one-off pieces have no
   restock concept. Fixed by filtering to `itemType === 'model'` variants
   only. (commit `e19ff86`)
2. `src/screens/PieceDetailScreen.tsx` — `VariantRow`'s hold-form success
   handler never told the parent screen to reload, so Available stayed
   stale after a successful Hold until the user manually navigated away
   and back. Fixed with an `onReserved` callback wired to the parent's
   `load()`. (commit `600faec`)

Both fixes: `npx tsc --noEmit` clean, `npx jest --silent` 19/19 passing,
committed and pushed.

## Phase 6 — Social, manual (DONE)

Built on top of the `social_snapshots` / `social_posts` / `post_pieces`
schema and sync plumbing that already existed from session 1.

- **`src/db/repositories/social.ts`**: `createSnapshot`, `listSnapshots`
  (chronological, for the trend chart), `createPost` (+ tags into
  `post_pieces`), `listPosts` (with joined piece names), `getPostsForPiece`.
- **`src/screens/SocialScreen.tsx`**: Instagram/TikTok toggle, follower
  trend `BarChart`, inline "add weekly snapshot" form, post list, and a
  full-screen "add post" panel with piece tagging (search-and-select,
  same pattern as the customer/supplier pickers elsewhere).
- **`PieceDetailScreen`**: new "Posts featuring this piece" footer section.
- **`InsightsScreen`** / **`insights.ts`**: `getFollowerGrowthVsSales`
  (twin monthly bar charts — followers, then booked revenue, same
  x-axis) and `getPostToSalesCorrelation` (units of a post's tagged
  pieces sold in the 14 days after it went up).
- i18n: full `social` section plus additions to `home`/`pieceDetail`/
  `insights` in all three locales.

Self-tested end-to-end on the emulator: logged an Instagram snapshot
(1250 followers) and a post tagging "Test Bangle", confirmed the trend
chart, the post list, the piece detail's posts section, and both new
Insights sections all render correctly — including the empty state when
switching to the (still empty) TikTok tab.

## Immediate next step

Everything through Phase 6 is built and tested. Phase 7 (Social,
automated — Instagram Graph API / TikTok Display API) is next per the
plan, but it's explicitly optional and deprioritized until Phase 6's
manual numbers show which ones are actually worth automating —
**check with the user before starting it**, don't assume.
