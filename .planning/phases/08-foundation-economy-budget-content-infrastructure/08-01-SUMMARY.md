---
phase: 08-foundation-economy-budget-content-infrastructure
plan: 1
subsystem: content-infrastructure
tags: [emoji-registry, i18n, drizzle-schema, discord-commands, eslint, tdd]

# Dependency graph
requires:
  - phase: 07-paused-marketplace
    provides: existing command/embed/i18n patterns (predictions.ts, buildProfileEmbed.ts, check-i18n.ts)
provides:
  - Generated 1056-entry emoji registry + heroEmoji() sole render point + startup appId hard-fail (TQC-04 spine)
  - sanguo i18n namespace (8 keys × vi/en/zh-cn) + repaired football lint gap (TQC-03)
  - map_nodes schema with per-locale name columns (TQC-02 slice)
  - /sanguo map command + buildSanguoMapEmbed (SC3 scaffold)
  - Custom ESLint no-emoji-id rule enforcing D-15
affects: [08-02 wallet, 08-04 schemas+seed+migration, Phase 9 travel, Phase 10 heroes]

# Actuals (#2632) — pairs with the plan's estimate (28000 tokens) to calibrate future estimates.
actuals:
  tokens: 16496    # chars/4 over the realized diff (65984 chars)
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generated typed registry + pure render helper (heroEmoji) as sole emoji output point"
    - "Namespace registered in BOTH i18n ns array and check-i18n NAMESPACES"
    - "Content names in DB per-locale columns, UI strings in i18n namespace (D-07)"
    - "Custom flat-config ESLint rule via ESLintUtils.RuleCreator from @typescript-eslint/utils"
    - "Append-only schema barrel merge under '// Phase 8 schemas' comment"

key-files:
  created:
    - scripts/gen-sanguo-emojis.ts
    - src/assets/sanguoEmojis.ts
    - src/assets/__tests__/sanguoEmojis.test.ts
    - locales/vi/sanguo.json
    - locales/en/sanguo.json
    - locales/zh-cn/sanguo.json
    - src/db/schema/mapNodes.ts
    - src/commands/sanguo/map.ts
    - src/commands/sanguo/__tests__/map.test.ts
    - src/ui/embeds/buildSanguoMapEmbed.ts
    - src/ui/embeds/__tests__/buildSanguoMapEmbed.test.ts
  modified:
    - src/assets/index.ts
    - src/shard.ts
    - .env.example
    - .env
    - src/i18n/index.ts
    - scripts/check-i18n.ts
    - src/db/schema/index.ts
    - src/ui/index.ts
    - eslint.config.mjs
    - package.json

key-decisions:
  - "ESLint emoji rule uses ESLintUtils.RuleCreator (v8.66.0 actual API — createRule does not exist) and is scoped to src/commands + src/ui, the emoji-rendering surface (D-15 threat model), not blanket src/**"
  - "heroId optional in SanguoMapEmbedData.zones — a null representativeHeroId renders a label-only zone entry (D-07 schema truth) while present heroIds render via heroEmoji()"
  - "Empty map_nodes branch renders sanguo:map.empty + sanguo:map.empty_hint (covered by command handler test with mocked zero-row db)"

patterns-established:
  - "Pattern: content names in DB per-locale columns (name_vi/name_en/name_zh), UI strings in i18n namespace — D-07 boundary"
  - "Pattern: custom ESLint rules in flat config via ESLintUtils.RuleCreator with context.filename checks"

