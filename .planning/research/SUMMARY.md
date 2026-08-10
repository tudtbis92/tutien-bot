# Project Research Summary

**Project:** TuTien Bot — Tam Quốc Collection (Milestone v3.0)
**Domain:** Pokemon-style hero-collection mini-game integrated into an existing multi-shard Discord RPG bot; data-separate but shares `users.balance` (Linh thạch) as currency
**Researched:** 2026-08-10
**Confidence:** MEDIUM-HIGH (stack + architecture HIGH; features MEDIUM; pitfalls MEDIUM-HIGH)

## Executive Summary

Tam Quốc Collection is a Pokemon-style collection game for Discord, closest in spirit to **Pokemon GO** (travel → encounter → capture → IV → candy) overlaid with **EA FC-style chemistry** team-building (3 mains + 9 buff slots) and plugged into the shared Linh thạch economy of the existing TuTien bot. It is explicitly **not** a gacha roller (Mudae/Karuta) or a chat-spawn race (Pokétwo): the signature design decision is that **encounters come from paid map travel, not chat activity** — every encounter carries a real Linh thạch cost, which is simultaneously the game's primary economy sink and its natural anti-bot mechanism. The core loop is strictly linear (travel → encounter → battle → capture → collection → progression) and must be delivered as a vertical slice, not as isolated modules.

The research verdict is unusually clean: **the existing validated stack requires zero new core frameworks.** All player-facing randomness (capture %, encounter selection, battle rolls, IV generation) uses Node's built-in `crypto.randomInt()` CSPRNG; only two small libraries are added — `pure-rand` (seeded PRNG for battle replay/verification and deterministic tests only) and optionally `rate-limiter-flexible` (layered anti-farming on the existing ioredis). The architecture integrates with what the codebase actually is today (verified by direct read 2026-08-10): PostgreSQL rows are truth with timestamp-derived travel state, a pg-boss cron tick claims due encounters with `FOR UPDATE SKIP LOCKED`, the battle engine is a pure service function, a shared `wallet.ts` is extracted first for atomic balance guards, and the 1056 hero emojis become a checked-in generated registry. Recommended build order: **Foundation → Travel & Encounters → Battle & Capture → Progression & Economy → Anti-abuse & Marketplace Gating.**

The dominant risks are economic, not technical: (1) capture-game faucets converting to Linh thạch through the global VWAP marketplace — must be design-gated (net-sink or neutral; soul gems account-bound; boss drops items, never money); (2) travel cost rounding/refund bugs creating free or negative-cost movement; (3) duplicate → soul-gem loops collapsing the collection into single-species farming; (4) botting — the project already runs a paid self-bot farming service, so economic bounding (not detectors) is the primary defense; and (5) RNG fairness with ZH-CN legal disclosure expectations (published rates must equal code rates from a single config, with a visible pity counter). All five have concrete, phase-mapped mitigations below.

## Key Findings

### Recommended Stack

**Verdict: reuse the existing validated stack; add only two small libraries.** Full detail: [STACK.md](./STACK.md)

**Core technologies:**
- **Node built-in `crypto.randomInt()`** — the CSPRNG for ALL player-facing outcome rolls (capture %, encounters, battle, IVs). A predictable/seeded PRNG lets players compute optimal farming and breaks fairness and the economy.
- **pure-rand 8.4.2** (NEW, only) — seeded PRNG for *reproducible* battle replay/audit and deterministic unit tests. Pattern: `battleSeed` from `crypto.randomInt()` at battle start, revealed post-battle; replay with pure-rand to verify turn history.
- **rate-limiter-flexible 11.2.0** (NEW, optional but recommended) — layered per-user/per-mechanic rate limits on the existing ioredis (`RateLimiterRedis` + `insuranceLimiter` memory fallback). Only needed if the existing cooldown utility can't express multi-layer caps.
- **Custom battle engine + custom cumulative-weight utility** — no maintained npm battle engine fits Discord RPG rules; weighted-random micro-libs are stale. Write pure functions `(state, rng) → (newState, actions[])` threading rng state explicitly.
- **Unchanged:** Node 22 LTS, discord.js 14.26.2, PostgreSQL 16 + Drizzle 0.45.2, pg-boss, ioredis 5.10.1, i18next, Zod 4.3.6.

### Expected Features

Full detail: [FEATURES.md](./FEATURES.md) — Confidence MEDIUM (competitor features cross-checked across community guides; rates/pacing need live tuning).

