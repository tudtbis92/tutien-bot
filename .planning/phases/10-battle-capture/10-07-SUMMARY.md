---
phase: 10-battle-capture
plan: 07
subsystem: ui-collection-onboarding
tags: discord-embeds, message-components, customId-routing, D-04, D-12, D-14, D-15, D-16, D-19, starter-faucet, iv-grade, companion-switch, i18n, vitest, TQC-12, TQC-13, SC5

# Dependency graph
requires:
  - phase: 10-battle-capture (10-06)
    provides: the /sanguo command module (map.ts re-export pattern), interactionCreate sanguo routing, battle/capture surfaces whose D-07 per-locale name + heroEmoji patterns the collection/hero embeds reuse
  - phase: 10-battle-capture (10-05)
    provides: captureService's user_heroes insert discipline (6× crypto IVs, hp_current = base HP, captured_zone) — the starter grant mirrors it exactly (the ONLY faucet, D-19)
  - phase: 10-battle-capture (10-04)
    provides: heroes.tier (public ★1-5) + heroes rarity (hidden — never read in UI, D-12) + heroes.hp/mp base stats + the 6 starter roster heroIds
  - phase: 10-battle-capture (10-02)
    provides: user_sanguo_state (activeHeroId, starterViews) + user_heroes schema rows the collection/companion read and write
  - phase: 09-travel-encounters
    provides: getCurrentPosition (playerTravelState) — the map SC5 current-position source
provides:
  - src/commands/sanguo/heroes.ts — heroesSubcommand + execute (empty → starter picker D-14 / non-empty → per-zone collection TQC-13) + handleStarterPick (FREE grant, D-19) + handleZoneFilterSelect (D-15)
  - src/commands/sanguo/hero.ts — heroSubcommand + ownership-gated execute (F9 duplicate disambiguation) + handleCompanionPress (FOR UPDATE switch, D-16/D-04)
  - src/ui/embeds/buildSanguoHeroesEmbed.ts + buildSanguoHeroEmbed.ts — collection/starter/success + fixed-field detail states, D-12 never-render
  - src/ui/components/sanguoStarterButtons.ts (STARTER_SET_1/2, D-14) + sanguoHeroesZoneMenu.ts (D-15) + sanguoHeroCompanionButton.ts (D-16)
  - src/commands/sanguo/map.ts — heroes/hero subcommands + SC5 current-position fix (getCurrentPosition, not rows[0])
  - src/events/interactionCreate.ts — sanguo:heroes:*/sanguo:hero:* routes
  - locales/{vi,en,zh-cn}/sanguo.json — heroes.*/hero.*/iv_grade.*/cmd.heroes.*/cmd.hero.* keys (check-i18n parity)
  - heroes.test.ts (8) + hero.test.ts (8) + map.test.ts SC5 tests
affects: Phase 11 (progression/dupe → hồn ngọc — the collection renders duplicates; chemistry/formations), Phase 12 audit (starter grants are user_heroes rows with captured_zone NULL), UI-SPEC backstops (heroes-collection loading 3s-window needs live sign-off)

actuals:
  tokens: 24948    # chars/4 over the realized diff (99,793 chars) — estimate was 60000/30000 raw, confidence low
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Starter-picker onboarding as the collection command's empty state (D-14): /sanguo heroes on an EMPTY collection renders exactly 3 starter buttons in ONE ActionRow; user_sanguo_state.starterViews increments on EVERY empty invocation (FOR UPDATE tx, one row per user, INSERT-if-missing); views >= 3 → set 2 (Trương Giác/Viên Thiệu/Đổng Trác); a pick resets it
    - The FREE starter faucet (D-19 — the ONLY faucet, grep-gated zero wallet calls): handleStarterPick runs a FOR UPDATE tx that re-checks the collection is still empty (double-grant serialization, T-10-07-01), rolls 6× crypto.randomInt(0,32) IVs (same distribution as capture), inserts user_heroes with hp_current = base HP + captured_zone NULL (A5), sets activeHeroId + resets starterViews
    - IV-grade render discipline (D-12): gradeKey computed from the 6 iv_* columns via sum/186 bands (100=gold, 90-99=ruby, 80-89=sapphire, 60-79=jade, <60=gray), stars from the PUBLIC heroes.tier ('★'.repeat(tier)) — raw IV numbers and rarity NEVER reach any render path (data interfaces carry gradeKey + stars only)
    - Thenable chain-mock test helper (heroes/hero test suites): db.select/tx.select chain mocks where the terminal step returns a THENABLE mock — the command code awaits the last chain method directly (drizzle query objects are thenable), so awaiting resolves the queued result
    - Companion switch as the D-04 recovery path: handleCompanionPress FOR UPDATE tx (ownership gate T-10-07-03 + serialized last-writer-wins T-10-07-06), already-active press is a no-op (defense in depth, button disabled anyway), post-switch re-render via the shared renderHeroDetail
    - F9 duplicate disambiguation: user_heroes allows multiple copies per (userId, heroId) — /sanguo hero matches by per-locale name or numeric heroes.id; on multiple matches prefer the ACTIVE companion copy, else the earliest captured (lowest userHeroes.id)

