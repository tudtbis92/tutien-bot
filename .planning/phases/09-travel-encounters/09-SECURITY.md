---
phase: 09
slug: travel-encounters
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-13
---

# Phase 9 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client (Discord) → interaction router | Untrusted interaction payload — select-menu/button values are advisory strings, never authoritative | interaction payload |
| interaction → travelService | Node-code input from the payload; must be re-validated against map_edges before any state write | node code string |
| interaction → travelCheckInService | Check-in triggered by a user-owned interaction; the travel row belongs to that user (users.id) | users.id |
| transaction → player_travel_state row | Check-in mutates the row; concurrent check-ins for the same user must serialize | travel state |
| check-in loop → Redis cap ZSET | Cap counter mutation races only with the user's own check-in tx (single user) | encounter counts |
| roll → encounter_runs INSERT | Roll outcomes are player-facing game state; RNG integrity matters | encounter records |
| seed script → production DB | D-20 reseed DELETES map_nodes rows — a data-destructive write into the live database | map data rows |
| drizzle-kit generate → dev database | Introspects the dev DB to diff the schema — reads live state | schema |
| migration apply → dev database | DDL writes (drop columns, create tables) — destructive if mis-generated | DDL |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-09-01 | Tampering | startTravel destination input | high | mitigate | Server-side adjacency re-validation inside the tx — missing edge → `NO_ROUTE` before any write (`travelService.ts:127,160`) | closed |
| T-09-02 | Spoofing | Stale/fabricated select-menu choice | medium | mitigate | Same server-side re-validation (T-09-01); reply surfaces `no_route` DANGER embed | closed |
| T-09-03 | Tampering | Concurrent startTravel (double-journey race) | medium | mitigate | FOR UPDATE row lock (`travelService.ts:134`) + `userId.unique()` backstop + status re-check → `ALREADY_TRAVELING` (`:136`) | closed |
| T-09-04 | Spoofing | Destination code values | low | accept | Node codes are opaque DB keys; valid-but-wrong code → NO_ROUTE; drizzle parameterization | closed |
| T-09-05 (09-01) | Tampering | Fabricated component customId (`sanguo:travel:*`) | low | mitigate | Router validates customId prefix before dispatch; handlers re-check row status + adjacency server-side | closed |
| T-09-05 (09-02) | Tampering | `db.delete(schema.mapNodes)` (D-20) | high | mitigate | Deletes scoped to mapEdges + heroZoneRates + mapNodes only (child→parent) in the seed tx (`seed-sanguo.ts:407-409`); heroes/factions/families/relations/items never touched; final counts logged | closed |
| T-09-06 (09-02) | Tampering | Dataset integrity (silent transcription error) | medium | mitigate | Committed JSON validated by count gate (18/73/162/208); RESEARCH machine-verified (0 isolated, 0 duplicate edges); canonicalized min/max + onConflictDoNothing | closed |
| T-09-07 (09-02) | Repudiation | Seed idempotency (double-run) | high | mitigate | Full-replace flow (B3): child→parent deletes then re-insert — identical row counts every run (verified twice, 0 duplicates) | closed |
| T-09-08 (09-02) | Spoofing | Zone-code injection via dataset | low | accept | Dev-time committed data, not user input; mismatch → label fallback + encounter-pool miss (Phase 12 monitoring) | closed |
| T-09-06 (09-03) | Tampering | Double-processing the same elapsed window (concurrent check-ins) | high | mitigate | `.for('update')` on the travel row in the tx (`travelCheckInService.ts:203`); second tx reads advanced updatedAt → elapsed ≈ 0 | closed |
| T-09-07 (09-03) | Tampering | Pause bypass (counting time while encounter_active) | high | mitigate | `encounterActive` early-returns `encounterPending` with NO decrement (`:211`); only ack clears it with `updatedAt=now` (`:287`) | closed |
| T-09-08 (09-03) | Tampering | Encounter clock corruption by a non-check-in writer | high | mitigate | Single-writer rule: check-in is the ONLY writer of remaining/updatedAt for traveling rows | closed |
| T-09-09 | DoS | Overdue journey stuck forever | medium | mitigate | Remaining clamped `Math.max(0, …)` → overdue rows resolve to arrived; no failed/cancelled status | closed |
| T-09-10 | Spoofing / Info Disclosure | Roll prediction via predictable PRNG | high | mitigate | `crypto.randomInt`-backed `cryptoUniform()` the only default rng (`encounterService.ts:58`); `Math.random` == 0 grep-enforced; deterministic rng only in injected tests | closed |
| T-09-11 | Elevation / Tampering | Cap evasion (burst past 20/hr) | medium | mitigate | Sliding-window ZSET cap check BEFORE any roll (Pitfall 7); multi-account evasion accepted as soft-brake (Phase 12 TQC-18 hardens) | closed |
| T-09-12 | Tampering | Cap check-then-act race within one check-in | low | accept | ZREMRANGEBYSCORE→ZCARD→roll→ZADD not atomic; ≤1 boundary overshoot — soft brake per D-13 | closed |
| T-09-13 | Tampering | Encounter loop corrupting the D-07 clock | high | mitigate | Roll writes ONLY encounter_runs + Redis (`:167`); zero stray `update(playerTravelState)` calls; only write carries remaining/encounterActive/updatedAt | closed |
| T-09-18 | Tampering | Migration dropping wrong columns | high | mitigate | Migration GENERATED by drizzle-kit (never hand-written) and reviewed against expected statement list before `npm run migrate`; drops intentional per D-01/D-07 | closed |
| T-09-19 | DoS / Integrity | Migrate against PgBouncer pooled URL | high | mitigate | `npm run migrate` uses `DATABASE_URL_DIRECT` (drizzle.config.ts); runtime uses pooled `DATABASE_URL` — never mixed | closed |
| T-09-20 | Tampering | Seed deleting the wrong data (hero seed loss) | high | mitigate | Delete scoped to `schema.mapNodes` only; verify re-run asserts heroCount stays 132; second run idempotent | closed |
| T-09-21 | Repudiation | Doc amendments drifting from locked decisions | low | mitigate | Task 2 acceptance greps pin exact amended wording; scoped replacements, not rewrites | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-09-01 | T-09-04 | Node codes are opaque DB keys with no user-facing semantics; no injection surface (parameterized) | Phase author (plan-time disposition) | 2026-08-12 |
| R-09-02 | T-09-08 (09-02) | Zone codes are dev-time committed data, not user input; runtime failure surfaces visibly | Phase author (plan-time disposition) | 2026-08-12 |
| R-09-03 | T-09-12 | Cap micro-race permits at most 1 boundary overshoot per check-in; cap is a soft brake by design, hardened in Phase 12 | Phase author (plan-time disposition) | 2026-08-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-13 | 21 | 21 | 0 | gsd-security-auditor (orchestrator L1 verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-13