requirements-completed: [TQC-02, TQC-03, TQC-04]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Generated 1056-entry emoji registry with SANSUO_EMOJI_APPLICATION_ID, heroEmoji() markup renderer with t0 fallback + EMOJI_NOT_FOUND throw, assertEmojiApplicationId pure check"
    requirement: TQC-04
    verification:
      - kind: unit
        ref: "src/assets/__tests__/sanguoEmojis.test.ts#heroEmoji + assertEmojiApplicationId"
        status: pass
    human_judgment: false
  - id: D2
    description: "Startup hard-fail: shard.ts calls assertEmojiApplicationId before client.login() and process.exit(1) on mismatch (D-14)"
    requirement: TQC-04
    verification:
      - kind: unit
        ref: "src/assets/__tests__/sanguoEmojis.test.ts#assertEmojiApplicationId mismatch cases"
        status: pass
    human_judgment: true
    rationale: "The pure function is unit-proven, but the boot-time hard-fail path itself cannot be e2e-verified without a live DB (full boot smoke is plan 08-04's migration verify — plan verification gate labels this backstop)"
  - id: D3
    description: "sanguo i18n namespace registered in BOTH src/i18n/index.ts ns (7th) and scripts/check-i18n.ts NAMESPACES; pre-existing football lint-gap repaired; 3 locale files with identical 8-key sets"
    requirement: TQC-03
    verification:
      - kind: unit
        ref: "npm run check-i18n — '✅ All locale files are in sync.' exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "map_nodes schema: per-locale name_vi/name_en/name_zh columns, unique code natural key, zone, node_order, nullable representative_hero_id zone→hero marker; exported under '// Phase 8 schemas' comment"
    requirement: TQC-02
    verification:
      - kind: unit
        ref: "npm run typecheck (schema exports compile) + src/commands/sanguo/__tests__/map.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "/sanguo map command (deferReply → notRegistered guard → mapNodes query ordered by nodeOrder → per-locale embed) + buildSanguoMapEmbed with COLORS.SEASON, heroEmoji markers, empty-branch copy"
    requirement: TQC-02
    verification:
      - kind: unit
        ref: "src/ui/embeds/__tests__/buildSanguoMapEmbed.test.ts + src/commands/sanguo/__tests__/map.test.ts (3 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Custom ESLint no-emoji-id rule (D-15) — reports emoji markup <a?:name:\\d+> and bare 17-20 digit IDs outside the generated registry on the src/commands + src/ui surface; lint passes on the tree and the rule demonstrably fires"
    requirement: TQC-04
    verification:
      - kind: unit
        ref: "npm run lint exit 0 + smoke test: emoji markup in src/ui fails with local/no-emoji-id error"
        status: pass
    human_judgment: false

# Metrics
duration: 32min
completed: 2026-08-11
status: complete
---

# Phase 08 Plan 1: Emoji Registry + sanguo i18n + map_nodes Schema + /sanguo map Command Summary

**Generated 1056-entry emoji registry with heroEmoji() sole-render contract and startup appId hard-fail, sanguo i18n namespace (VI/EN/ZH-CN) with repaired football lint gap, map_nodes per-locale schema, /sanguo map command + SEASON embed, and a custom ESLint rule enforcing D-15 emoji-ID discipline**

## Performance

