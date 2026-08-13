---
phase: 10-battle-capture
plan: 03
subsystem: economy
tags: capture-fees, D-09, D-20, D-18, economy-re-sign, constants, vitest, tdd, anti-tamper

# Dependency graph
requires:
  - phase: 08-foundation
    provides: economy-budget.md baseline (D-19 net-sink/neutral, ~416/hr gross magnitude bound, D-18 one-way gate), wallet.deductBalance fee path (D-03), gatherFees.ts config-constant analog
  - phase: 10-battle-capture (10-01)
    provides: battle engine — post-battle wild-hero HP feeds the capture HP factor (Pitfall 5)
  - phase: 10-battle-capture (10-02)
    provides: capture_attempts.fee bigint currency discipline, encounter_runs.pity_count (D-11), heroes.rarity hidden column (D-08)
provides:
  - src/constants/sanguoCapture.ts — the D-20-signed capture config: CAPTURE_TIERS (5 tiers, fee bigint + multiplier + requiresItem gate), CAPTURE_BASE_BY_RARITY, FLEE_RATE_BY_RARITY, PITY_INCREMENT, RARITY_DISTRIBUTION, hpFactor
  - src/constants/__tests__/sanguoCapture.test.ts — 16-behavior sanity suite
  - docs/economy-budget.md — RE-SIGN (2026-08-13, Phase 10 D-20) block: 5-tier fee table + E[net/hour] recomputation under effective chances + sign-off (D-18 gate closed)
affects: 10-04 (content seed consumes RARITY_DISTRIBUTION), 10-05 (captureService spends CAPTURE_TIERS — fee server-side, never customId), 10-06 (UI renders the single capture % only, D-12), 10-07 (starter faucet restated as the only D-19 exception), Phase 12 audit (consumes re-sign as baseline)

actuals:
  tokens: 3673    # chars/4 over realized diff (estimate was 36000 — plan over-estimated; constant+doc work is light)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Config-first economic constants: readonly CaptureTier[] analog to gatherFees.ts — the single server-side fee source the service spends
    - Doc↔code cross-referencing for a one-way economy contract: constants header cites the D-20 sign-off; Task 3 acceptance asserts the doc table matches CAPTURE_TIERS (T-10-03-02 drift mitigation)
    - TDD for pure constants + one pure function (hpFactor): RED structural tests → GREEN module

key-files:
  created:
    - src/constants/sanguoCapture.ts
    - src/constants/__tests__/sanguoCapture.test.ts
  modified:
    - docs/economy-budget.md

key-decisions:
  - "D-20 contract (user-confirmed adopt-a1, F8-adjusted): 5-tier capture-fee table 5/15/40/100/250💎 (bigint) × multipliers 1.0/1.5/2.0/3.0/5.0; tiers 4-5 item-gated (capture_tier4_key / capture_tier5_key) — one-way D-18 gate, rebalancing needs a new sign-off"
  - "F8 gross-bound adjustment: the A1 draft fees (10/30/80/200/500) breached the ~416/hr gross magnitude bound at realistic cadence under effective chances (A1: ~788💎/hr at 10 encounters/hr, conservative model) — fees halved to 5/15/40/100/250 preserving ratios (1:3:8:20:50), multipliers, base rates, flee, pity, distribution; documented as a deviation"
  - "E[net/hour] priced with EFFECTIVE chances per F8 (attempts-per-capture = 1/(base × hpFactor × tierMult), incl. flee): E[inflow]=0 (starter is one-time, no sanguo minting) → E[net] = 0 − E[outflow] < 0 satisfies D-19 at every cadence/model; gross 75-394💎/hr at realistic 5-10/hr cadence < ~416/hr"
  - "Both cadences documented (theoretical 20/hr supply ceiling vs realistic 5-10/hr): conservative-model 20/hr = 788💎/hr exceeds the magnitude reference but is a supply-ceiling corner not human-achievable; realistic post-battle-HP model passes even at 20/hr (302💎/hr)"

patterns-established:
  - "Capture economy constants live in ONE server-side config module (never rendered, D-12; fee never rides a customId — anti-tamper); the D-20 re-sign doc is the signed contract and the constants header cross-references it"

requirements-completed: [TQC-11]

