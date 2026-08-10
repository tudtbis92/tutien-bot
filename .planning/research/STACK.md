# Stack Research

**Domain:** Pokemon-style collection game (Tam Quốc Collection) — addition to existing TuTien Discord RPG bot (node map, encounters, auto-battle, capture, hero IV progression)
**Researched:** 2026-08-10
**Confidence:** HIGH

## Verdict (TL;DR)

**The existing validated stack is sufficient — zero new core frameworks.** Only two supporting libraries are worth adding:

1. **pure-rand 8.4.2** — seeded/deterministic PRNG, used ONLY for reproducible battle replay/simulation and unit tests.
2. **rate-limiter-flexible 11.2.0** (optional but recommended) — multi-layer anti-farming rate limiting on the existing ioredis instance.

All player-facing randomness (capture %, encounter selection, battle rolls, IV generation) uses Node's built-in `crypto.randomInt()` — a CSPRNG, zero new dependency. Encounter tables, the battle engine, and turn history are custom code on existing infra: no maintained npm battle engine or weighted-random library is worth adopting.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js `crypto` (built-in, unchanged runtime) | Node 22 LTS (bundled) | CSPRNG for ALL gameplay outcome rolls: capture success %, encounter selection, battle hit/crit/damage, IV rolls | `crypto.randomInt(min, max)` is cryptographically secure and unpredictable. A seeded PRNG for these rolls lets players predict outcomes and farm optimally, breaking fairness/economy (Rust Rand book: "for gambling games predictability is an issue and a cryptographic PRNG is recommended"; peteroupc.github.io/random.html: don't use a manually seeded PRNG for player-observable content). Zero new dependency. |
| PostgreSQL 16 + Drizzle 0.45.2 (unchanged) | existing | Battle turn history (jsonb), hero/IV records, capture logs, encounter table data | Turn history is a `jsonb` column in an existing battle record — no new store. Encounter tables are data-driven rows (map → hero, weight) joined to map nodes. Existing transaction patterns cover balance checks on movement fees. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **pure-rand** (NEW) | 8.4.2 | Seeded/deterministic PRNG (xoroshiro128plus, xorshift128plus, uniformIntDistribution, `purify()` state threading) | ONLY for reproducible battle simulation/replay (same seed → identical turn history for server-side verification, debugging, unit tests) and deterministic content generation. NOT for player-facing outcome rolls. Actively maintained (repo mod 2026-07-10), TS-native with bundled types, ESM+CJS dual, zero deps, by dubzzz (fast-check author). |
| **rate-limiter-flexible** (NEW, optional) | 11.2.0 | Multi-layer rate limiting backed by the existing ioredis client | Per-user action caps: max encounters/hour, capture attempts per window, movement command spam, per-guild bot abuse. `RateLimiterRedis` with points/duration model, `blockDuration`, `keyPrefix` per mechanic, `insuranceLimiter` memory fallback, `inMemoryBlockOnConsumed`. Actively maintained (repo mod 2026-06-08). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| (none new) | — | Existing tooling covers the game's data needs: drizzle-kit for schema/migrations, Zod 4.3.6 to validate encounter-table/hero definition data, ESLint i18n enforcement for new command strings. |

## Installation

```bash
# Game logic — seeded RNG for battle replay / deterministic tests
npm install pure-rand@8.4.2

# Optional but recommended: anti-farming rate limiting on existing ioredis
npm install rate-limiter-flexible@11.2.0
```