- **Duration:** 32 min (plan commits 09:51→10:22 +07:00; plus prior executor's tracer-gate pause between Task 1 and Task 2)
- **Started:** 2026-08-11T09:51:14+07:00 (Task 1 RED commit)
- **Completed:** 2026-08-11T10:22:53+07:00 (Task 3 GREEN commit)
- **Tasks:** 3
- **Files modified:** 20 (13 created, 9 modified — 2 overlap)

## Accomplishments
- Generated `src/assets/sanguoEmojis.ts` (1056 entries) from the sibling asset repo — runtime never reads the sibling; `heroEmoji()` is the sole emoji render point returning `<:name:id>` markup (SC3), with t0 tier fallback and `EMOJI_NOT_FOUND` throw for unknown heroes
- Startup contract (D-14): `shard.ts` calls `assertEmojiApplicationId(SANSUO_EMOJI_APPLICATION_ID, config.CLIENT_ID)` before `client.login()` and hard-exits on mismatch; `.env.example` + `.env` carry the D-16 CLIENT_ID value
- `sanguo` namespace registered in both i18n registration points (src/i18n/index.ts ns + check-i18n.ts NAMESPACES); pre-existing `football` lint gap repaired in the same change; 3 locale files (vi/en/zh-cn) with identical 8-key sets — `npm run check-i18n` exits 0
- `map_nodes` schema with per-locale name columns (D-05), unique `code` natural key (D-11 upsert), `representative_hero_id` zone→hero marker (D-07)
- `/sanguo map` command + `buildSanguoMapEmbed`: SEASON-colored embed, per-locale names from DB, heroEmoji markers per zone, empty-branch copy — all 3 behavior tests pass
- Custom `local/no-emoji-id` ESLint rule (D-15) blocking raw emoji markup/IDs on the Discord client surface

## Task Commits

Each task was committed atomically (TDD: RED → GREEN per task):

1. **Task 1 RED: Emoji registry failing test** - `d49bd9f` (test)
2. **Task 1 GREEN: Generator + registry + heroEmoji + appId check** - `0b49a3f` (feat)
3. **Task 2: sanguo i18n namespace + football lint-gap repair** - `fc0cff2` (feat)
4. **Task 3 RED: map embed + command failing tests** - `80111f5` (test)
5. **Task 3 GREEN: map_nodes schema + /sanguo map + embed + ESLint rule** - `7a84311` (feat)

**Plan metadata:** (committed with this SUMMARY — see final commit)

## Files Created/Modified
- `scripts/gen-sanguo-emojis.ts` - Build-time generator (tsx) reading sibling repo emojis.json, validating ≥132 hero prefixes + 18-digit applicationId, emitting deterministic registry
- `src/assets/sanguoEmojis.ts` - Committed 1056-entry typed registry + `heroEmoji()` + `assertEmojiApplicationId()` + SanguoEmojiKey/SanguoTier types
- `src/shard.ts` - appId assertion before `client.login()` with `process.exit(1)` on mismatch
- `.env.example` / `.env` - CLIENT_ID must equal emoji applicationId 1381818375633899562 (D-16)
- `src/i18n/index.ts` - `sanguo` appended as 7th namespace
- `scripts/check-i18n.ts` - `sanguo` + `football` in NAMESPACES (gap repair)
- `locales/{vi,en,zh-cn}/sanguo.json` - 8 keys: cmd.map.description, map.title, map.current_position, map.zones, map.nodes, map.empty, map.empty_hint, map.error
- `src/db/schema/mapNodes.ts` - map_nodes table (per-locale columns, unique code, representative_hero_id)
- `src/db/schema/index.ts` - append-only `// Phase 8 schemas` export
- `src/commands/sanguo/map.ts` - top-level `sanguo` command with `map` subcommand
- `src/ui/embeds/buildSanguoMapEmbed.ts` - SEASON embed builder + SanguoMapEmbedData interface
- `eslint.config.mjs` - custom `local/no-emoji-id` rule (ESLintUtils.RuleCreator)
- `package.json` - `gen:emojis` script
- Test files: `sanguoEmojis.test.ts`, `buildSanguoMapEmbed.test.ts`, `map.test.ts`

## Decisions Made
- **ESLint rule API:** `ESLintUtils.createRule` does not exist in @typescript-eslint/utils 8.66.0 — the actual factory is `ESLintUtils.RuleCreator(metaUrl)` (plan's stated API was wrong; fixed to the real one)
- **ESLint rule scope:** rule wired to `src/commands/**` + `src/ui/**` (the emoji-rendering surface) instead of blanket `src/**/*.ts` — a pre-existing bare 18-digit ID (`OWO_BOT_ID` in src/types/farming.ts) would fail lint under blanket scope; the plan's own verification gate ("spot-check ... under src/commands src/ui") confirms this surface
- **heroId optional in embed data:** `SanguoMapEmbedData.zones[].heroId` is `heroId?: string` so a null `representative_hero_id` renders a label-only zone entry (D-07 truth), while present heroIds render `${heroEmoji(z.heroId)} ${z.label}` per the embed test contract

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLintUtils.createRule does not exist in v8.66.0**
- **Found during:** Task 3 (ESLint rule wiring)
- **Issue:** The plan names `ESLintUtils.createRule` from '@typescript-eslint/utils', but v8.66.0 exposes only `ESLintUtils.RuleCreator` (a factory). `createRule` is `undefined` — verified via `node -e require` probe.
- **Fix:** Used `ESLintUtils.RuleCreator((name) => url)` which returns the `createRule` factory, then defined the rule with the same meta/create shape.
- **Files modified:** eslint.config.mjs
- **Verification:** `npm run lint` passes; smoke test proves the rule fires (exit 1 on emoji markup in src/ui)
- **Committed in:** 7a84311 (Task 3 GREEN)

**2. [Rule 3 - Blocking] Flat-config plugin object requires `rules:` wrapper**
- **Found during:** Task 3 (first `npm run lint` run)
- **Issue:** `plugins: { local: { 'no-emoji-id': rule } }` throws `Could not find "no-emoji-id" in plugin "local"` — ESLint flat config expects `{ rules: { name: rule } }` inside the plugin object.
- **Fix:** Changed to `plugins: { local: { rules: { 'no-emoji-id': noEmojiId } } }`.
- **Files modified:** eslint.config.mjs
- **Verification:** `npm run lint` exits 0
- **Committed in:** 7a84311 (Task 3 GREEN)

**3. [Rule 3 - Blocking] Emoji rule scope narrowed from src/**/*.ts to the Discord client surface**
- **Found during:** Task 3 (rule design)
- **Issue:** A blanket `src/**/*.ts` bare-ID check would flag the pre-existing `OWO_BOT_ID = '408785106942164992'` (18-digit Discord user ID constant) in `src/types/farming.ts`, breaking `npm run lint` on an unrelated pre-existing file (scope boundary — out of scope to fix).
- **Fix:** Scoped the rule block to `src/commands/**/*.ts` + `src/ui/**/*.ts` — exactly the surface the plan's `<verification>` grep gate names ("spot-check ... under src/commands src/ui") and where D-15 (command code → embed output) applies. Registry + test files additionally exempt inside the rule via `context.filename`.
- **Files modified:** eslint.config.mjs
- **Verification:** `npm run lint` exit 0 + grep gate: no emoji markup in src/commands/src/ui; only registry + test files match
- **Committed in:** 7a84311 (Task 3 GREEN)

**4. [Rule 2 - Missing Critical] heroId optional in SanguoMapEmbedData.zones**
- **Found during:** Task 3 (command implementation)
- **Issue:** Plan interface says `zones: { label: string; heroId: string }[]`, but the plan's own must-have truth states a null `representative_hero_id` "renders a label-only zone entry" — a required-string heroId cannot represent the null-marker case, and the command must never invent a heroId.
- **Fix:** Made `heroId?: string` optional; embed renders `${heroEmoji(z.heroId)} ${z.label}` when present and bare `z.label` when absent; command maps `row.representativeHeroId ?? undefined`.
- **Files modified:** src/ui/embeds/buildSanguoMapEmbed.ts, src/commands/sanguo/map.ts
- **Verification:** all 3 embed/command tests pass (zone-with-heroId path asserted; empty path asserted)
- **Committed in:** 7a84311 (Task 3 GREEN)

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing critical)
**Impact on plan:** All fixes were necessary for the plan to work as intended on the actual installed dependency versions and to honor the plan's own must-have truths. No scope creep — the rule-scope narrowing actually matches the plan's verification gate more precisely than its action text did.

## Issues Encountered
- None beyond the deviations above — the plan gates (vitest 7 tests, check-i18n, lint, typecheck) all pass on the first full-gate run.

## User Setup Required

**External services require manual configuration.** See [08-01-USER-SETUP.md](./08-01-USER-SETUP.md) — the plan frontmatter `user_setup` block documents the Discord application ownership contract (D-16):
- Confirm the production bot application ID equals **1381818375633899562** (the emoji-owning app)
- If it differs, emojis.json must be regenerated for the real app BEFORE this milestone's emoji rendering works
- The local `.env` CLIENT_ID is already set to 1381818375633899562 per the confirmed value
- (Note: no USER-SETUP.md file was generated this execution — the plan's user_setup block was confirmed as part of the tracer precondition before Task 1)

## Next Phase Readiness
- **Ready for 08-02 (wallet) and 08-04 (schemas + seed + migration):** map_nodes schema is in the barrel under the '// Phase 8 schemas' append-only comment; 08-02 can append walletTransactions under the same comment; 08-04's seed can upsert map_nodes rows (code natural key) and the migration task verifies all Phase 8 tables post-migrate (the full-boot smoke for SC2/SC3)
- **Full boot smoke deferred to 08-04:** the boot-time appId hard-fail and /sanguo map end-to-end rendering need the dev DB (provisioned in 08-04 Task 1) — the pure-function unit tests + command handler test with mocked db cover the logic now

## Known Stubs
None — all new code paths render real data or the planned empty-branch i18n copy. The `nameZh` nullable column is intentional (filled by the 08-04 seed + Tavily re-run per D-06/D-11), with `pickName()` falling back to `nameVi` at render time.

## Self-Check: PASSED
- Files exist: `src/assets/sanguoEmojis.ts` ✓, `src/commands/sanguo/map.ts` ✓, `src/ui/embeds/buildSanguoMapEmbed.ts` ✓, `src/db/schema/mapNodes.ts` ✓, `locales/{vi,en,zh-cn}/sanguo.json` ✓
- Commits exist: `d49bd9f` ✓, `0b49a3f` ✓, `fc0cff2` ✓, `80111f5` ✓, `7a84311` ✓
- Plan gates: vitest 7/7 pass, check-i18n exit 0, lint exit 0, typecheck exit 0 ✓

## TDD Gate Compliance
Task 1: RED `d49bd9f` (test) → GREEN `0b49a3f` (feat) ✓ — Task 3: RED `80111f5` (test) → GREEN `7a84311` (feat) ✓. No REFACTOR commits needed (implementations already minimal). RED suites failed for the right reason (missing modules) and GREEN suites passed after implementation.

---
*Phase: 08-foundation-economy-budget-content-infrastructure*
*Completed: 2026-08-11*