coverage:
  - id: D1
    description: "CAPTURE_TIERS 5-tier capture-fee contract — fee bigint matching users.balance, strictly ascending fee+multiplier, requiresItem gate on tiers 4-5 (null on 1-3), D-20 signed values"
    requirement: TQC-11
    verification:
      - kind: unit
        ref: "src/constants/__tests__/sanguoCapture.test.ts#CAPTURE_TIERS (D-09 5-tier model)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CAPTURE_BASE_BY_RARITY + FLEE_RATE_BY_RARITY (5 keys 1-5, base strictly decreasing, flee strictly increasing, all in [0,1]) + PITY_INCREMENT (0, 0.25] + RARITY_DISTRIBUTION summing to 100"
    requirement: TQC-11
    verification:
      - kind: unit
        ref: "src/constants/__tests__/sanguoCapture.test.ts#CAPTURE_BASE_BY_RARITY + FLEE_RATE_BY_RARITY (D-08/D-10)"
        status: pass
      - kind: unit
        ref: "src/constants/__tests__/sanguoCapture.test.ts#PITY_INCREMENT + RARITY_DISTRIBUTION (D-11/A1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "hpFactor Pokemon-standard (3×max − 2×cur)/(3×max) — 1/3 at full HP, 2/3 at half, 1.0 at zero; 0 for hpMax <= 0; clamped [0,1]"
    verification:
      - kind: unit
        ref: "src/constants/__tests__/sanguoCapture.test.ts#hpFactor (Pokemon-standard HP factor)"
        status: pass
    human_judgment: false
  - id: D4
    description: "docs/economy-budget.md D-20 re-sign: 5-tier 💎 fee table matching CAPTURE_TIERS, supporting constants, E[net/hour] recomputation under effective chances (E[inflow]=0, E[net]<0 → D-19), both cadences documented, RE-SIGNED sign-off line — the D-18 one-way gate closed before Phase 10 content"
    requirement: TQC-11
    verification:
      - kind: other
        ref: "node probe: prints RE-SIGN VERIFIED (RE-SIGN block + E[net]<0 conclusion + T1-T5 💎 fee table present)"
        status: pass
    human_judgment: true
    rationale: "The D-20 sign-off is a one-way economy contract and the fee schedule is an F8-driven adjustment from the user-approved A1 draft (adopt-a1) — the deviation from the approved values warrants human acknowledgment even though the doc-level verification is automated"

# Metrics
duration: 10min
completed: 2026-08-13
status: complete
---

# Phase 10 Plan 3: Capture-Fee Economy Contract (D-09/D-20) Summary

**5-tier capture-fee contract signed into the economy budget (D-20): `CAPTURE_TIERS` constants module (5/15/40/100/250💎 bigint × multipliers 1.0/1.5/2.0/3.0/5.0, tiers 4-5 item-gated) with base-capture/flee/pity/HP-factor/rarity-distribution constants, and E[net/hour] ≤ 0 recomputed under EFFECTIVE chances (1/effectiveChance pricing per F8) — closing the D-18 BLOCKING gate so Phase 10 content (10-04 seed) may ship**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-13T07:28:38Z
- **Completed:** 2026-08-13T07:34:00Z (approx.)
- **Tasks:** 3 (1 checkpoint:decision resolved + 1 TDD auto + 1 BLOCKING auto; 3 commits)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **`src/constants/sanguoCapture.ts`** — the D-20-signed server-side capture config (gatherFees.ts analog): `CAPTURE_TIERS` (5 tiers, `fee: bigint` matching users.balance, strictly ascending fee + multiplier, `requiresItem` gate on tiers 4-5 = `capture_tier4_key`/`capture_tier5_key`, null on 1-3), `CAPTURE_BASE_BY_RARITY` (0.80/0.55/0.35/0.20/0.10), `FLEE_RATE_BY_RARITY` (0.10/0.20/0.35/0.55/0.75), `PITY_INCREMENT` (0.05), `RARITY_DISTRIBUTION` (60/25/10/4/1), and `hpFactor` (Pokemon-standard, clamped [0,1], 0 for hpMax ≤ 0). Header documents D-09 (5-tier model), D-12 (never rendered), D-20 (values signed in economy-budget.md), and the anti-tamper rule (fee NEVER in a customId — server-side resolution only)
- **16-behavior test suite** (`sanguoCapture.test.ts`) — TDD RED (module missing) → GREEN (16/16 pass, typecheck clean): tier structure (5 entries, ascending fee/multiplier, item-gate placement), rarity tables (5 keys, monotonicity, [0,1]), pity/distribution sanity, hpFactor contract
- **D-20 re-sign of `docs/economy-budget.md`** — RE-SIGN (2026-08-13, Phase 10 D-20) block with the 5-tier 💎 fee table + supporting constants + the E[net/hour] recomputation under pull-driven encounter supply (≤20/hr) using EFFECTIVE chances (base × hpFactor × tierMult, attempts-per-capture = 1/effectiveChance incl. flee-driven loss, F8), documenting BOTH cadences (theoretical 20/hr + realistic 5-10/hr) and the sign-off line. Node probe prints `RE-SIGN VERIFIED`
- **D-19 hard constraint verified:** E[inflow] = 0 (starter is the only, one-time faucet — 10-07) → E[net] = 0 − E[outflow] < 0 at every cadence and model. **D-18 gate closed** — Phase 10 content (10-04 seed) may now ship