key-files:
  created:
    - src/commands/sanguo/heroes.ts
    - src/commands/sanguo/hero.ts
    - src/ui/embeds/buildSanguoHeroesEmbed.ts
    - src/ui/embeds/buildSanguoHeroEmbed.ts
    - src/ui/components/sanguoStarterButtons.ts
    - src/ui/components/sanguoHeroesZoneMenu.ts
    - src/ui/components/sanguoHeroCompanionButton.ts
    - src/commands/sanguo/__tests__/heroes.test.ts
    - src/commands/sanguo/__tests__/hero.test.ts
  modified:
    - src/commands/sanguo/map.ts
    - src/events/interactionCreate.ts
    - src/commands/sanguo/__tests__/map.test.ts
    - locales/vi/sanguo.json
    - locales/en/sanguo.json
    - locales/zh-cn/sanguo.json

key-decisions:
  - "The starter grant is FREE and the ONLY faucet (D-19): handleStarterPick contains no wallet import/call (grep == 0) — the test asserts the wallet mock is never invoked on the pick path."
  - "Collection stars come from the PUBLIC heroes.tier (★1-5) and the grade from the iv_grade.* keys; the data interfaces carry gradeKey + stars only — no IV column, no rarity column can reach the render path (D-12 enforced structurally, not just by convention)."
  - "heroes.empty_filtered is a new i18n key (not in the UI-SPEC pinned set): the flagged filtered-empty assumption requires the zone-filtered empty view to render an empty-hint line, never the starter picker — the picker is the entirely-empty-collection state only."
  - "hero.field_stars/field_grade/field_hp_mp field-name keys were added (the UI-SPEC contract pinned hero.title/companion_button/companion_label/fainted/error but not the fixed-field NAMES the detail embed renders)."
  - "The buildSanguoHeroesEmbed data interface adds optional successName (SUCCESS starter-acquired state) and emptyHint (filtered-empty line) — the plan's pinned interface only covered picker + collection states; both are additive and keep the D-12 contract intact."
  - "map.ts SC5 fix surfaced a latent bug: the fetchCommandContext destructure lacked `user`, so user.id threw before getCurrentPosition — the guard now checks !char || !user (matches travel.ts)."
  - "The map SC5 getCurrentPosition import stays direct from travelService (the initial './travel.js' re-export workaround was reverted once the real bug — the missing user destructure — was found)."

patterns-established:
  - "Starter-picker-as-empty-state (D-14) with a FOR UPDATE view counter and set rotation — onboarding is the collection command's empty branch, no separate onboarding surface"
  - "Free-faucet grant (D-19) sharing the capture IV discipline: 6× crypto.randomInt(0,32), hp_current = base HP, captured_zone NULL, guarded by an in-tx empty-collection re-check"
  - "Grade-only hidden-mechanics rendering (D-12): ivGradeKey() duplicated in heroes.ts/hero.ts (established pickName duplication convention), grade keys from STATE.md bands, stars from tier"

requirements-completed: [TQC-12, TQC-13]