No other packages. Everything else is patterns on the existing stack.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Node built-in `crypto.randomInt` (CSPRNG) | seedrandom / pure-rand for gameplay rolls | Never for player-visible outcomes — predictable PRNG = farmable, breaks capture % and economy. |
| pure-rand 8.4.2 | seedrandom 3.0.5 | Only if the team insists on the most battle-tested legacy option. It is in maintenance mode (last repo mod 2022-06), CJS-only, needs `@types/seedrandom`. pure-rand is the modern TS-native choice with pure state threading that fits a functional battle engine. |
| Custom weighted-selection utility (~10 lines) | weighted-random 0.1.0 / weighted 1.0.0 | Never — both stale since 2022, trivial micro-libs. Cumulative-weight linear scan is the universal consensus (LootLocker drop tables, gamedev.stackexchange). |
| Custom pure-TS battle engine | Any npm battle-engine package | None maintained for discord.js; every Discord RPG bot writes its own engine because generic engines can't model hero-type/formation/system-buff rules. |
| rate-limiter-flexible 11.2.0 | Custom Redis Lua via ioredis `defineCommand` | Custom Lua is fine for a single atomic game cooldown (already supported). Use rate-limiter-flexible when you need layered limits (per-user + per-mechanic + global) plus memory insurance — the exact failure mode documented in "Our Rate Limiter Failed. Bots Cost Us $18K in 6 Hours". |
| Redis movement session + lazy arrival resolution + pg-boss periodic sweep | pg-boss delayed job per movement | One scheduled job per concurrent traveler does not scale to thousands of players. Store `arrivalAt`, resolve lazily on next interaction, and sweep stragglers with an existing pg-boss cron. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Seeded PRNG for capture % / encounter rolls / battle outcome rolls | Deterministic + predictable seed = players compute optimal farming, break fairness and the Linh thạch economy | `crypto.randomInt()` CSPRNG |
| seedrandom | Maintenance-mode since 2022, CJS-only, no bundled types | pure-rand 8.4.2 |
| random-seed | Abandoned (~11 years old, v0.3.0) | pure-rand 8.4.2 |
| weighted-random / weighted | Stale micro-libs (2022), zero value over a 10-line algorithm | Custom cumulative-weight utility in a service |
| Any npm battle-engine package | None maintained for discord.js; cannot model custom rules | Custom `services/battle` engine |
| Single-layer Redis INCR+EXPIRE anti-farm (only) | Known failure mode — scripted multi-account farming bypasses one layer; needs per-user + per-mechanic + cost mechanics | Layered limits + game-cost sinks (movement fee in Linh thạch, capture item consumption) |

## Stack Patterns by Variant

**If battle outcomes must be replayable/auditable (verifiable turn history):**
- Generate `battleSeed` via `crypto.randomInt()` at battle start; store it in the battle record.
- Replay the battle with pure-rand seeded by `battleSeed` to recompute the turn log for verification/tests.
- The seed is CSPRNG-generated and only revealed post-battle → replayable but not predictable by the player.

**If a player grinds one map node for rare encounters:**
- Movement cost (Linh thạch per distance) + real travel time is the primary anti-farm — it is an economy sink, not just a rate limit.
- Add `RateLimiterRedis` with `keyPrefix: 'encounter:{userId}'` to cap encounters/hour per player.
- Item-gate capture: attempts consume purchased capture items (cost sink), not just a free % roll.

**If anti-abuse must survive a Redis outage:**
- `rate-limiter-flexible` `insuranceLimiter: new RateLimiterMemory(...)` → degraded service instead of hard failure.

**If the battle engine must be unit-testable:**
- Write pure functions `(state, rng) → (newState, actions[])`, threading rng state explicitly (pure-rand `purify()`).
- Tests fix a seed and assert the exact turn history — deterministic, no mocking.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| pure-rand 8.4.2 | Node 22 LTS, TS 5.8.x | ESM+CJS dual, bundled types, zero dependencies |
| rate-limiter-flexible 11.2.0 | ioredis 5.10.1 | Redis user needs ACL `+@read +@write +EVAL +EVALSHA` (uses Lua); set `enableOfflineQueue: false` |
| `crypto.randomInt` | Node 22 (built-in) | Available since Node 14.10; no install |

## Sources

- Context7 /davidbau/seedrandom — PRNG algorithms (Alea, xor128, xor4096…), state save/restore — MEDIUM
- Context7 /animir/node-rate-limiter-flexible — RateLimiterRedis + ioredis setup, insuranceLimiter, keyPrefix — MEDIUM
- npm registry (2026-08-10) — versions/publish recency: pure-rand 8.4.2 (mod 2026-07-10), seedrandom 3.0.5 (mod 2022-06), rate-limiter-flexible 11.2.0 (mod 2026-06-08), weighted-random 0.1.0, weighted 1.0.0, random-seed 0.3.0, @types/seedrandom 3.0.8 — HIGH
- github.com/dubzzz/pure-rand — generators, uniformIntDistribution, purify() usage — HIGH
- peteroupc.github.io/random.html — "application should not use a manually seeded PRNG unless content is reproducible" — HIGH
- Rust Rand book (rust-random.github.io) — CSPRNG required where predictability matters (gambling/games) — HIGH
- LootLocker drop-tables article + StackOverflow/gamedev.stackexchange — cumulative-weight algorithm consensus — MEDIUM
- Medium, "Our Rate Limiter Failed. Bots Cost Us $18K in 6 Hours" — layered rate-limiting lesson — MEDIUM

---
*Stack research for: TuTien Bot — Tam Quốc Collection (milestone v3.0)*
*Researched: 2026-08-10*