## Task Commits

Each task was committed atomically:

1. **Task 1 (checkpoint:decision, resolved by user): Confirm the 5-tier capture-fee table + constants** — user chose `adopt-a1`; the A1 draft became the D-20 contract basis (F8-adjusted in the re-sign — see Deviations)
2. **Task 2 (TDD): `src/constants/sanguoCapture.ts` + sanity tests** - `15eb5f9` (test, RED) + `1b96190` (feat, GREEN)
3. **Task 3 ([BLOCKING]): re-sign `docs/economy-budget.md` (D-20)** - `8f63dec` (docs)

**Plan metadata:** `docs(10-03): complete capture-fee economy contract plan` (pending — this commit)

_Note: Task 2 followed the TDD RED → GREEN sequence (test commit 15eb5f9 failed with `Cannot find module '../sanguoCapture.js'`; implementation commit 1b96190 turned 16/16 green)._

## Files Created/Modified

- `src/constants/sanguoCapture.ts` - The D-20-signed capture config: CaptureTier interface, CAPTURE_TIERS (5 tiers, 5/15/40/100/250💎 × 1.0/1.5/2.0/3.0/5.0, item gates on 4-5), base capture/flee tables, pity, rarity distribution, hpFactor — the ONLY server-side fee source (anti-tamper, D-12)
- `src/constants/__tests__/sanguoCapture.test.ts` - 16 behaviors: tier structure, rarity monotonicity + [0,1], pity/distribution sanity, hpFactor contract
- `docs/economy-budget.md` - +31 lines: RE-SIGN (2026-08-13, Phase 10 D-20) amendment with the 5-tier fee table, supporting constants, E[net/hour] computation (effective chances, both cadences), F8 adjustment note, RE-SIGNED sign-off line

## Decisions Made

- **D-20 contract adopted (user `adopt-a1`), F8-adjusted at the re-sign:** the A1 draft (10/30/80/200/500) was confirmed as the starting contract, then halved to 5/15/40/100/250 when the re-sign's E[outflow] computation (per F8: attempts = 1/effectiveChance) showed the A1 draft breaching the ~416/hr gross bound at realistic cadence (~788💎/hr at 10/hr, conservative model). Ratios (1:3:8:20:50), multipliers, base rates, flee, pity, and rarity distribution all preserved — only the absolute fee scale changed (half)
- **E[net/hour] priced with effective chances (F8):** attempts-per-capture = 1/(base × hpFactor × tierMult), tier blend 80% T1 / 15% T2 / 5% T3 (T1-dominant for affordable early capture; blend multiplier 1.125, blend fee 8.25💎). Conservative full-HP model (hpFactor = 1/3, the worst case F8 names): rarity-weighted 4.77 attempts/captured hero → 39.4💎/hero → 197-394💎/hr at realistic cadence (< 416 ✓). Realistic post-battle-HP model (hpFactor ≈ 0.87 — hero beaten to ~20% HP, the capture incentive): 15.1💎/hero → 151💎/hr at 10/hr, 302💎/hr even at the theoretical 20/hr ✓
- **E[net] ≤ 0 holds trivially and is asserted:** E[inflow] = 0 (no sanguo minting; starter one-time) → E[net] = 0 − E[outflow] < 0 satisfies D-19 at every cadence/model — the binding constraint was always the gross bound, now verified under effective chances
- **hpFactor contract locked by tests:** 1/3 at full HP, 2/3 at half, 1.0 at zero, 0 for hpMax ≤ 0, clamped [0,1] — battle performance directly feeds capture odds (Pitfall 5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking (F8-mandated economy adjustment)] A1 fee draft breached the ~416/hr gross bound — fees halved to 5/15/40/100/250**
- **Found during:** Task 3 (the D-20 re-sign — exactly where F8 said the breach would be caught)
- **Issue:** With the user-approved A1 fees (10/30/80/200/500), the F8-prescribed E[outflow] computation (attempts-per-capture = 1/effectiveChance under conservative full-HP hpFactor = 1/3, T1-dominant 80/15/5 tier blend) gives E[outflow per hero] = 4.77 attempts × 16.5💎 blend fee = 78.8💎 → **787.7💎/hr at the realistic-upper 10 encounters/hr — 89% over the ~416/hr gross magnitude bound**. The plan's flagged assumption F8 mandates adjustment: "adjust the A1 values before signing if the computed number exceeds the bound"; the checkpoint notes explicitly pre-authorized this ("the re-sign is where this is caught... do NOT silently accept a breach").
- **Fix:** Halved the fee schedule to 5/15/40/100/250 (bigint) — preserves the A1 tier ratios (1:3:8:20:50), all multipliers, base capture rates, flee rates, pity, and rarity distribution exactly. Recomputed: E[outflow per hero] = 4.77 × 8.25 = 39.4💎 → 197-394💎/hr at realistic cadence < 416 ✓ (flee-adjusted 108-216💎/hr; realistic post-battle-HP 75-151💎/hr). T2 at the theoretical supply ceiling now also passes (15💎 × 20/hr = 300/hr < 416)
- **Files modified:** `src/constants/sanguoCapture.ts` (fee literals + F8 note in header), `docs/economy-budget.md` (F8 adjustment note in the RE-SIGN block)
- **Verification:** Task 3 node probe prints `RE-SIGN VERIFIED`; the doc table matches CAPTURE_TIERS; the deviation is documented in both artifacts and in this summary
- **Committed in:** `1b96190` (constants) + `8f63dec` (re-sign)