coverage:
  - id: D1
    description: "Starter picker as the empty-collection state (D-14): exactly 3 starter buttons (set 1 Tào Tháo/Lưu Bị/Tôn Kiên) in ONE ActionRow with heroes.empty_title/body; starterViews increments on every empty invocation via a FOR UPDATE tx; 4th+ invocation (views >= 3) rotates to set 2 (Trương Giác/Viên Thiệu/Đổng Trác); no 4th option ever exists in set 1"
    requirement: TQC-13
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/heroes.test.ts#empty collection renders the starter picker + increments starterViews"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/heroes.test.ts#4th empty invocation rotates the pool to set 2"
        status: pass
    human_judgment: false
  - id: D2
    description: "FREE starter grant (D-19 — the ONLY faucet): handleStarterPick inserts user_heroes with 6 crypto IVs each in [0,31], hp_current = base HP, captured_zone NULL, sets activeHeroId, resets starterViews; NO wallet call (grep gate == 0 + wallet-mock assertion); double-grant guarded by the in-tx empty re-check (T-10-07-01)"
    requirement: TQC-12
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/heroes.test.ts#handleStarterPick grants the hero FREE — NO wallet call"
        status: pass
      - kind: other
        ref: "grep: 0 deductBalance / services/wallet in heroes.ts; 0 across heroes.ts+hero.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Non-empty collection (TQC-13): one line per owned hero {{emoji}} {{name}} • {{stars}} • {{grade}}{{active}} with stars from heroes.tier, IV grade keys (STATE.md bands), exactly one ⭐ active badge; NO raw IV numbers and NO rarity in any embed data (D-12); 1-vs-many render the same line format; title count reflects the total"
    requirement: TQC-13
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/heroes.test.ts#non-empty collection renders lines — NO raw IV / rarity"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/heroes.test.ts#a collection with 1 hero renders the same line format"
        status: pass
    human_judgment: false
  - id: D4
    description: "Zone filter (D-15): sanguo:heroes:zone select in its OWN ActionRow (CR-09-01), stable map_zones codes as values, per-locale zone labels; selecting a zone re-renders with the filtered count + zone label; unknown/empty values fall back to the FULL collection — never a crash (T-10-07-05); filtered-empty renders heroes.empty_filtered (never the starter picker)"
    requirement: TQC-13
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/heroes.test.ts#selecting a zone re-renders with the filtered count"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/heroes.test.ts#unknown zone value falls back to the full collection"
        status: pass
    human_judgment: false
  - id: D5
    description: "Hero detail (D-16): ownership-gated fixed-field embed (emoji, per-locale name, stars, iv_grade key, base-only HP/MP, companion status label when active, 💀 fainted badge when hpCurrent=0); not-owned → hero.error DANGER with no stat leak; companion button disabled when already active; F9 duplicate disambiguation prefers the active copy"
    requirement: TQC-13
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/hero.test.ts#an OWNED hero renders the detail + disabled button"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/hero.test.ts#a NON-OWNED hero renders hero.error — no stat leak"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/hero.test.ts#F9 duplicate disambiguation prefers the ACTIVE copy"
        status: pass
    human_judgment: false
  - id: D6
    description: "Companion switch (D-16/D-04): handleCompanionPress updates user_sanguo_state.activeHeroId inside a FOR UPDATE tx (ownership gate T-10-07-03, serialized T-10-07-06); already-active press is a no-op; non-owned / NaN heroId → hero.error; post-switch re-render shows the button disabled"
    requirement: TQC-13
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/hero.test.ts#handleCompanionPress switches activeHeroId inside a FOR UPDATE tx"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/hero.test.ts#pressing the ALREADY-ACTIVE hero is a no-op"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/hero.test.ts#a NON-OWNED companion heroId → hero.error"
        status: pass
    human_judgment: false
  - id: D7
    description: "Map SC5 current-position fix (TQC-13 SC5): /sanguo map current_position now comes from getCurrentPosition(user.id) — the player's real node with per-locale name — NOT rows[0]; zones content + node list unchanged; node-code fallback when the node row is missing"
    requirement: TQC-13
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/map.test.ts#SC5 current_position comes from getCurrentPosition, NOT rows[0]"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/map.test.ts#SC5 falls back to the node code"
        status: pass
    human_judgment: false
  - id: D8
    description: "Router + wiring (TQC-13): heroes/hero subcommands registered on /sanguo (map.ts, the ONLY setName('sanguo') file — Pitfall 3); interactionCreate dispatches sanguo:heroes:zone (===) / sanguo:heroes:starter:* (prefix) / sanguo:hero:companion:* (prefix) BEFORE the chat-input gate, each try/catch + logger.error; SanguoComponentHandlers extended"
    requirement: TQC-13
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/heroes.test.ts#interactionCreate routes sanguo:heroes:* / sanguo:hero:* BEFORE the chat-input gate"
        status: pass
      - kind: other
        ref: "grep: setName('sanguo') only in map.ts; ZONE_MENU_ID/STARTER_PICK_PREFIX/COMPANION_PREFIX routes present"
        status: pass
    human_judgment: false
  - id: D9
    description: "i18n parity: heroes.*/hero.*/iv_grade.*/cmd.heroes.*/cmd.hero.* keys with identical structure across vi/en/zh-cn (check-i18n green)"
    verification:
      - kind: other
        ref: "npm run check-i18n exits 0"
        status: pass
    human_judgment: false
  - id: D10
    description: "Interaction-latency backstop (UI-SPEC 🧪): the collection fetch (async DB read via deferReply → editReply within the 3s window) is handler-tested but has no held-out live interaction test"
    verification: []
    human_judgment: true
    rationale: "UI-SPEC marks heroes-collection loading as a backstop ('no skeleton exists on Discord'); the unit suite proves the handler replies without throwing, but wall-clock latency on a real shard needs a live-UAT sign-off — consistent with the battle-log/capture-view backstops (10-06 D8)."

