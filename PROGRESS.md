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
- ~~**Machine-wide TLS regression (2026-09-15)**~~ — **RESOLVED same day.**
  Was: every outbound HTTPS call from the Android emulator failed with
  `javax.net.ssl.SSLHandshakeException: CertPathValidatorException: Trust
  anchor for certification path not found`, including the previously-working
  Supabase sync — confirming it was a machine-wide Avast HTTPS-interception
  issue (same class as the host-tools gotcha below, but hitting the
  emulator's own Android trust store this time), not a code bug. The user
  turned Avast off and confirmed both sync and the live silver price work
  again. Leaving this entry as a record in case it recurs — if so, try a
  narrower Avast exclusion for the emulator process before disabling it
  entirely, or test on the physical phone (its traffic never routed
  through the PC's Avast filter, so it was unaffected throughout).

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

**Two more gotchas found during UI-redesign self-testing:**
- Expo Go draws its own floating "Tools"/dev-menu bubble (a native
  `android.widget.ImageView` from package `host.exp.exponent`, visible via
  `uiautomator dump`) on top of the app — it can land anywhere, including
  over app content, and shows up in screenshots as a gear icon in a
  translucent circle. It's not part of the RN tree and won't exist in a
  production build; don't mistake it for an app bug.
- `adb shell input tap` returns before the RN/navigation animation
  finishes, so a `screencap` fired immediately after a tap can capture the
  *previous* screen. Add a short `sleep 1`–`2` between tap and screencap
  (or re-check with a fresh `uiautomator dump` when a tap seems to have
  done nothing) rather than concluding the tap failed.

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

## UI/UX redesign (DONE)

Full visual redesign across every screen, requested as: "improve the whole
UI design and introduce dashboard and icons throughout the whole app, and
add some visuals mainly in the home page" — combined with the
`mobile-app-ui-design` skill. The silver-price-tracking feature mentioned
in the same request was **explicitly deferred** at the time ("for now
lets improve the design or UI first") — since built, see "Silver price
tracking" below.

- **`src/theme/index.ts`**: design tokens — warm-ivory/charcoal-ink palette
  with a gold accent (60/30/10 rule) and a silver accent reserved for the
  upcoming silver-price feature; spacing/radius/typography/shadow scales.
- **`src/theme/icons.ts`**: semantic icon-name maps (routes, payment
  methods, sale channels, social platforms, custom-order statuses).
- New dependencies: `@expo/vector-icons` (Ionicons) and
  `expo-linear-gradient`, both via `npx expo install` — part of the
  standard Expo Go feature set, confirmed working live with no native
  rebuild needed.
- **`src/components/`**: new reusable primitives — `Button`, `Chip`,
  `SegmentedControl`, `Card`, `Badge`, `IconCircle`, `SectionHeader`,
  `EmptyState` (barrel-exported from `index.ts`) — replacing ~250
  duplicated inline hex-color style blocks that were copy-pasted across
  all 13 screens.
- **`HomeScreen`**: rebuilt as a real dashboard — gradient hero card with
  a live "booked this month" figure plus a mini revenue-trend chart
  (reuses `getRevenueByMonth` from `insights.ts`), an icon-tile
  quick-actions grid (replaces the old horizontal chip row), an
  icon-accented stat grid, a ranked top-pieces list, icon-coded recent
  activity. Renders its own header and hides the native one.
- **`RootNavigator`**: global header re-skin (ivory/ink theme, flat, no
  shadow, minimal back button) + icon-prefixed screen titles via a
  `ScreenTitle` component (skipped for `PieceDetail`, which sets its
  title dynamically via `navigation.setOptions`).
- All 12 other screens (Stock, PieceDetail, LogSale, Purchases, Balances,
  Settings, Insights, CustomOrders, Reservations, Social, AddPiece,
  StockIntake) migrated onto the theme + new components, with icons added
  throughout (buttons, badges, empty states, section headers, FABs,
  payment/channel/status chips, a real `Switch` for the layaway toggle).
- New i18n keys in all three locales: `home.greetingMorning/Afternoon/
  Evening`, `home.quickActions`, `home.overview`.
- `npx tsc --noEmit` and `npx jest --silent` (19/19) both clean.

**Emulator self-testing this session** — screenshotted and visually
confirmed: Home, Stock, PieceDetail, LogSale, CustomOrders, Insights,
Balances, Settings (8 of 13 screens, plus every new shared component
including `SegmentedControl`). Not individually screenshotted this
session: Purchases, Reservations, Social, AddPiece, StockIntake — these
share the exact same components/patterns already confirmed elsewhere, so
confidence there rests on that plus the clean typecheck, not a live
screenshot.

**Two real bugs found and fixed via emulator testing** (both in
`src/charts/BarChart.tsx` / its callers, not pre-existing — introduced
this session and caught before being called done):
1. Home's hero mini-chart sliced an already-short `"MM/YY"` month label
   (`r.month.slice(5)`), producing an empty string for every month → a
   visible React "duplicate key" warning banner. Fixed by using `r.month`
   directly (matches how `InsightsScreen` already consumed the same
   field).
2. `BarChart`'s x-axis/value `SvgText` is center-anchored on each bar;
   with few bars (esp. a single bar, e.g. Insights' "Sales breakdown" for
   one material) or long labels (material names in "Wholesale cost
   trends"), the centered text extended past `x=0` and was clipped by the
   `<Svg>` boundary. Fixed with a `CHART_PADDING_SIDE` constant on both
   sides, plus wrapped the chart in its own internal horizontal
   `ScrollView` so it also degrades gracefully with more bars than fit on
   screen (e.g. a 6-month trend) — confirmed both fixes visually on
   device. `BarChart` also gained `labelColor`/`valueColor` props so
   Home's dark hero card can use light chart text instead of the
   (invisible-on-dark) default dark gray.

## Silver price tracking (DONE, pending on-device network verification)

Morocco reference spot price for silver 925 and 800 purity, shown as a
card on Home. The user dropped a comparison doc into a new
`../user notes/` folder (`silver_price_api_comparison.md`, one level up,
outside the repo — a place the user intends to keep dropping notes/files
for me to read) recommending GoldPriceZ; I independently verified every
option in it via direct API calls (not just docs) before picking:

- **Rejected GoldPriceZ** (the doc's top pick) despite it being the best
  functional match (has a Morocco/MAD page, breaks out exactly Sterling
  .925 and European .800) — their own terms explicitly exclude this use
  case: *"Internal systems, private pages, applications... are not
  included under the free tier."* Elaris is a private business app, not
  a public webpage.
- **Chosen instead**, both free, keyless, no signup, no ToS conflict for
  private use, verified working with real `curl` calls (see below):
  - `https://api.gold-api.com/price/XAG` — silver spot, USD/troy oz.
  - `https://open.er-api.com/v6/latest/USD` — USD→MAD (and everything
    else), refreshes ~daily, plenty for currency conversion.
  - Confirmed **not** viable: Frankfurter (ECB-based — does not carry
    MAD at all, despite a web-search summary claiming otherwise — always
    verify with a real request, not a search snippet). Metals-API does
    carry MAD but the free tier (100 req/month) is too thin for anything
    beyond a once-a-day check.
- User decided: no need for true per-second ticking (a periodic
  poll/manual-refresh is fine), and the price should read as a labelled
  "reference spot price" with a disclaimer, not an authoritative dealer
  rate — matches how every source in this space (including the
  goldpricedata.com site referenced in the original ask) already frames
  it themselves.
- **`src/pricing/silverSpotMath.ts`** (pure, unit-tested in
  `silverSpotMath.test.ts`): troy-oz→gram conversion, purity-adjusted
  MAD/gram math, staleness check. **`src/pricing/silverSpot.ts`**: the
  two fetches above + an `AsyncStorage` cache (same pattern as
  `settings/lowStockThreshold.ts`), re-exports the pure module so callers
  only need one import. Split into two files specifically so the pure
  math could be unit-tested without Jest choking on
  `@react-native-async-storage/async-storage`'s native import (that
  package has no Jest mock configured in this project yet — same would
  bite `languagePreference.ts`/`lowStockThreshold.ts` if anyone tried to
  test those directly).
- No Supabase Edge Function needed here (unlike `vision`) — both APIs are
  keyless, so there's no secret to keep off the client. Client calls both
  directly, caches locally, offline-tolerant (falls back to last cached
  price on fetch failure; only shows "unavailable" if there's truly
  nothing cached yet).
- **`HomeScreen`**: new "Silver spot price" card between the hero and
  quick actions — 925/800 side by side, "updated N ago", manual refresh
  icon, disclaimer line. Respects pull-to-refresh.
- New i18n keys (all 3 locales) under `home.silver*`.
- `npx tsc --noEmit` and `npx jest --silent` (24/24) both clean.

**Not yet confirmed working end-to-end on-device** — see the new "Known
issues" entry above. The live *fetch* is currently blocked emulator-wide
by a TLS trust-store issue unrelated to this feature (confirmed by also
reproducing it on the pre-existing "Sync now" button). Everything else
about the card *is* confirmed on the emulator: temporarily seeded
`silverSpot` state with a fake `{usdPerOz: 63.27, usdToMad: 9.46}` and
screenshotted — 925 correctly rendered 17,80 MAD, 800 rendered 15,39 MAD
(both match hand-calculated expected values), "Updated 5 minutes ago"
relative-time formatting was correct, and the layout/badges/disclaimer
all render as designed. Reverted the seeded value afterwards. **Update
same session**: once the user disabled Avast (see "Known issues"), the
live fetch was confirmed working for real on the emulator — 925/800
prices update from `api.gold-api.com` + `open.er-api.com` and render
correctly. This feature is now fully done, not just plausibly correct.

## CLAUDE.md rewrite (DONE)

Per the user's explicit ask, prioritizing session-context token efficiency:
a short project-context paragraph (what Elaris is, stack, design-system
pointer) plus one sentence telling the AI to read `AGENTS.md`/`PROGRESS.md`
before starting, above the existing `@` imports. `AGENTS.md` deliberately
left untouched — expanding it wasn't asked for.

## Stock screen: real bug fix + smarter filtering (DONE)

The user reported (with a screenshot) that the material filter chips
rendered as tall, broken vertical pills instead of a compact row — a real
bug, reproduced and confirmed on the emulator, not a device-specific
quirk. **Root cause**: `StockScreen` was the one screen I hadn't touched
during the earlier chip-rendering fix — it still used the original
`<FlatList horizontal>` pattern for chips, and `FlatList`'s internal item
wrapping stretches a `Chip` (which has its own internal
`flexDirection:'row'`) to fill the list's cross-axis height. Every other
screen already used `<ScrollView horizontal> + .map()` for chip rows
(from the UI redesign) and never showed this bug — confirms the pattern,
not just a style tweak. **Fixed by switching to that same working
pattern**, plus used the opportunity to add what was actually the bigger
ask ("browse all the categories and products easily and smoothly"):
- A search bar (client-side substring match on name — no backend change
  needed, the piece list for a given material+category is already small
  enough to filter in memory).
- **Category filtering**, previously entirely unwired in the UI despite
  the backend already supporting it fully (`listPieces({ category })` and
  `listCategories()` both already existed, unused — a pure UI gap, not
  missing plumbing).
- A distinct "no matches" empty state (search/filters found nothing) vs.
  the original "no pieces at all" one, each with the right recovery
  action (clear filters vs. add a piece).
- All three (search, category, material) confirmed working live on the
  emulator, including the empty-state recovery action.

## Missing edit functionality (DONE for pieces/variants/reservations)

The user flagged this as "a huge red flag": **zero `update()` functions
existed anywhere in the entire `db/repositories/` layer** — confirmed by
grep, not an assumption. Every entity could be created and listed but
never corrected after the fact. This predates this session's UI work
entirely — the redesign only reskinned existing screens, it didn't remove
an edit feature that was never built.

Scoped to what the user explicitly named (stock, reservations) rather
than attempting every entity in one pass:
- **`pieces.ts` repository**: added `updatePiece()` (name/category/
  material/notes) and `updateVariant()` (label/weight/cost/price, with
  the same >0 validation `AddPieceScreen` already used).
- **`reservations.ts` repository**: added `updateReservation()` (qty/
  expiry) — editing qty re-checks stock availability by first giving the
  reservation's *own* current qty back to the pool, otherwise it would
  always block against itself.
- All three follow the existing outbox-sync contract exactly (`db.update`
  with a fresh `updatedAt`, `syncedAt` untouched) — confirmed by reading
  `sync/push.ts` first rather than guessing: a row syncs whenever
  `syncedAt IS NULL OR syncedAt < updatedAt`, so this needed no new sync
  code at all.
- **UI**: `PieceDetailScreen` gained a header edit icon (piece fields) and
  a per-variant edit icon (opens the same style of inline form used
  throughout the app); `ReservationsScreen` gained a per-reservation edit
  icon (qty/expiry). No new navigation routes — inline forms in place,
  matching the existing markup-rules-edit pattern in `SettingsScreen`.
- Found and fixed **two pre-existing button-styling bugs** while in this
  code: the variant-edit Save, the reservation-edit Save, and the
  Hold-confirm button were all missing `variant="primary"`, so they
  rendered as secondary/gray instead of standing out as the primary
  action — caught by actually looking at the screenshots, not just
  reading the code. Grepped the rest of the app for the same pattern
  afterwards; nothing else was affected (one more hit was a grep false
  positive from multi-line JSX, verified by reading it).
- **Confirmed live on the emulator**: piece edit (name change persisted,
  header title updated) and variant edit (price change persisted) both
  round-tripped correctly. Reservation edit compiles and typechecks and
  uses the identical pattern as the two confirmed flows, but wasn't
  independently click-tested live (no active test reservation on hand
  and diminishing returns after the pattern was already proven twice).
- **Explicitly not done, flagged for a future pass**: editing customers
  and suppliers (they have no dedicated list/detail screen to hang an
  edit affordance on today — inline search-or-create only), and editing
  a custom order's core fields (description/price/promised date) after
  creation — only status advances, deposits, and cancellation exist
  there. Markup rules were deliberately left alone — their append-only
  "edit" is intentional (audit trail), not a gap.

## Home screen layout customization (DONE)

The user wants to reorder Home's sections (e.g. move "Silver spot price"
first) plus a reset-to-default. Implemented with **no new dependencies**:
considered real drag-and-drop (`react-native-gesture-handler` +
`react-native-reanimated`, both available in Expo Go without a custom
dev client) but chose simple up/down move buttons instead — same
end result, zero new dependency footprint, consistent with this
codebase's existing preference for hand-rolled over pulled-in (e.g. the
hand-rolled `BarChart` instead of a charting library).

- **`src/settings/homeLayout.ts`**: `HomeSectionId` union (hero, silver,
  quickActions, overview, topPieces, recentActivity),
  `DEFAULT_HOME_SECTION_ORDER`, `get/set/resetHomeSectionOrder()` —
  `AsyncStorage`-backed, same pattern as `lowStockThreshold.ts`. Validates
  the stored order against the current section set on read, so an app
  update that adds/removes a section can't leave a corrupt stored order
  stuck (falls back to default instead).
- **`HomeScreen`**: the 6 sections were pulled out of the old fixed JSX
  order into a `renderSection(id)` switch, rendered by mapping over
  `sectionOrder` state. A new header icon (sliders/"options" icon, next
  to Settings) toggles a layout-edit mode: a plain list of section names
  with up/down arrows (disabled at the boundaries), plus "Reset to
  default" and "Done".
- **Confirmed live on the emulator, the full loop**: opened edit mode,
  moved "Silver spot price" above the hero card, tapped Done — Home
  re-rendered in the new order immediately. Force-killed and cold-relaunched
  the app — order survived (AsyncStorage persistence confirmed, not just
  in-memory state). Reset to default correctly restored the original
  order. All three (reorder, persist, reset) verified, not assumed.

## Three quick fixes from user feedback (DONE)

Reported via screenshots in one batch; all three fixed and confirmed live
on the emulator (cold relaunch, not just Fast Refresh):

1. **Fine silver 999**: added to `SILVER_PURITIES` in
   `src/pricing/silverSpotMath.ts` (now `[999, 925, 800]`). The Home
   silver card's rendering was already generic over the purity list, so
   no UI code changed — confirmed live: 999 shows 19,33 MAD/g, correctly
   proportional to 925's 17,89 and 800's 15,48 (ratios match purity
   ratios exactly).
2. **Greeting always said "Good Morning" at night**: `greetingKey()` in
   `HomeScreen.tsx` used `hour < 12` as its first bucket, so midnight–5am
   fell into "morning". Added a night bucket (`hour < 5` and `hour >= 22`)
   with a new `home.greetingNight` i18n key (all 3 locales). Confirmed
   live at 4:20am emulator time: now correctly shows "Good night".
3. **Zero spacing when a non-hero section is moved to first**: the hero
   card had no `marginTop` of its own (it relied on being first with
   nothing above it); reordering it to not be first left it flush against
   the previous section. Fixed by passing `index` into `renderSection()`
   and adding a conditional `heroNotFirst` style (`marginTop:
   spacing.xxl`) when `index > 0`. Confirmed live: moved Silver spot
   price above the hero card, correct spacing appeared on both sides;
   reset to default afterwards.

`npx tsc --noEmit` and `npx jest --silent` (25/25) both clean.

## Brand integration (DONE)

The user's other project, `elaris-content-engine`
(https://github.com/houraiss/elaris-content-engine — an Instagram content
studio for the same real-world jewelry business), turned out to be an
internal AI-prompt tool rather than a marketing site, but its source
still carried real brand facts, all confirmed by fetching the actual
files (not assumed from the page render):
- `manifest.json`: `theme_color: "#a67c52"`.
- `css/styles.css` `:root`: a named **"Heritage" palette** —
  `--moroccan-bronze: #A67C52` (matches the manifest exactly — this is
  the one true brand accent), plus `--sterling: #C0C0C0`, `--warm-sand:
  #EEE6D3`, `--atlas-cedar: #36442D`, `--olive-mist: #59704A`,
  `--night-slate: #35394D`, `--elaris-light: #EEEEEE` (not adopted here,
  just recorded in case a future pass wants the full palette).
- `index.html` sidebar: tagline **"Jewelry • Store"**, handle
  **`@elaris.925`**, and the actual wordmark SVGs
  (`Elaris Jewelry Logo/Elaris Lite Black.svg` /
  `...Lite White.svg`, viewBox `0 0 148.9 38`).
- No WhatsApp number anywhere in the webapp, its repo, or the
  `PROJECT_STATE.md` history — **not fabricated**, flagged to the user
  instead. If they share a number, it's a five-minute add (same
  `Linking.openURL` pattern as the Instagram button, `wa.me/<number>`).

Changes:
- **`src/theme/index.ts`**: `colors.gold` `#B4864B` → `#A67C52` (the
  real Moroccan Bronze). Left `goldSoft`/`onGoldSoft` as-is — already
  harmonize — and left `silver` untouched (`#7C8794` was deliberately
  tuned for UI contrast; the brand's literal `--sterling: #C0C0C0` is too
  flat for text/icon use, and swapping it wasn't asked for).
- **`src/components/ElarisWordmark.tsx`** (new, barrel-exported): the
  actual brand wordmark as 6 `react-native-svg` `<Path>`s transcribed
  from the real SVG (not a redraw), `color`/`width`/`height` props,
  aspect ratio preserved automatically from the source viewBox.
- **`SettingsScreen.tsx`**: new "About Elaris" section (bottom of the
  screen) — wordmark, tagline, and a tappable `@elaris.925` row that
  deep-links to the Instagram app (`instagram://user?username=...`) and
  falls back to the web profile if the app isn't installed
  (`Linking.canOpenURL` gate, matching how the rest of the app has no
  prior `Linking` usage to follow — this is the first, kept simple).
- New i18n keys (`settings.aboutElaris/aboutTagline/followOnInstagram/
  instagramUnavailable`) in all 3 locales — tagline and handle kept
  identical across locales (a brand slogan/handle, not UI chrome).
- `npx tsc --noEmit` clean. **Confirmed live on the emulator**: wordmark
  renders pixel-correct (including the small star accent inside the "E"
  — confirms the path transcription was exact, not just "close enough"),
  new bronze accent color visible app-wide (header eyebrow, quick-action
  icons, price figures), and tapping `@elaris.925` correctly fires an
  intent (verified via `dumpsys activity` — landed on Chrome since this
  fresh AVD has no Instagram app and Chrome had never been opened
  before, which is an emulator-environment detail, not a bug; a real
  phone with Instagram installed would deep-link straight into the app).

## Material taxonomy restructuring + full i18n fix (DONE)

The user asked for smarter material labels — two main purities (925/800),
each with plating sub-types — and offered exact wording: 925 has
plain + "Rhodium"/"Rhodié"; 800 has plain + chrome-plated ("argent
chromé") + gold-plated ("argent doré"). Implemented as 5 materials
instead of the old 3 (925 already had a rhodium row; 800 didn't):

- **`src/db/schema/materials.ts`**: new `plating` column
  (`'none'|'rhodium'|'chrome'|'gold'`), migration
  `drizzle/0001_burly_james_howlett.sql` (plain `ALTER TABLE ADD COLUMN`,
  no data migration needed).
- **`src/db/seed.ts`**: 5 materials, existing codes untouched
  (`argent_925`, `argent_rhodie_925`, `argent_800`) so existing
  pieces/markup-rules keep their `materialId` unchanged; two new codes
  added (`argent_800_chrome`, `argent_800_dore`). Seed now
  `onConflictDoUpdate` instead of `onConflictDoNothing`, so re-running it
  (every app start) also backfills `plating`/fixes `name` on an existing
  install's rows, not just fresh ones. `sortOrder` groups by purity
  (925 pair, then 800 trio) so even a flat chip list reads as grouped.

**Bigger discovery while doing this**: materials only ever had one
(French) `name` column in the DB — every "material" display across the
app (not just the picker chips the user was looking at) was rendering
that raw French string regardless of app language. Fixing just the seed
names would have left "Argent Rhodié 925" still showing in Stock/Sales/
Insights/Custom&nbsp;Orders on an English or Arabic phone, which reads as
a bug once the pickers say "Rhodium" right next to it. Fixed properly
instead of patching only the picker chips:
- New **`src/i18n/materialName.ts`**: `getMaterialDisplayName(code,
  fallbackName, t)` → `t('material.<code>', fallbackName)`. New
  `material.*` i18n block (5 keys) in all 3 locales — EN: "Silver 925" /
  "Rhodium" / "Silver 800" / "Chrome-plated" / "Gold-plated"; FR: "Argent
  925" / "Rhodié" / "Argent 800" / "Argent chromé" / "Argent doré"; AR
  parallel terms. Tagline-style, kept literal per the user's own wording
  rather than re-translated.
- Repositories that joined `materials.name` without also exposing
  `materials.code` got `materialCode` added so the UI layer can resolve
  it: `stockIntake.ts` (4 queries), `markupRules.ts`, `insights.ts`
  (`getSalesBreakdown` + `getCostTrendsByMaterial`, both previously
  grouped *by* the raw name string — now group by code instead, more
  correct even before i18n). `pieces.ts` already had `materialCode`
  selected but unused by callers.
- Every read-only material mention updated to resolve through it:
  `StockScreen` (filter chips + piece card), `AddPieceScreen`,
  `PieceDetailScreen` (badge + edit-form chips), `StockIntakeScreen` (4
  spots), `SettingsScreen` (markup-rule card + custom-rule chips),
  `LogSaleScreen` (resolved once at add-to-cart time, not per-render,
  since a cart line is a point-in-time snapshot), `CustomOrdersScreen`
  (same pattern — it silently defaults every order to Silver 800 with no
  material picker UI at all; pre-existing gap, out of scope here, flagged
  below), `InsightsScreen` (material cost-trend sub-sections + the
  realised-markup-vs-rule table, which also had a hardcoded English
  `'All materials'` fallback baked into the repository regardless of app
  language — fixed alongside since it's the identical bug in the same
  file, same screen).
- `npx tsc --noEmit` clean, `npx jest --silent` 25/25 (fixture strings in
  `suggestPrice.test.ts` use `'argent_800'`/`'argent_925'` as opaque IDs,
  unaffected).
- **Confirmed live on the emulator**: cold-relaunched (so the migration +
  reseed actually ran against the existing dev DB, not a fresh install);
  Stock's material row now shows all 5 correctly grouped chips (Silver
  925, Rhodium, Silver 800, Chrome-plated, Gold-plated); an existing test
  piece seeded under the old `argent_rhodie_925` material correctly
  displays "Rhodium" (proves the update-existing-row path works, not
  just fresh inserts). Switched the running app to French live (no
  reload) and confirmed "Argent 925 / Rhodié / Argent 800" — both the
  filter chips and the piece's own material line. Arabic uses the exact
  same mechanism (added, not independently screenshotted).

**Flagged, not fixed** (discovered while in this code, out of scope for
what was asked): `CustomOrdersScreen` has no material-picker UI at all —
every custom order silently defaults to Silver 800 with no way to choose
otherwise. Worth a small follow-up (add the same chip row the other
screens have) if custom orders in other materials come up.

## Dark mode (DONE) — full app-wide rollout, not a partial demo

The user asked for "a Light/Dark theme button inside App Settings." Scoped
this up front: `StyleSheet.create()` bakes color values in at the moment
it's called, so a screen whose styles are built once at module load can
never react to a theme switch — the only way to make ANY of it reactive
is to move every screen's styles into a function of the current theme,
called inside the component. Once one screen goes reactive, the shared
components it renders must too, or toggling dark mode would turn some
surfaces dark while their siblings stay light — worse than not having
the feature. That made "convert 2 screens as a proof of concept" not
actually a smaller/safer option than doing all of them, so this is a
complete rollout: all 13 screens, all 8 shared components, `BarChart`,
and `RootNavigator`'s header/nav theme.

- **`src/theme/palettes.ts`** (new): `lightColors` (the existing palette,
  renamed) and a new `darkColors` — same warm ivory/ink/gold design
  language, luminance-flipped (`primary`/`ink` swap which end is "light"
  so bold surfaces still pop; `gold` stays the throughline in both;
  `xSoft`/`onXSoft` badge pairs invert to dark-chip-bright-text instead
  of light-chip-dark-text).
- **`src/theme/ThemeContext.tsx`** (new): `ThemeProvider` + `useTheme()`.
  Preference (`light`/`dark`/`system`) persisted via `AsyncStorage`
  (`elaris.themePreference`, same pattern as `languagePreference.ts`);
  `system` tracks `Appearance` live via `addChangeListener`. Wrapped
  around the whole app in `App.tsx` (a new inner `AppContent` so the
  loading/error states before the DB is ready also theme correctly, and
  `StatusBar`'s style flips light/dark content to match).
- **Mechanical conversion pattern** applied everywhere: `const styles =
  StyleSheet.create({...})` at module scope → `const makeStyles = (colors:
  Colors) => StyleSheet.create({...})`, called inside every component
  (including sub-components in the same file, each gets its own
  `useTheme()` + `useMemo`) as `const { colors } = useTheme(); const
  styles = useMemo(() => makeStyles(colors), [colors]);`. Because the
  destructured variable is still named `colors`, every existing inline
  `color={colors.x}` JSX prop throughout each component picked up the
  reactive value automatically via normal variable shadowing — no need
  to hunt down and edit each one individually, only the styles-block
  declaration and the hook line per component. A few module-scope
  color-derived lookup tables needed the same treatment as a function
  instead of a constant: `Badge`'s tone styles, `HomeScreen`'s `TINTS`/
  `RANK_TONES`, `RootNavigator`'s nav theme object.
- **New "Appearance" section in `SettingsScreen`**, right under Language:
  a `SegmentedControl` (Light/Dark/System, sun/moon/phone icons) wired
  straight to `useTheme().preference`/`setPreference`. i18n keys
  `settings.appearance/appearanceLight/appearanceDark/appearanceSystem`
  in all 3 locales.
- **Real bug found and fixed during verification, not before**: Home's
  hero card gradient used `colors.primary` as one stop (paired with a
  hardcoded `'#3A2E1E'` for the other) with white-ish text on top — a
  design that assumed `primary` is always dark. In dark mode `primary`
  flips to light cream, so the gradient's light corner collided with the
  still-light text, and `heroValue`'s `color: colors.onPrimary` (also
  reactive) went dark-on-dark and disappeared entirely. Fixed by making
  the hero a fixed dark "spotlight" card in both themes — both gradient
  stops and the value's text color are now hardcoded literals, matching
  its original always-dark design intent, not tied to the theme-reactive
  primary/onPrimary pair. Audited every other `colors.primary`/
  `onPrimary` use afterwards (`Button`, `Chip`, `SegmentedControl`, FABs)
  — all of those pair the reactive background with the reactive
  foreground from the *same* palette, which flips consistently together
  by construction, so only the hero (mixing reactive with a hardcoded
  literal) was actually broken.
- `npx tsc --noEmit` clean across the entire app after every stage of
  this conversion (checked incrementally, not just at the end). `npx
  jest --silent` 25/25 unaffected (no color logic in tested modules).
- **Confirmed live on the emulator, thoroughly**: toggled Dark from
  Settings — Home, Settings, and Stock all repainted correctly in one
  frame (header, cards, chips, buttons, the material-taxonomy chips,
  the wordmark in "About Elaris" which correctly re-renders in light ink
  on the now-dark card). Force-relaunched the app cold — the Dark
  preference persisted (proves the AsyncStorage round-trip, not just
  in-memory state). Switched back to Light and confirmed full reversal.
  System mode wired to `Appearance` but not separately screenshotted
  (same code path as the explicit Light/Dark branches, already proven).

## Liquid Glass style option (DONE)

The user asked for an iOS-26-style Liquid Glass option in Settings.
Reused the exact CSS recipe already found this session in the user's own
`elaris-content-engine` repo (`IOS 26/liquid-glass-demo.html`) — translucent
tinted background + blur, asymmetric border (brighter top/left, faking a
light source), and a diagonal sheen — translated to React Native
primitives rather than copied as CSS:

- **New dependency**: `expo-blur` (`npx expo install`, same
  no-native-rebuild pattern as `expo-linear-gradient` earlier — confirmed
  working live in Expo Go, no custom dev client needed).
- **`src/theme/ThemeContext.tsx`** extended with a second, independent
  preference: `visualStyle: 'standard' | 'liquidGlass'`, persisted under
  its own AsyncStorage key (`elaris.visualStyle`) — deliberately kept
  separate from the light/dark `preference`, since they're orthogonal
  axes (the user can be on Dark + Liquid Glass, Light + Standard, any
  combination).
- **`src/components/Card.tsx`**: when `visualStyle === 'liquidGlass'`,
  renders `BlurView` (intensity 40, tint follows light/dark) +
  a translucent white tint layer + a diagonal sheen (`LinearGradient`,
  transparent → 22%-white → transparent, angled) + an asymmetric border
  (`borderTopColor`/`borderLeftColor` brighter than the other two sides)
  instead of the flat `colors.surface` card. Kept scoped to `Card` only
  (not a 13-screen pass like dark mode) — `Card` is the dominant reusable
  surface across the app (markup-rule rows, the About Elaris panel, most
  list items), so this gives broad, real visual coverage from one
  well-contained component change, rather than hand-rolling glass styling
  into every screen's bespoke surfaces.
- **New "Style" section in `SettingsScreen`**, right under the new
  Appearance section: `SegmentedControl` (Standard/Liquid Glass,
  square/water-drop icons). i18n keys `settings.visualStyle/
  visualStyleStandard/visualStyleLiquidGlass` in all 3 locales — "Liquid
  Glass" itself kept as an unstranslated product term in all three,
  matching how the user wrote it and how Apple's own marketing doesn't
  translate it either.
- `npx tsc --noEmit` clean, `npx jest --silent` unaffected.
- **Confirmed live on the emulator, and a real finding from doing so**:
  in **light mode** the effect is real but subtle — Elaris's palette is
  already near-white/cream, so a white-tinted frosted card barely
  separates from an already-light page background. In **dark mode** the
  same code renders a clearly visible frosted panel with a distinct
  diagonal light sheen crossing the card — confirms the implementation
  is correct and the CSS recipe's dependency on a darker/richer backdrop
  to read as "glass" carries over unchanged from web to native. Not a
  bug — flagged here since it's a real, honest property of the effect,
  worth knowing if the user tries Liquid Glass in Light mode first and
  wonders why it looks understated.

## Immediate next step

Setting up EAS Build for a standalone APK — the last item in this batch.
See git log for what's landed so far.

Phase 7 (Social, automated — Instagram Graph API / TikTok Display API) is
still on the plan but explicitly optional and deprioritized — check with
the user before starting it, don't assume.

Known gaps to raise with the user, not yet scheduled: edit support for
customers, suppliers, and custom-order core fields (see above); true
drag-and-drop for the home layout if up/down arrows turn out to feel
clunky in practice.