**Must have (table stakes):**
- Starter choice (free, 3–5 heroes — the only faucet) — users expect this in every Pokemon-style game
- Map with real-time paid travel — core loop; async travel-time clock beats energy walls for retention
- Encounters along route (~30–50%/leg, capped ~20/hr/user) — "wild spawn" equivalent
- Capture % displayed before catch — reduces frustration on failure
- Capture after battle victory (rate = rarity × HP factor × item bonus) — Pokemon-standard formula
- Collection/pokedex by zone (emoji + tier + IV) — collection identity
- Duplicates → soul gems (tier-scaled value) — dupes are never useless
- Evolution L20→t1 / L50→t2 (t3 event-gated, schema from day one)
- 3+9 team management (3 mains + 9 buff slots)
- Support-item shop (bùa bắt, heal) + i18n VI/EN/ZH-CN + `/tq help`

**Should have (differentiators):**
- EA FC-style chemistry (bonus-only, no adjacency math) — team depth no Discord collection bot has
- Paid travel as an active economy sink — structurally different from Pokétwo/Mudae
- 6-IV stat blocks (~1B combinations → every hero unique; dupe comparison + IV chase = endgame)
- Star variants + 4-tier sprites (1056 pre-uploaded application emojis — visual prestige no competitor matches)
- Shareable auto-battle turn history (spectator-friendly text logs)
- Boss drops = items, never money (safe faucet that doesn't touch `users.balance`)

**Defer (v2+):** trading (gated, after anti-bot is solid), PvP (needs balance data), server-boss races, global leaderboards; v1.x: t3 event unlock, star chase (~1/512), chain/streak pity, daily quests.

**Anti-features (explicitly rejected):** direct hero purchase, hard energy walls, chat-activity encounters (Pokétwo model), strong pity guarantees, marketplace convertibility without an economy budget.

### Architecture Approach

Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md) — Confidence HIGH (codebase read directly 2026-08-10; app-emoji rendering MEDIUM).