# Metrics
duration: 41min
completed: 2026-08-13
status: complete
---

# Phase 10 Plan 7: Heroes Collection, Starter Onboarding & Companion Switch Summary

**The vertical loop is closed: the collection (TQC-13), starter onboarding (D-14 — the game's ONLY free faucet, D-19), and hero-detail/companion surfaces (D-16/D-04) shipped — /sanguo heroes renders the starter picker on an empty collection with the set-1→set-2 rotation, then the owned-only per-zone collection (★ stars from public tier + IV grade keys, D-12 never-render) with the zone filter select in its own ActionRow; /sanguo hero renders an ownership-gated detail with the FOR UPDATE companion switch; /sanguo map now shows the player's REAL current position (SC5); the router dispatches the new customIds; full heroes.*/hero.*/iv_grade.* i18n in vi/en/zh-cn — all proven by 20 new tests (9 behaviors) with the whole 282-test suite + check-i18n + typecheck + lint green**

## Performance

- **Duration:** 41 min
- **Started:** 2026-08-13T08:05:00Z (approx)
- **Completed:** 2026-08-13T08:46:00Z (approx)
- **Tasks:** 3 (2 TDD auto + 1 auto; 5 commits)
- **Files modified:** 15 (9 created, 6 modified)

## Accomplishments

- **`/sanguo heroes` — the collection command is the onboarding surface (D-14/TQC-13)** — an EMPTY collection renders the starter picker: exactly 3 buttons in ONE ActionRow (set 1 Tào Tháo / Lưu Bị / Tôn Kiên, `sanguo:heroes:starter:{heroId}`) + `heroes.empty_title/body`; every empty invocation increments `user_sanguo_state.starterViews` in a FOR UPDATE tx (one row per user, INSERT-if-missing); from the 4th invocation (views ≥ 3) the pool rotates to set 2 (Trương Giác / Viên Thiệu / Đổng Trác) — no 4th option ever exists in set 1 (UI-SPEC zero-one-many). A NON-empty collection renders one line per owned hero `{{emoji}} {{name}} • {{stars}} • {{grade}}{{active}}` ordered by heroes.id, with the zone filter select (`sanguo:heroes:zone`) in its OWN ActionRow (CR-09-01).
- **The FREE starter grant (D-19 — the ONLY faucet)** — `handleStarterPick` runs a FOR UPDATE tx that re-checks the collection is still empty (T-10-07-01: a second pick serializes and finds a non-empty collection → `heroes.error`, never a double-grant), rolls 6× `crypto.randomInt(0,32)` IVs (the same distribution as capture, TQC-12), inserts `user_heroes` with `hp_current` = the hero's base HP and `captured_zone` NULL (A5 — starter grants aren't zone-captured), sets `activeHeroId` + resets `starterViews`, and replies the SUCCESS `heroes.success` embed. **Zero wallet calls anywhere** — grep-gated (0 `deductBalance` in heroes.ts/hero.ts) and asserted via the wallet mock.
- **D-12 hidden mechanics held structurally** — the embed data interfaces carry `gradeKey` (sum/186 bands: gold/ruby/sapphire/jade/gray from STATE.md) and `stars` ('★'.repeat(tier)) ONLY; no IV column, no rarity column, no iv sum can reach any render path; tests assert no `iv_str`/`rarity` in the embed JSON.
- **`/sanguo hero` — ownership-gated detail + companion switch (D-16/D-04)** — the option resolves against the user's OWNED copies (match by per-locale name or numeric heroes.id; F9 duplicate disambiguation prefers the ACTIVE companion copy, else the earliest captured); not-owned → `hero.error` DANGER with no stat leak. The detail renders emoji, name, ★ stars, grade, base-only HP/MP, the companion status label when active, the 💀 fainted badge at 0 HP, and the 'Chọn làm hero đồng hành' button (disabled when already active). `handleCompanionPress` switches `activeHeroId` inside a FOR UPDATE tx — ownership gate (T-10-07-03), serialized last-writer-wins (T-10-07-06), already-active press is a no-op (defense in depth).
- **Map SC5 fix (TQC-13)** — `/sanguo map`'s `current_position` now comes from `getCurrentPosition(user.id)` (the player's real node, per-locale name, node-code fallback), NOT `rows[0]`; zone markers/content unchanged. The fix surfaced and resolved a latent bug: the `fetchCommandContext` destructure lacked `user`, so `user.id` threw before any position read.
- **Wiring + routing** — `heroesSubcommand`/`heroSubcommand` appended to the `/sanguo` builder (map.ts stays the ONLY file with `setName('sanguo')` — Pitfall 3), dispatch added, handler re-exports extended; `interactionCreate` dispatches `sanguo:heroes:zone` (===) and `sanguo:heroes:starter:*` / `sanguo:hero:companion:*` (prefix) BEFORE the chat-input gate with try/catch + `logger.error`; `SanguoComponentHandlers` extended.
- **i18n parity** — `heroes.*` (11 keys incl. `empty_filtered`) + `hero.*` (8 keys incl. the field-name labels) + `iv_grade.*` (5) + `cmd.heroes.description` + `cmd.hero.description` with identical structure across vi/en/zh-cn; `npm run check-i18n` green.
- **Proven end-to-end** — 20 new tests (9 behaviors) + 4 SC5/fallback map tests; full suite 282/282, `npm run typecheck` clean, `npm run lint` clean (max-warnings 0), all acceptance grep gates pass. The complete loop is now demonstrable: starter pick → travel → encounter → fight → battle log → Bắt → tier → capture success → collection line + companion switch → map position.