---

**Total deviations:** 1 auto-fixed (1 blocking — the F8-mandated economy adjustment at the re-sign)
**Impact on plan:** The adjustment is the plan's own designed safety valve (F8) — it changes only the absolute fee scale, preserving every ratio and game-feel property the user approved with `adopt-a1`. The user was told at the checkpoint that values breaching the gross bound "must be adjusted here, not silently accepted"; the re-sign performed exactly that verification and adjustment. No scope creep.

## Issues Encountered

- **A1 draft gross-bound breach (Task 3)** — the F8-anticipated finding: the signed-contract computation under effective chances exceeded the ~416/hr magnitude reference at realistic cadence with the A1 fees. Resolved by the F8-mandated halving (see Deviations above). Not a bug — the verification did its job before the one-way sign-off.
- **Pre-existing untracked file `10-PATTERNS.md`** (phase planning artifact) was present in the working tree before this plan started and is NOT part of this plan's scope — left untracked, untouched. The phase's later plans reference it as context; it should be committed as part of the phase planning artifact set.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **10-04 (content seed)** may now ship — the D-18/D-20 BLOCKING gate is closed. The seed consumes the signed `RARITY_DISTRIBUTION` (60/25/10/4/1) directly from `sanguoCapture.ts`
- **10-05 (captureService)** spends `CAPTURE_TIERS` — fee resolved server-side from the config inside the FOR UPDATE tx (never from the customId); `captureChance` formula (base × hpFactor × tierMult + pity, clamped after pity) reads the same constants; `sanguo_capture_t{n}` wallet reason strings pair with the tier numbers
- **10-06/10-07 (UI)** render only the single capture % (D-12); the config module is never imported by any UI path; the starter faucet (10-07) is the only D-19 exception, restated in the re-sign
- The theoretical-20/hr corner (788💎/hr conservative model) is documented as a supply-ceiling non-issue in the re-sign; Phase 12 monitoring (TQC-19) audits actual spend against the signed table

---

*Phase: 10-battle-capture*
*Completed: 2026-08-13*

## Self-Check: PASSED

- Files exist: `src/constants/sanguoCapture.ts` ✓, `src/constants/__tests__/sanguoCapture.test.ts` ✓, `.planning/phases/10-battle-capture/10-03-SUMMARY.md` ✓, `docs/economy-budget.md` (RE-SIGN block) ✓
- Commits exist: `15eb5f9` (test RED), `1b96190` (feat GREEN), `8f63dec` (docs re-sign)
- Tests green: `npx vitest run src/constants/__tests__/sanguoCapture.test.ts` → 16/16 pass; `npm run typecheck` → exit 0; node probe → `RE-SIGN VERIFIED`