**Major components:**
1. **Shared wallet service** (`services/wallet.ts`) — extract the atomic `UPDATE ... WHERE balance >= X` guard + `rowCount` check from `gather.ts` into `deductBalance/creditBalance`; refactor existing call sites; every new money sink goes through it.
2. **Travel state machine** — `player_travel_state` rows (FK → `users.id`, NOT `characters.id`) with derived timestamps (`departedAt/arrivalAt/nextEncounterAt`); position is a pure function of time → restart-proof, crash-proof.
3. **`sanguoTick` pg-boss cron** (manager process only, `*/1 * * * *`) — scans due encounters/arrivals with `FOR UPDATE SKIP LOCKED` (precedent: `resolveMatchBets`); cancel = row update (cancel-safe); NOT per-player delayed jobs (un-cancellable, job sprawl).
4. **Pure battle engine** (`services/sanguo/battleEngine.ts`) — synchronous seeded simulation, zero discord.js deps; invoked from the interaction handler or from the tick (which notifies via REST — precedent: `matchLifecycleService`).
5. **Capture service** — server-authoritative `captureChance(rarity, hp%, itemBonus)` clamped [0,1]; crypto RNG; per-attempt audit log.
6. **Generated emoji registry** (`assets/sanguoEmojis.ts`) — build-time generator from `emojis.json` manifest (1056 keys `{code}_t{tier}[_star]`), `heroEmoji()` helper, startup `applicationId === CLIENT_ID` assertion; never reads the sibling assets repo at runtime (Oracle VM won't have the path).
7. **i18n `sanguo` namespace** — content data (hero/zone/item names) in DB per-locale columns; only UI strings in i18next; registered in the `ns` array + 3 locale files from day one.
8. **customId prefix registry** (`components/sanguo/registry.ts`) — `sanguo:*` routed via map, not the 477-line `interactionCreate.ts` if-chain.

### Critical Pitfalls

Full detail: [PITFALLS.md](./PITFALLS.md) — Confidence MEDIUM-HIGH. Top 5:

1. **Faucet → marketplace arbitrage (Linh thạch printing press)** — design-gate the economy *first*: compute the expected Linh thạch/hour of the optimal loop (must sit below tu vi caps), default collection assets to non-convertible (soul gems account-bound), boss drops items not money, and run an economy audit report (Linh thạch per item per day) from day one.
2. **Travel cost rounding/refund bugs** — charge-on-arrival removes the refund path entirely; enforce cost monotonicity with a graph-wide test; integer math only; min cost 1/edge.
3. **Capture manipulation & client-influenced RNG** — server-authoritative state (capture references a server encounter row with server-recorded HP), crypto RNG only, chance clamped [0,1] with additive item stacking, full audit log including *failed* attempts.
4. **Duplicate → soul-gem farming loops (Pokétwo `max_duplicates` problem)** — diminishing returns on dupes + daily conversion cap, per-player encounter-pool skew after over-farming, zone-diversified travel, gems never Linh thạch-convertible.
5. **Botting (project already normalizes self-bot farming)** — the loop is trivially scriptable; the strongest defense is economic bounding (travel/item costs cap bot yield by construction), plus judgment-required travel choices, cooldowns/caps from day one, captcha → soft-cap → review escalation reusing existing captcha infra, and an explicit automation policy.

Also critical: **travel state corruption/double-spend** (Postgres truth + idempotent `UPDATE ... WHERE status` transitions + startup sweep + dedupe table for interaction money-ops), **RNG fairness + ZH-CN legal disclosure** (published = code config as single source of truth; visible pity counter), **pacing/grind walls** (budget encounters as an economy lever, explicit pacing targets with simulation, fast early ramp), **i18n string explosion** (content/UI split before content authoring), **emoji cross-guild breakage** (application-owned set + fallback + startup validation).

## Implications for Roadmap

Suggested 5-phase structure — unifying the architecture build order, the pitfalls phase mapping, and the features dependency chain:

### Phase 1: Foundation, Economy Budget & Content Infrastructure
**Rationale:** every later phase consumes the wallet, schemas, i18n and emoji registry; the economy design-gate (Pitfall 1) and content/UI split (Pitfall 9) must exist before any content is authored or every later phase pays migration cost.
**Delivers:** `wallet.ts` extraction + refactor of `gather.ts`/farming call sites; 8 new schemas (`heroes`, `user_heroes`, `map_nodes`, `player_travel_state`, `sanguo_battles`, `sanguo_items`, `user_sanguo_items`, `encounter_runs`) + migration + idempotent hero/map seed; `sanguo` i18n namespace (3 locales) with per-locale content columns; emoji generator → `sanguoEmojis.ts` + `heroEmoji()` + startup check; read-only `/sanguo map` scaffold + component registry; economy budget document (expected Linh thạch/hour ≤ caps; convertibility decisions).
**Addresses:** FEATURES i18n, starter schema, map groundwork.
**Avoids:** Pitfalls 1 (design-gate), 9 (content/UI split), 10 (emoji registry).

### Phase 2: Travel & Encounters (the real-time core)
**Rationale:** the time-based core that encounters depend on; the differentiator (paid travel as sink + anti-bot) ships here; Redis-cooldown and REST-notify patterns already exist in the codebase.
**Delivers:** pure `travelService` (ETA/cost/transitions); `/sanguo travel` (atomic wallet + state row); travel-cancel component; `sanguoTick` pg-boss cron with `skipLocked` claiming; encounter rolls → `encounter_runs` + REST notifications; route-scaled encounter rates; per-user encounter caps (~20/hr) and travel cooldowns from day one.
**Addresses:** FEATURES map travel, encounter roll.
**Avoids:** Pitfalls 2 (cost math — but see gap below), 6 (Postgres truth, idempotent transitions, startup sweep), 5 (cooldowns day one).

### Phase 3: Battle & Capture (first complete vertical loop)
**Rationale:** capture requires battle victory; this is the first fully playable slice (starter → travel → encounter → battle → capture → basic collection) and the first real "is this fun" validation point.
**Delivers:** pure `battleEngine` (seeded, replayable); `sanguo_battles` records with jsonb round logs; solo battle (player-initiated `/sanguo battle` + encounter-initiated via tick); `captureService` (rarity × HP × item, clamped); capture flow with % display, visible pity counter, and full attempt audit log (successes AND failures); 6×0–31 IV roll on capture; starter onboarding; basic `/sanguo heroes` collection view.
**Addresses:** FEATURES starter, capture formula + % display, auto-battle turn history, basic collection.
**Avoids:** Pitfalls 3 (server-authoritative + crypto RNG + audit log), 7 (pity + published = code rates), 8 (fast early ramp, guaranteed early encounters).

### Phase 4: Progression, Chemistry & Economy Depth
**Rationale:** progression only makes sense once capture exists; chemistry drives the second collection loop (multi-faction ownership); sinks close the economy loop and must be net-sink/neutral.
**Delivers:** duplicate → soul gems (tier-scaled, diminishing returns, daily conversion cap); evolution L20→t1 / L50→t2 with t3 schema-gated; `/sanguo shop` + bag (all sinks via `wallet.deductBalance`); boss encounters drop items (never money); legion battle 3+9 chemistry extending `battleEngine`; full collection filters (faction/zone/IV).
**Addresses:** FEATURES dupe → soul gem, evolution, item shop, boss drops, 3+9 chemistry, full pokedex.
**Avoids:** Pitfalls 1 (non-convertible gems, boss item faucet), 4 (diminishing returns + caps + pool skew + zone diversification), 8 (dedicated balance pass using telemetry built in Phases 2–3).

### Phase 5: Anti-Abuse, Monitoring & Marketplace Gating (hardening)
**Rationale:** economic bounding (Phases 2 + 4) is the primary bot defense and ships earlier; detection layers need live data and can land after the loop; marketplace convertibility must be design-gated before any collection item becomes marketable.
**Delivers:** velocity/exact-interval detection heuristics; captcha → soft-cap → review escalation reusing the existing farming-service captcha infra; economy audit reports (Linh thạch per item per day); marketplace convertibility gating (no collection items in instant-buy/sell bands without a reviewed conversion spec); explicit automation policy documentation (collection-game bots vs the paid farming service).
**Addresses:** FEATURES anti-features enforcement (no trading/PvP v1), marketplace integration.
**Avoids:** Pitfalls 5 (detection escalation, policy consistency), 1 (marketplace integration gate).

**Later milestones (out of scope):** server-boss events, PvP arena, gated trading, global leaderboards.

### Phase Ordering Rationale

- **Dependency chain is strictly linear** (FEATURES): starter → travel → encounter → battle → capture → collection → progression; foundation feeds all of them, then time-based core, then combat, then progression/economy, then hardening.
- **Vertical-slice discipline:** Phase 3 delivers the first full core loop; every phase ships something playable (map → travel → encounter → battle → capture → collection).
- **Pitfall mapping aligns with the build order:** economy design-gate first (P1), money/state correctness in travel (P2), RNG/audit in capture (P3), farm loops in progression (P4), detection last (P5) — matching PITFALLS' phase map exactly.
- **Scope tension to decide at roadmap time:** legion battle is FEATURES-P1 but architecture builds it last within Phase 4. It is the best time-box deferral candidate (v1.x) if scope needs trimming, but the chemistry data model should still be designed in Phase 1/4 groundwork so nothing blocks later.

### Research Flags

Phases likely needing `/gsd-plan-phase --research-phase` during planning:
- **Phase 5 (HIGH):** bot-detection heuristics and captcha escalation need research against the existing farming-service captcha infra; marketplace VWAP band specifics for the convertibility gate.
- **Phase 4 (MODERATE-HIGH):** pacing balance cannot be fully spec'd — needs the live telemetry hooks built in Phases 2–3 and a dedicated balance pass; chemistry buff values are design tuning.
- **Phase 2 (MODERATE):** must resolve the charge-on-arrival vs deduct-at-departure conflict (see Gaps); verify existing Redis cooldown utility vs `rate-limiter-flexible`.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1:** every element has a direct codebase precedent (`gather.ts` wallet pattern, schema conventions, `seed.ts`, `ns` registration, `commandLoader`).
- **Phase 3:** pure-engine pattern already proven by `services/breakthrough.ts`; crypto RNG + audit log are standard.

Cross-cutting: **deployment smoke-test of application-owned emoji rendering** (MEDIUM confidence) before Phase 2 depends on it.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry and official docs (2026-08-10); zero new frameworks — only pure-rand + optional rate-limiter-flexible |
| Features | MEDIUM | Competitor features cross-checked across community guides (Pokétwo, GO, EA FC); game-design decisions grounded in internal design notes (HIGH), but rates/pacing/rarity tuning need live data |
| Architecture | HIGH | Direct read of the actual codebase 2026-08-10 (schemas, gather.ts, matchLifecycleService, pgBoss, i18n, commandLoader); app-emoji rendering MEDIUM (docs only) |
| Pitfalls | MEDIUM-HIGH | Web research cross-checked across multiple sources; project-specific claims grounded in existing repo patterns (SELECT FOR UPDATE, captcha infra, tu vi caps) |

**Overall confidence: MEDIUM-HIGH**

### Gaps to Address

- **Charge-on-arrival vs deduct-at-departure (direct doc conflict):** PITFALLS mandates charge-on-arrival (deduct when arrival resolves → no refund path exists); ARCHITECTURE specifies deduct-at-departure in the same transaction as the travel row (cancel then implies a refund path). Resolve explicitly in Phase 2 planning; the verification plan must include a cancel/arrive/fail matrix test either way.
- **Economy budget numbers:** the expected Linh thạch/hour budget needs current tu vi caps and marketplace VWAP band values from the codebase — quick lookup, not deep research, but required for the Phase 1 design artifact.
- **Emoji rendering cross-guild:** application-owned emoji rendering verified via Discord docs only; needs one deployment smoke test before travel/battle embeds depend on it.
- **Pacing targets:** time-to-first-capture, captures/hour, time-to-t1/t2 are design numbers that need a spreadsheet simulation + live telemetry; cannot be fully resolved in research.
- **Capture/rarity constants:** rarity distribution (60/25/10/4/1), capture formula constants, star 1/512 are starting values needing balance passes.
- **Legion/chemistry scope:** FEATURES marks it P1, architecture builds it last — decide v1 vs v1.x at roadmap creation.
- **rate-limiter-flexible optionality:** decide during Phase 2 planning whether the existing Redis cooldown utility suffices or layered limits + memory insurance are warranted.

## Sources

### Primary (HIGH confidence)
- **Codebase direct read (2026-08-10):** `src/db/schema/users.ts` (balance bigint, `balance_non_negative` CHECK), `characters.ts` ("Redis is L1 cache only" invariant), `footballBets.ts`/`farming.ts` (`userId → users.id` precedent), `gather.ts` (atomic deduct pattern), `matchLifecycleService.ts` (`FOR UPDATE SKIP LOCKED`, REST posting from manager), `pgBoss.ts`/`activityWorker.ts` (manager-only jobs), `bot.ts`/`shard.ts` (process layout), `i18n/index.ts`, `commandLoader.ts`, `breakthrough.ts`, `E:/Saeth/sanguo_assets/assets/emojis.json` (1056-key manifest)
- **npm registry (2026-08-10)** — versions: pure-rand 8.4.2, rate-limiter-flexible 11.2.0, seedrandom 3.0.5, weighted libs
- **github.com/dubzzz/pure-rand** — generators, `uniformIntDistribution`, `purify()` state threading
- **peteroupc.github.io/random.html** + **Rust Rand book** — CSPRNG required for player-visible outcomes
- **on-systems.tech / oneuptime / dev.to** — `SELECT FOR UPDATE` & `SKIP LOCKED` correctness
- **GitHub Pokétwo autocatcher projects** + **docs.poketwo.net** — real-world auto-farm exploit shapes (`max_duplicates`)
- **Project internal:** AGENTS.md, PROJECT.md, `.planning/notes/sanguo-game-design.md`

### Secondary (MEDIUM confidence)
- Context7 `/davidbau/seedrandom`, `/animir/node-rate-limiter-flexible` — PRNG algorithms, RateLimiterRedis + ioredis setup
- Discord official emoji resource + discord.py 2.5 `fetch_application_emojis` — application-owned emoji rendering
- packagemain.tech / alongside.team — PG-truth + Redis-cache hybrid consensus
- Pokétwo site/docs, Zelda.zone guide; Bulbapedia/Pokemon Fandom/Pokebattler catch formula; EA FC 25/26 chemistry guides
- GameGrowthAdvisor / Machinations / Yodo1 4S — economy sinks/faucets; GameAnalytics/Apptrove — idle pacing (async clocks vs energy walls)
- Verisoul / scitepress.org (ICSOFT 2017) — bot detection playbooks
- note.com/gs2, dev-flow.io, backendbytes.com — idempotency keys, double-receipt prevention
- chinagamelegal.com, mdpi.com, arxiv — gacha probability disclosure & pity (China legal expectations)
- gamebalanceconcepts / gamedeveloper.com / gamescrye — pacing & progression; simplelocalize / lokalise / localization.blog + IGDA — game localization best practices
- Medium "Our Rate Limiter Failed. Bots Cost Us $18K in 6 Hours" — layered rate-limiting lesson

### Tertiary (LOW confidence)
- None — all claims cross-checked across ≥2 sources; the lowest-confidence item (application-owned emoji rendering) is flagged for a deployment smoke test rather than trusted blindly.

---
*Research completed: 2026-08-10*
*Ready for roadmap: yes*