## Task Commits

Each task was committed atomically (TDD RED → GREEN for Tasks 1–2):

1. **Task 1: /sanguo heroes — collection + starter picker (D-14) + zone filter (D-15) + free grant** - `d5692ce` (test, RED) + `8ded92c` (feat, GREEN)
2. **Task 2: /sanguo hero — detail embed + companion switch (D-16/D-04) + i18n** - `4a85b5f` (test, RED) + `0013e5a` (feat, GREEN)
3. **Task 3: map.ts registration + SC5 current-position fix + router routes + phase verification** - `354eb6d` (feat)

**Plan metadata:** `docs(10-07): complete heroes collection + starter onboarding plan` (this commit)

## Files Created/Modified

- `src/commands/sanguo/heroes.ts` - heroesSubcommand + execute (empty → starter picker D-14 / non-empty → collection TQC-13) + handleStarterPick (free D-19 grant, FOR UPDATE, no wallet) + handleZoneFilterSelect (D-15, validated zone codes)
- `src/commands/sanguo/hero.ts` - heroSubcommand + ownership-gated execute (F9 disambiguation) + handleCompanionPress (FOR UPDATE switch D-16/D-04) + shared renderHeroDetail
- `src/ui/embeds/buildSanguoHeroesEmbed.ts` - SanguoHeroesEmbedData + builder (starter-picker / collection / filtered-empty / starter-acquired SUCCESS states)
- `src/ui/embeds/buildSanguoHeroEmbed.ts` - SanguoHeroEmbedData + fixed-field detail builder (D-12 clean)
- `src/ui/components/sanguoStarterButtons.ts` - STARTER_PICK_PREFIX + buildStarterButtons + STARTER_SET_1/STARTER_SET_2 (exactly 3 each)
- `src/ui/components/sanguoHeroesZoneMenu.ts` - ZONE_MENU_ID + buildZoneFilterMenu (stable codes, own row)
- `src/ui/components/sanguoHeroCompanionButton.ts` - COMPANION_PREFIX + buildCompanionButton (disabled param)
- `src/commands/sanguo/map.ts` - heroes/hero subcommands + dispatch + re-exports + SC5 getCurrentPosition fix (+ `user` in the guard)
- `src/events/interactionCreate.ts` - sanguo:heroes:*/sanguo:hero:* routes + extended SanguoComponentHandlers
- `src/commands/sanguo/__tests__/heroes.test.ts` - 8 tests (5 behaviors + faucet-free proof + D-12 never-render + router)
- `src/commands/sanguo/__tests__/hero.test.ts` - 8 tests (4 behaviors + F9 + no-op + NaN + D-12)
- `src/commands/sanguo/__tests__/map.test.ts` - SC5 position tests + mock updates for the new travelService dependency
- `locales/vi/sanguo.json` + `locales/en/sanguo.json` + `locales/zh-cn/sanguo.json` - heroes.*/hero.*/iv_grade.*/cmd.heroes.*/cmd.hero.* keys

