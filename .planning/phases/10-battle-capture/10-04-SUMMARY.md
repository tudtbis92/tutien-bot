---
phase: 10-battle-capture
plan: 04
subsystem: content-seed
tags: sanguo-base-stats, seed, rarity, tier, A2-templates, D-02, D-08, D-12, D-20, TQC-12

# Dependency graph
requires:
  - phase: 10-battle-capture (10-02)
    provides: heroes str/agi/int/mov/lea/cha/hp/mp + hidden rarity + public tier columns + rarity_range/tier_range checks (migration 0019)
  - phase: 10-battle-capture (10-03)
    provides: RARITY_DISTRIBUTION (60/25/10/4/1) — the signed D-20 contract the seed bins against
  - phase: 08-foundation
    provides: sanguo-classifications.json 132-hero canonical key space (class/faction), heroes-v1.json, the idempotent seed-sanguo.ts upsert pattern
provides:
  - scripts/data/sanguo-base-stats.json — { heroId: { str, agi, int, mov, lea, cha, hp, mp, rarity, tier } } for all 132 heroes (A2 class-template generation, 79/33/13/5/2 rarity binning, independent public tier)
  - scripts/seed-sanguo.ts — FATAL-guarded base-stats load + 10-column clobber-safe upsert extension (idempotent, double-run stable)
  - Live dev DB: every heroes row now carries real base stats + rarity + tier (COUNT = 132 for all ten columns)
affects: 10-05 (captureService chance/flee reads rarity; battleCheckInService combatStat = base+IV), 10-07 (collection renders tier stars, starter picker reads the 6 starter rows), Phase 12 audit (D-20 distribution observable in DB)

