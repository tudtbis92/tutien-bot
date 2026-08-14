---
phase: 10
slug: battle-capture
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-14
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| (none — pure function) | `runBattle(seed, input)` has no input boundary beyond its parameters; the engine executes no I/O and trusts nothing external. The CALLER (10-05) owns crypto seed generation and never leaks the seeded rng | seed + CombatantInput |
| interaction payload → captureService | Tier number in a component customId crosses here — fee, chance, and all state resolve server-side from locked DB rows; nothing from the payload is trusted | tier number (advisory) |
| interaction payload → heroes/hero handlers | Starter heroIds and companion heroIds in customIds cross here — validated against owned rows / the starter sets server-side | heroId (advisory) |
| service layer → wallet | Capture fee crosses here — `wallet.deductBalance` WHERE-guard + ledger row in the same tx (D-03) | fee + ledger |
| service layer → pure-rand engine | Battle seed + CombatantInput cross here — the engine is pure and replayable; the service owns crypto seed generation and the full input snapshot | seed + combat snapshot |
| schema files → drizzle-kit generate → live DB | Generated SQL applied to PostgreSQL; the DB is the single source of truth for battle/capture state | DDL |
| seed script → heroes table | Idempotent upsert writes content columns into the live DB; a malformed dataset silently degrades battle/capture/collection | content rows |
| content dataset ↔ signed economy | Rarity distribution in the dataset must match the D-20 contract — drift rebalances capture odds without a sign-off | rarity distribution |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-10-01-01 | Tampering | runBattle randomness source | high | mitigate | Engine draws randomness ONLY from the seeded xoroshiro128plus(seed) rng — no Math.random, no entropy, no Date; capture/flee/IV stay crypto (D-06) (`battleEngine.ts:1-2`, `captureService.ts:26`) | closed |
| T-10-01-02 | Tampering | pure-rand scope leak | medium | mitigate | pure-rand imports exist ONLY in battleEngine.ts (scoped grep gate == 2; 0 elsewhere in src) (`battleEngine.ts:1-2`) | closed |
| T-10-01-03 | Spoofing | Replay divergence (stored log ↔ re-run) | medium | mitigate | Seed+input contract is the replay path; `sanguo_battles.input` jsonb stores BOTH full CombatantInput snapshots; Test 8 re-runs the real engine and deep-equals roundLogs (`battleCheckInService.ts:195-210`, test T8) | closed |
| T-10-02-01 | Tampering | Hand-edited migration SQL | medium | mitigate | drizzle-kit generate is the only author of 0019; generated SQL untouched-by-hand, reviewed before `npm run migrate` | closed |
| T-10-02-02 | Tampering | IV range constraint loss | medium | mitigate | Six iv_* columns + all six 0-31 checks remain Phase-8-final (grep gate `iv_str_range` count == 1); DB check rejects out-of-range IV rolls (correctness backstop) | closed |
| T-10-02-03 | Tampering | Audit-table absence (failed attempts invisible) | high | mitigate | `capture_attempts` first-class audit table with (user_id, created_at) index; every attempt row incl. failures (TQC-11/SC2); schema-push probe verifies live | closed |
| T-10-02-04 | Spoofing | Rarity column leakage surface | medium | mitigate | rarity is a hidden column with NO UI read path (D-12); collection queries tier only; check constraint bounds 1-5 | closed |
| T-10-03-01 | Tampering | Crafted customId fee tampering | high | mitigate | Fee NEVER in customId/payload — `sanguo:capture:tier:{n}` carries only the tier; fee+multiplier resolve from CAPTURE_TIERS server-side inside the FOR UPDATE tx (`sanguoCaptureButtons.ts:33`, `captureService.ts:192`) | closed |
| T-10-03-02 | Tampering | Economy rebalance-by-drift (doc ↔ constants) | medium | mitigate | Doc table matches CAPTURE_TIERS (Task 3 acceptance); constants header cites the D-20 sign-off — cross-referenced artifacts | closed |
| T-10-03-03 | Spoofing | Faucet insertion (new money-minting path) | high | mitigate | D-19 restated as hard constraint with E[inflow]=0; starter (10-07) is the only documented faucet exception; Phase 12 audit consumes the re-sign as baseline | closed |
| T-10-04-01 | Tampering | Malformed base-stats dataset (out-of-range, orphans) | medium | mitigate | Task 1 cross-check rejects missing/orphan keys + out-of-range values BEFORE seed; DB checks (rarity_range/tier_range) second line (`BASE-STATS JSON VERIFIED` probe) | closed |
| T-10-04-02 | Tampering | Rarity-distribution drift vs D-20 contract | medium | mitigate | Verify prints seeded distribution (79/33/13/5/2), bounds rarity-1/rarity-5; 10-03 doc stays the signed reference | closed |
| T-10-04-03 | Spoofing | NULL-clobber of researched values on reseed | medium | mitigate | Clobber-safe spread never writes NULL over existing values; double-run idempotency probe verified (132 stable) | closed |
| T-10-04-04 | Tampering | Rarity leaking to UI through the seed | low | mitigate | Seed writes rarity to hidden column; no UI consumer (D-12); 10-07 renders tier only | closed |
| T-10-05-01 | Tampering | Predictable RNG manipulation (capture/flee/IV/seed) | critical | mitigate | Every player-facing draw rides `crypto.randomInt`/`cryptoUniform` (ASVS V6); pure-rand exists ONLY in battleEngine.ts (grep gate == 0 elsewhere) (`battleCheckInService.ts:66,74`, `captureService.ts:125`, `encounterService.ts:58`) | closed |
| T-10-05-02 | Tampering | Crafted customId fee tampering | high | mitigate | Tier-only customId; CAPTURE_TIERS resolved server-side; INVALID_TIER/TIER_LOCKED guards reject forged tiers | closed |
| T-10-05-03 | Tampering | Capture double-spend / concurrent attempt race | high | mitigate | `.for('update')` on the pending encounter row serializes presses; status transition WHERE-guarded ('pending' → terminal); second press re-fetches and finds no pending row (`captureService.ts:137`) | closed |
| T-10-05-04 | Spoofing | Client-influenced roll (client-reported HP/state) | high | mitigate | Wild HP/chance/pity all read from LOCKED DB rows (battle result, encounter_runs.pity_count, config); payload contributes nothing (server-authoritative); CR-01 won-battle guard added (`captureService.ts:166-167`) | closed |
| T-10-05-05 | Repudiation | Audit evasion (failed attempts hidden) | high | mitigate | `capture_attempts` row for EVERY attempt incl. failures with exact chance + roll (single insert site); wallet ledger row per fee | closed |
| T-10-05-06 | Tampering | HP persistence bypass (fainted hero battles) | medium | mitigate | Battle start gates active-companion HP > 0 inside the tx (HERO_FAINTED); spar never writes HP back; encounter battles write engine's playerHpAfter only (`battleCheckInService.ts:130`) | closed |
| T-10-05-07 | Spoofing | Replay-record divergence (incomplete input snapshot) | medium | mitigate | Service stores BOTH full CombatantInput snapshots; Test 8 re-runs real engine vs stored input, deep-equals roundLogs | closed |
| T-10-06-01 | Tampering | Crafted customId fee tampering (`sanguo:capture:tier:{n}`) | high | mitigate | Tier parseInt+isNaN-guarded then server-validated (1-5); fee NEVER in customId — attemptCapture resolves from CAPTURE_TIERS in the tx | closed |
| T-10-06-02 | Tampering | Stale component persistence on editReply (PATCH merge) | high | mitigate | Every editReply passes `components: []` when clearing (CR-09-03/04 live-verified); terminal states clear components (`battle.ts` 40+ sites, `heroes.ts`, `hero.ts`, `travel.ts`) | closed |
| T-10-06-03 | Spoofing | Ack-contract inversion regression (old route dormant) | medium | mitigate | ACK route REMOVED, not disabled — grep gate asserts zero ACK_BTN_ID in interactionCreate.ts, zero buildAckButton in travel.ts; route replaced by sanguo:battle:*/sanguo:capture:* (`interactionCreate.ts:176,209`) | closed |
| T-10-06-04 | Information disclosure | D-12 leakage (IV/rarity/formula rendered) | high | mitigate | Capture view renders ONLY the single % (capture.chance); battle log renders turn lines only; no raw IV/rarity/flee/pity/multiplier in any embed (`buildSanguoCaptureEmbed.ts:11`, `buildSanguoHeroesEmbed.ts:15`) | closed |
| T-10-06-05 | Tampering | Component count overflow (5th button) | low | mitigate | Capture row is exactly 3 tier buttons + 1 retreat (4 ≤ 5); retry swaps row content; Discord rejects >5 with a payload error | closed |
| T-10-07-01 | Tampering | Starter double-grant (two picks race) | high | mitigate | `handleStarterPick` FOR UPDATE tx re-checks the collection is empty before inserting — second pick serializes → non-empty → heroes.error (single-writer rule) (`heroes.ts:191-205`) | closed |
| T-10-07-02 | Tampering | Faucet exploitation (starter granting currency or multiple heroes) | critical | mitigate | Starter path contains NO wallet call (grep gate == 0, wallet-mock assertion — deductBalance/creditBalance never invoked); exactly one user_heroes insert per pick, guarded by empty-collection re-check + starter_views reset | closed |
| T-10-07-03 | Spoofing | Crafted companion/starter heroIds | medium | mitigate | heroIds validated server-side: starter heroIds must match STARTER_SET_1/2; companion heroIds must match an owned user_heroes row (ownership gate) → forged id → hero.error, no state change | closed |
| T-10-07-04 | Information disclosure | D-12 leakage (IV/rarity in collection/detail) | high | mitigate | Collection/detail render grade keys + tier stars only; no IV number, no rarity column read in any UI path (data interfaces carry gradeKey+stars only, test assertions) | closed |
| T-10-07-05 | Spoofing | Zone-filter value injection | low | mitigate | Select value validated against map_zones codes; unknown values fall back to full collection — no injection surface (drizzle parameterization) | closed |
| T-10-07-06 | Tampering | Companion switch race (two switches) | low | mitigate | Switch runs in a FOR UPDATE tx on user_sanguo_state — serialized; last-writer-wins is the intended semantic | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-10-01 | T-10-05-03 | The FOR UPDATE lock serializes presses but a genuinely simultaneous double-press may surface a transient generic error to one client (no double-charge — the second tx finds no pending row and rolls back); UX-safe, no economic impact | Phase author (plan-time disposition) | 2026-08-13 |
| R-10-02 | T-10-06-05 | Discord enforces the 5-component ActionRow limit server-side; a >5 row returns a payload error rather than silently dropping buttons — no tampering surface | Phase author (plan-time disposition) | 2026-08-13 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-14 | 32 | 32 | 0 | gsd-security-auditor (orchestrator L1 verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-14