## Decisions Made

- **The starter grant is FREE and the ONLY faucet (D-19)** — the wallet is mocked in tests and asserted never-called on the pick path; grep gates enforce zero `deductBalance` in the collection/starter/hero surfaces. Picking from set 2 is allowed (both sets are valid starters).
- **Collection stars come from the PUBLIC `heroes.tier`, grade from `iv_grade.*` keys** — D-12 enforced structurally: the embed data interfaces cannot carry IV or rarity values, so the never-render contract holds by construction, not convention.
- **`heroes.empty_filtered` added as an i18n key** — the flagged filtered-empty assumption (a zone-filtered empty view must render an empty-hint line, never the starter picker) needed copy; the pinned UI-SPEC set had none.
- **`hero.field_stars/field_grade/field_hp_mp` field-name keys added** — the UI-SPEC contract pinned the hero.* value keys but not the fixed-field NAMES the detail embed renders.
- **`successName`/`emptyHint` optional fields on SanguoHeroesEmbedData** — additive states for the starter-acquired SUCCESS embed and the filtered-empty view beyond the plan's pinned picker/collection interface.
- **map.ts's `user` destructure bug fixed as part of SC5** — the pre-existing guard checked only `!char`; the new `getCurrentPosition(user.id)` call would have thrown on every map render.
- **F9 resolution documented in the embed path** — prefer the ACTIVE companion copy, else the earliest captured (lowest userHeroes.id); the detail re-renders the resolved copy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] map.ts `fetchCommandContext` destructure lacked `user` — the SC5 position read would always throw**
- **Found during:** Task 3 (SC5 implementation + test debugging)
- **Issue:** The plan says "The map execute signature already receives `user` from fetchCommandContext" — but the destructure was `{ t, char, locale, shardId }`; `getCurrentPosition(user.id)` hit `user is undefined` on every invocation (rendering the generic map.error). A long debugging detour (mock-resolution theories) traced to this single missing variable.
- **Fix:** Added `user` to the destructure and extended the guard to `!char || !user` (matches travel.ts). Reverted a temporary `./travel.js` re-export workaround once the real cause was found.
- **Files modified:** `src/commands/sanguo/map.ts`
- **Verification:** SC5 tests assert `getCurrentPosition` called with 42 and the embed shows the real node; full suite green.
- **Committed in:** `354eb6d` (Task 3)

**2. [Rule 2 - Missing Critical] Test-infrastructure: thenable chain-terminal mock**
- **Found during:** Task 1 GREEN (test debugging)
- **Issue:** The initial chain-mock terminal returned a bare `vi.fn`, but the command code AWAITS the last chain method's return value directly (drizzle query objects are thenable) — awaiting the bare mock resolved to the function itself, so every db read destructured "not iterable".
- **Fix:** The terminal mock is now a thenable (`fn.then = (onF, onR) => Promise.resolve(result).then(onF, onR)`), so `await .where(...).limit(1)` etc. resolve the queued result exactly like a real drizzle query.
- **Files modified:** `src/commands/sanguo/__tests__/heroes.test.ts`, `src/commands/sanguo/__tests__/hero.test.ts`
- **Verification:** All chain shapes (where / limit / orderBy / for('update') / innerJoin) resolve correctly; suites green.
- **Committed in:** `8ded92c` / `0013e5a` (GREEN commits)