actuals:
  tokens: 6570    # chars/4 over realized diff (estimate was 48000/raw 24000 — content dataset + seed edit is lighter than estimated)
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Content dataset with REQUIRED FATAL guard (loadBaseStats) — unlike the optional zh-names map, base stats gate every battle/capture formula (loadClassifications analog)
    - Clobber-safe 10-column spread in the hero upsert: values written only when the heroId has a dataset entry; never NULL-clobbers (D-11), unconditional-but-guarded because the dataset is complete
    - JSON cannot carry the template-table header (a _comment key would break the plan's own cross-check) -> A2 template table documented in the seed script header

key-files:
  created:
    - scripts/data/sanguo-base-stats.json
  modified:
    - scripts/seed-sanguo.ts

key-decisions:
  - "A2 template generation adopted: per-class stat templates + prominence (rarity) modifiers + deterministic FNV-1a hash jitter per hero — deterministic, reviewable, no per-hero research round (RESEARCH Open Question 2 defaulted to A2)"
  - "Rarity binned to the signed D-20 distribution: 79/33/13/5/2 for 132 (60/25/10/4/1 x 132 = 79.2/33/13.2/5.28/1.32; per-bin deviation <= 0.7, within the plan's ±2 tolerance)"
  - "Public tier seeded INDEPENDENTLY of rarity: tier = rarity + deterministic hash jitter (-1/0/+1), clamped 1-5 — roughly correlated with prominence, never derived from rarity at render time (D-12); observable variance: guan_yu ★4 vs zhang_fei ★5, at_ba_to ★2 at rarity 1"
  - "Starter roster boost: the 6 starters (cao_cao/liu_bei/sun_jian/truong_giac/yuan_shao/dong_trac, D-14 names) carry class-template stats + a flat +6 key-stat / +10 HP / +10 MP boost on top of their prominence modifier — 'first hero feels usable' (flagged assumption adopted)"
  - "Template table documented in the seed script header (plan-permitted fallback) — a top-level _comment key in the JSON would be flagged MISSING by the plan's own cross-check (statIds = Object.keys(stats))"

patterns-established:
  - "Content dataset shape: { heroId: { 6 stat ints 10-90, hp 50-300, mp 10-200, rarity 1-5, tier 1-5 } } keyed exactly to the classifications key space — cross-validated before commit, zero orphans"
  - "Rarity distribution observable in the DB (GROUP BY rarity = 79/33/13/5/2) — Phase 12 audit can verify the signed D-20 contract against live content"

requirements-completed: [TQC-12]

coverage:
  - id: D1
    description: "scripts/data/sanguo-base-stats.json — base STR/AGI/INT/MOV/LEA/CHA + HP + MP + hidden rarity (D-08, 1-5) + public tier (★1-5) for all 132 heroes + the 6 starter entries; key space cross-checked vs sanguo-classifications.json (0 missing, 0 orphan), all values in band, rarity distribution 79/33/13/5/2 approximating the signed D-20 60/25/10/4/1"
    requirement: TQC-12
    verification:
      - kind: other
        ref: "node probe: BASE-STATS JSON VERIFIED + PARSE OK + RARITY DIST 79/33/13/5/2 + STARTERS PRESENT 6 (cross-check vs classifications, range/band checks, starter key presence)"
        status: pass
    human_judgment: true
    rationale: "The structural cross-check is automated, but the CONTENT judgment — which heroes are binne to rarity 5/4/3 (Cao Cao + Guan Yu at 5, the five founding rulers at 4) and the prominence-tiered stat modifiers — is an agent-discretion content signing decision (flagged assumption A2, adopted per CONTEXT). The user may want to eyeball the prominence ranking before it feeds capture odds and collection display."
  - id: D2
    description: "seed-sanguo.ts extension — FATAL-guarded base-stats load + 10-column clobber-safe upsert writing the dataset into the live dev DB idempotently (double-run stable, zero NULL columns, 6 starter rows present, typecheck green)"
    requirement: TQC-12
    verification:
      - kind: other
        ref: "npm run seed:sanguo x2 exits 0; DB probe: heroes c=132, COUNT(str..tier)=132 each (no NULLs), STARTERS: 6, rarity dist 79/33/13/5/2; npm run typecheck exits 0"
        status: pass
    human_judgment: false

# Metrics
duration: 21min
completed: 2026-08-13
status: complete
---

# Phase 10 Plan 4: Content Pass — Base Stats + Rarity + Tier for 132 Heroes (D-02/D-08) Summary

**The D-02/D-08 content pass shipped: `scripts/data/sanguo-base-stats.json` carries class-template-generated base STR/AGI/INT/MOV/LEA/CHA + HP + MP + hidden rarity + independent public tier for all 132 heroes (binned to the signed D-20 distribution at exactly 79/33/13/5/2), wired into the idempotent `seed-sanguo.ts` upsert with a FATAL guard and clobber-safe 10-column spread — the dev DB now serves real numbers to every battle formula (10-01), capture roll (10-05) and collection line (10-07)**

## Performance

- **Duration:** 21 min
- **Started:** 2026-08-13T08:01:00Z
- **Completed:** 2026-08-13T08:22:00Z (approx.)
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- **`scripts/data/sanguo-base-stats.json`** (22.7 KB, 132 entries) — flat object keyed to the classifications canonical key space (cross-check: 0 missing, 0 orphan). Each entry `{ str, agi, int, mov, lea, cha, hp, mp, rarity, tier }`: six stats in the 10-90 band, HP 50-300, MP 10-200, rarity + tier integers 1-5 (verified ranges: str 21-75, agi 27-74, hp 102-242, mp 42-190, rarity 1-5, tier 1-5)
- **A2 template generation** (flagged assumption adopted): per-class templates (vanguard ~58 STR/210 HP, cavalry ~62 AGI/68 MOV, archer ~62 AGI/52 INT, spellcaster ~66 INT/170 MP, schemer ~60 INT/62 LEA, balanced MAX(STR,INT) for the three infantry classes) + prominence modifier by rarity (+12/+9/+6/+3/0 key stats, +25/+18/+12/+6/0 HP) + deterministic FNV-1a hash jitter (−3..+3 per stat) so no two heroes are identical — documented in the seed script header (JSON cannot carry comments; a `_comment` key would break the plan's own cross-check)
- **Rarity distribution = signed D-20 contract**: explicit prominence assignment of the top 53 figures (rarity 5: Tào Tháo + Quan Vũ; rarity 4: Lưu Bị, Trương Phi, Đổng Trác, Viên Thiệu, Tôn Kiên; rarity 3: the 13 major warlords/top generals incl. Trương Giác, Công Tôn Toản, Hạ Hầu Đôn/Uyên, Hoàng Phủ Tung, Hà Tiến, Lưu Biểu, Viên Thuật, Trương Lỗ, Khổng Dung, Đào Khiêm, Hoàng Cái, Trình Phổ; rarity 2: the 33 imperial/eunuch/provincial/strategist notables), remainder rarity 1 → **79/33/13/5/2** — per-bin deviation ≤ 0.7, within the plan's ±2 tolerance
- **Public tier independent of hidden rarity** (D-12): `tier = rarity + deterministic hash jitter (−1/0/+1)`, clamped 1-5 — never derived at render time. Variance is deliberate and observable (guan_yu ★4 vs zhang_fei ★5 at rarity 4/5; at_ba_to ★2 at rarity 1) — the collection renders stars from tier only
- **Six starters seeded** (D-14 names locked): cao_cao, liu_bei, sun_jian, truong_giac, yuan_shao, dong_trac — all present with starter-appropriate stats (class template + small flat boost on top of the prominence modifier); the 10-07 starter picker finds their rows
- **`seed-sanguo.ts` extension**: `loadBaseStats()` FATAL guard (missing/corrupt file → `process.exit(1)` — REQUIRED, unlike the optional zh-names map), 10-column clobber-safe spread in the hero upsert (`...(st ? { str..tier } : {})` — never NULL-clobbers, unconditional-but-guarded since the dataset is complete). Starters already live in the 132-hero set → no separate insert path
- **Live DB verified**: `npm run seed:sanguo` twice (idempotent — heroes count stable at 132, no dupes), probe shows COUNT(str)=COUNT(agi)=COUNT(int)=COUNT(mov)=COUNT(lea)=COUNT(cha)=COUNT(hp)=COUNT(mp)=COUNT(rarity)=COUNT(tier)=132 (zero NULLs), STARTERS: 6, `GROUP BY rarity` = 79/33/13/5/2, `npm run typecheck` green

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit scripts/data/sanguo-base-stats.json — base stats + rarity + tier for 132 heroes + 6 starters** - `62d239d` (feat)
2. **Task 2: Extend seed-sanguo.ts — base-stats/rarity/tier upsert + starter roster content (idempotent)** - `d60c323` (feat)

**Plan metadata:** `docs(10-04): complete content seed plan` (this commit)

## Files Created/Modified

- `scripts/data/sanguo-base-stats.json` - NEW content dataset: 132 heroes × { str, agi, int, mov, lea, cha, hp, mp, rarity, tier } — A2 template generation, D-20 rarity binning 79/33/13/5/2, independent tier
- `scripts/seed-sanguo.ts` - +80 lines: loadBaseStats FATAL guard (REQUIRED dataset), 10-column clobber-safe upsert spread, header documentation of the A2 template table + distribution deviation + starter stats

## Decisions Made

- **A2 template generation adopted over per-hero research** (flagged assumption, CONTEXT agent discretion): deterministic, reviewable, no TQC-09-grade research round; escalation to hand-tuning would be a new content pass, not a schema change
- **Rarity by prominence assignment is explicit and reviewable** in the generator provenance — the top-53 list is a deliberate, documented content judgment (Cao Cao/Guan Yu top the roster; the two deposed emperors and the eunuch chiefs sit in the notable-33)
- **Tier = rarity + hash jitter**: satisfies "roughly correlated but NOT derived from rarity at render time" with guaranteed variance, deterministic across re-runs
- **Starter flat boost** (+6 key / +10 HP / +10 MP): the 'first hero feels usable' requirement without making starters dominate
- **Template table lives in the seed header, not the JSON**: JSON has no comments and a `_comment` top-level key would be flagged MISSING by the plan's own cross-check (`Object.keys(stats)` vs classifications) — the plan's explicit fallback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Signed-shift hash jitter produced negative stat deltas for large hashes**
- **Found during:** Task 1 (dataset generation)
- **Issue:** The per-hero jitter used `h >> k` where `h` is a uint32 FNV-1a hash; for hashes ≥ 2³¹ the signed `>>` yielded negative jitters (−9..−3 instead of −3..+3), producing values like cao_cao str 15 / hp 129 (off-template by 9 points)
- **Fix:** Switched all jitter shifts to unsigned `>>>`; regenerated — cao_cao str 26 / hp 153, all six stats within the 10-90 band
- **Files modified:** throwaway generator (temp, removed after use) → output JSON only
- **Verification:** RARITY DIST 79/33/13/5/2 + BASE-STATS JSON VERIFIED + starter spot-check sane
- **Committed in:** `62d239d` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in the throwaway generation tooling — the committed artifact itself is clean)
**Impact on plan:** Zero scope creep; the fix corrected the generator before any value reached the committed dataset. The plan executed exactly as written otherwise.

## Issues Encountered

- **JSON can't carry the template-table header without breaking the plan's own verify** — a top-level `_comment` key would appear in `Object.keys(stats)` and be flagged MISSING by the Task 1 cross-check. Resolved via the plan's explicit fallback: template table + distribution deviation documented in the seed-sanguo.ts header instead.
- **Two rarity-map gaps in the throwaway generator** (han_shao_di, trieu_trung initially unassigned, kien_thac defaulted) — resolved by defaulting unlisted heroes to rarity 1 (the 60% bin) instead of requiring all 132 explicit entries; the explicit top-53 list covers every prominence hero.
- **Temp-dir module resolution** — a probe script outside the repo couldn't resolve drizzle-orm/pg; ran the DB probe as a temporary repo-root file (10-02 precedent) and removed it after verification.
- **Pre-existing untracked file `10-PATTERNS.md`** (phase planning artifact) remains untracked — out of this plan's scope, left untouched (same note as 10-03).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **10-05 (battleCheckInService + captureService)** reads real seeded numbers: `combatStat = base + IV` against in-band base stats (str 21-75, hp 102-242 → sane atk/def deltas under the D-05 formula); capture chance/flee resolve from the heroes.rarity column now populated 1-5; boss templates (A3) remain a 10-05 concern
- **10-07 (collection / starter)** renders `{{stars}}` from heroes.tier (independent of rarity — D-12 holds), queries captured_zone/hp_current, and the starter picker finds all six starter rows (cao_cao/liu_bei/sun_jian/truong_giac/yuan_shao/dong_trac) with starter-appropriate stats
- **Phase 12 audit** can verify the signed D-20 rarity distribution against live content (`GROUP BY rarity` = 79/33/13/5/2 in the dev DB)
- No blockers; the D-18/D-20 gate is closed and content is live

---

*Phase: 10-battle-capture*
*Completed: 2026-08-13*

## Self-Check: PASSED

- Files exist: `scripts/data/sanguo-base-stats.json` ✓ (22.7 KB, 132 entries), `scripts/seed-sanguo.ts` (loadBaseStats + 10-column spread) ✓, `.planning/phases/10-battle-capture/10-04-SUMMARY.md` ✓
- Commits exist: `62d239d` (Task 1 dataset), `d60c323` (Task 2 seed extension) — both found in git log
- Verification green: BASE-STATS JSON VERIFIED + PARSE OK + RARITY DIST 79/33/13/5/2; seed ran twice idempotent (132 stable), DB probe COUNT(all ten) = 132, STARTERS: 6; `npm run typecheck` exit 0