**3. [Plan-internal gap - additive i18n keys] `heroes.empty_filtered` + `hero.field_*` field names**
- **Found during:** Tasks 1–2 implementation
- **Issue:** The plan's flagged filtered-empty assumption requires copy for a zone-filtered empty view, and the detail embed needs fixed-field NAMES — neither exists in the pinned UI-SPEC key set.
- **Fix:** Added the keys to all 3 locales (check-i18n parity preserved); documented in Decisions.
- **Files modified:** `locales/{vi,en,zh-cn}/sanguo.json`
- **Verification:** `npm run check-i18n` green.
- **Committed in:** `8ded92c` (empty_filtered) + `0013e5a` (field names)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 1 Rule 2 test-infrastructure, 1 plan-internal additive)
**Impact on plan:** All fixes are correctness requirements inside the task scope (the missing `user` would have broken the SC5 feature entirely; the thenable terminal is required for the mandated await-the-chain pattern; the additive keys implement the plan's own flagged assumptions). No scope creep.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| None | — | — | No stubs: the starter picker, collection, hero detail, and companion switch all render from real DB state; no placeholder text, no hardcoded empty values, no unwired components. The only `placeholder` occurrence is the StringSelectMenu's legitimate placeholder API (`heroes.zone_filter`). |

## Issues Encountered

- **Mock-resolution debugging detour (Task 3)** — SC5 tests showed the travelService mock "not applying" to map.ts while applying to travel.ts. The actual cause was the missing `user` destructure (map.ts threw before any db/mock call). The detour consumed significant time but produced the thenable-chain helper insight and confirmed the mock registry was correct all along.
- **Accidental `node_modules/vitest` deletion during cache clearing** — removing `node_modules/.vite*` plus `vitest` broke the runner (`MODULE_NOT_FOUND`); restored via `npm install`. No code impact.
- **TDD RED lint friction (repeat of 10-05/10-06)** — eslint rejected the RED commits for unused imports (`readFileSync` after the router test moved to Task 3; unused starter fixtures); removed before committing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 10 COMPLETE** — the full vertical loop is demonstrable in code: starter pick (free) → travel → encounter → battle log → capture (fee-based) → collection line (stars + IV grade) → companion switch → map position. TQC-12 (IV rolls at capture/starter) and TQC-13 (collection/hero/map surfaces) are satisfied; check-i18n/typecheck/lint all green.
- **Phase 11 (Progression, Chemistry & Economy Depth, TQC-14..17)** — the collection renders duplicate hero copies (dupe → hồn ngọc conversion consumes them); formations/chemistry/roles reference `heroes.class/faction_id/family_id` seeded in Phase 8; the companion-switch surface is the D-04 recovery path the economy depth will build on.
- **Open verification items for the verifier** — the UI-SPEC interaction-latency backstops (battle log, capture view, heroes collection: deferReply → editReply within the 3s window) need a live-UAT sign-off; boss capture remains the one known open loop (10-05/10-06 Known Stubs — D-13 boss→heroes mapping deferred to a future content/schema decision, WINDOWS.md #5).

---

*Phase: 10-battle-capture*
*Completed: 2026-08-13*

## Self-Check: PASSED

- Files exist: heroes.ts, hero.ts, buildSanguoHeroesEmbed.ts, buildSanguoHeroEmbed.ts, sanguoStarterButtons.ts, sanguoHeroesZoneMenu.ts, sanguoHeroCompanionButton.ts, heroes.test.ts, hero.test.ts, 10-07-SUMMARY.md
- Commits exist: d5692ce (RED heroes), 8ded92c (GREEN heroes), 4a85b5f (RED hero), 0013e5a (GREEN hero), 354eb6d (Task 3)
- Verification green: 282/282 tests; npm run typecheck exit 0; check-i18n exit 0; npm run lint exit 0 (max-warnings 0); grep gates (0 deductBalance, single setName('sanguo') file, getCurrentPosition present)
