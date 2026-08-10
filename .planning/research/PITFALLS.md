# Pitfalls Research

**Domain:** Pokemon-style collection game (Tam Quốc Collection) added to an existing Discord RPG bot (TuTien) with shared Linh thạch currency
**Researched:** 2026-08-10
**Confidence:** MEDIUM-HIGH (web research cross-checked across multiple sources; project-specific claims grounded in the repo's existing patterns)

## Critical Pitfalls

### Pitfall 1: Capture-game faucets become a Linh thạch printing press via the global marketplace

**What goes wrong:**
The collection game creates new ways to obtain things of value (heroes, soul gems, support items) and the existing global marketplace with VWAP pricing (instant buy 1.2×, instant sell 0.7× minus 10% burn fee) turns those things into Linh thạch on demand. Players find the cheapest faucet-to-market path — typically farming the most common hero/zone and instantly selling — and convert gameplay into an hourly Linh thạch yield. Because Linh thạch is the *only* currency and is purchasable with real money, this is a direct revenue leak: every exploited faucet is money the operator is minting for free.

**Why it happens:**
The game systems are designed independently (collection game = fun loop; marketplace = economy loop) and the *conversion edge* between them is never budgeted. Any item that can be farmed with effort E and sold for value V creates an arbitrage whenever V/E beats every other farming method in the game. The existing tu vi system is capped precisely to prevent this; a new game with its own fresh cooldown table bypasses those caps.

**How to avoid:**
- **Design-gate first, integrate second.** In the economy design phase, compute the *expected Linh thạch/hour* for the optimal capture-game loop (encounter rate × sellable yield − travel cost − item cost). This number must be below the tu vi farming cap and below the daily caps — treat it as a budgeted faucet, not an accident.
- **Default to non-convertible.** Collection-game assets (heroes, soul gems, evolution materials) should not be sellable on the Linh thạch marketplace unless explicitly designed as a sink-with-known-yield. Soul gems are the highest-risk asset — keep them account-bound (soul gems are inherently account-bound in the design: duplicate → leveling).
- If tradeables must exist, scope them to *collection-game internal* trade (hero-for-hero), never instant-cash-out, or price the instant-sell band far below the market (the 0.7× band already exists — do not add collection items into it casually).
- Audit hooks: run a periodic economy report (Linh thạch created per item per day) from day one so a spike is visible before it compounds.

**Warning signs:**
Support tickets about "fastest way to farm Linh thạch in the collection game"; leaderboard players with huge balances and small tu vi; per-item daily volume spikes in marketplace analytics.

**Phase to address:**
Phase A (Game Design & Economy Model) — the faucet/sink budget must be a design artifact; re-verified in Phase G (Items & Marketplace Integration) before any collection item becomes marketable.

---

### Pitfall 2: Travel cost math with rounding/refund bugs creates free or negative-cost movement

**What goes wrong:**
Node-map travel charges by distance. If the cost formula uses integer division/flooring, a direct path can cost more than two short hops (breaking monotonicity), or very short hops round to zero → free movement → free encounters. Travel-cancel/refund logic doubles: a player cancels after arrival, gets a refund, and repeats — travel becomes a Linh thạch faucet rather than a sink. Failed-travel retry paths (pay → error → pay again) double-charge.

**Why it happens:**
Cost formulas are written as "distance × rate" without testing the *edge cases*: rounding mode, minimum cost (must be ≥ 1 so no free hop exists), refund policy ambiguity ("refund on cancel" vs "refund on failure"), and idempotency of the payment step. Integer math is the classic silent killer — 3 × 0.33 truncating to 0.

**How to avoid:**
- Enforce **monotonicity**: cost(A→B) ≤ cost(A→C) + cost(C→B) for all triples; assert this in tests with a brute-force pass over the node graph.
- **Charge on arrival, not departure** (deduct the balance when the arrival is resolved, inside the same transaction that resolves the travel). This eliminates cancel-refund entirely — there is nothing to refund until you arrive, and once you arrive you've already paid.
- All cost math in integers (Linh thạch is a bigint — keep it that way); `min cost = 1` per edge.
- Every money-touching command goes through the existing race-safe pattern (SELECT FOR UPDATE on the user row, `balance_non_negative` CHECK as the final guard) — never a standalone balance mutation.

**Warning signs:**
Players discover "free routes"; travel cost reported as 0; refund tickets; balance going negative (caught by CHECK → 500 errors that hint at a race).

**Phase to address:**
Phase C (Movement & Travel). Verify with a graph-wide cost test and a cancel/arrive/fail matrix test.

---

### Pitfall 3: Capture rate manipulation and client-influenced RNG

**What goes wrong:**
Capture chance is computed from HP remaining, rarity, and capture items. If any input can be influenced by the client or by out-of-order state (e.g., HP read from the player's claimed battle state, item multipliers stacking multiplicatively without a cap), players engineer 100% capture rates or brute-force low-cost capture. If RNG is `Math.random()`, capture outcomes are predictable/sharable across shards (seeded by time) and farmable.

**Why it happens:**
The formula looks simple in a spec, but the *inputs* come from async state (battle history, HP at end of last turn) that is easy to desync; multiplicative item stacking makes percentages compound beyond 100%; and the team reaches for the convenient `Math.random()` instead of crypto RNG.

**How to avoid:**
- **Server-authoritative everything.** HP, battle outcome, and encounter state all come from the server's own records, not from the interaction payload. Validate: the capture request must reference a server-side encounter row with server-recorded HP.
- **Crypto RNG for capture rolls** (`crypto.randomInt`/`randomBytes`); never `Math.random()` for anything that grants assets.
- **Cap capture chance at [0, 1]** with a hard floor/ceiling regardless of item stacking; define stacking as additive-on-base, not multiplicative (or cap the multiplier at a documented bound).
- **Per-player deterministic audit trail:** log every capture attempt (encounter_id, hp, item used, computed chance, roll, outcome) — this single table resolves every "the game is rigged" complaint with data and catches manipulation.

**Warning signs:**
Capture success rate per item statistically above the published rate; players with 100% capture on high-rarity heroes; "capture chance > 100%" displayed or implied.

**Phase to address:**
Phase E (Battle & Capture) — the audit log and crypto RNG are built into the capture command from the first commit, not retrofitted.

---

### Pitfall 4: Duplicate → soul gem farming loops (the Pokétwo "max_duplicates" problem)

**What goes wrong:**
Duplicates convert to soul gems which level heroes. The cheapest hero to farm (highest encounter rate, weakest, on the cheapest travel route) becomes the designated farming target: players farm the same hero thousands of times, converting to gems, ignoring everything else. The collection game's "collect 100 heroes" premise collapses into "farm 1 hero". Pokétwo's own autocatcher ecosystem proves this is the *first* thing bots do — the config even has `restrict_duplicates` / `max_duplicates` knobs because duplicate floods are the dominant farm.

**Why it happens:**
Duplicate value is flat (1 dupe = 1 gem regardless of which hero), so rational players optimize for *cheapest dupe per gem*. Nothing in the design disincentivizes repetition; encounter rarity only affects the top of the pool, not the bottom.

**How to avoid:**
- **Diminishing returns on duplicates:** first duplicate of a hero yields full gems, subsequent duplicates yield fractionally less (e.g., halved, then capped at a daily limit). Cap daily soul-gem conversion per player.
- **Soul gems must not be Linh thạch-convertible** (see Pitfall 1) — this kills the "farm dupes → sell gems → buy anything" loop.
- **Encounter pool skew:** after a species is over-farmed by a player, its encounter weight drops for that player (per-player encounter pool adjustments) — directly borrowed from Verisoul's "dynamic resource spawning" anti-bot playbook; it doubles as a pacing tool.
- Require travel to *different* zones to diversify the pool (dupe rates tied to zone visited today), making farm loops multi-node and thus more expensive.

**Warning signs:**
One species dominating capture statistics; soul-gem stockpiles far exceeding leveling need; support threads asking "which hero should I farm for gems".

**Phase to address:**
Phase F (Progression — duplicates, soul gems, evolution). The diminishing-returns table and daily conversion cap are part of the progression spec, not an afterthought.

---

### Pitfall 5: Botting — the collection loop is a perfect automation target, and the project already normalizes self-botting

**What goes wrong:**
Travel → encounter → auto-battle → capture is a deterministic, scriptable loop. Players run auto-move/auto-farm scripts (the exact Pokétwo autocatcher pattern: configurable catch rate, delay, priority lists, duplicate caps) and farm Linh thạch-value assets while AFK. This project's *own* monetized self-bot farming service means the player base is automation-savvy and the codebase already has token-holding infrastructure — the barrier to entry for collection-game bots is near zero, and the operator's anti-bot stance is visibly inconsistent ("we sell farming bots, but you can't use farming bots").

**Why it happens:**
The loop is highly repetitive with no human judgment required; the reward is real (Linh thạch-convertible assets); and Discord interactions (slash commands) are trivially scriptable — bots just replay REST calls, no UI automation needed.

**How to avoid:**
- **Make the loop require judgment:** travel choices with real tradeoffs (route cost vs encounter quality vs time), capture decisions with opportunity cost. Purely mechanical loops are the ones that get botted.
- **Economic bounding is the strongest defense:** because travel costs Linh thạch and capture items cost Linh thạch, a bot's yield is bounded by its balance — and balance comes from capped tu vi farming or real money. A correctly budgeted economy *caps bot value by construction*; this is why Pitfall 1 and 2 matter more than any detector.
- **Detection (repurpose existing infra):** the project already has captcha-alert infrastructure for the farming service — extend it to collection-game escalation. Collect per-user action timing (travel intervals, capture intervals) and flag *exact-interval* or impossibly-fast sequences (statistically below human-variance); escalation = captcha, then soft-cap, then review.
- **Cooldowns from day one:** per-user travel cooldown, per-zone encounter caps, daily capture caps — the same anti-farming machinery already used for tu vi; mirror those patterns.
- **Policy consistency:** decide explicitly how collection-game automation is treated relative to the paid farming service and state it in the ToS/help docs; ambiguity breeds resentment and false-positive riots.

**Warning signs:**
Users with 24/7 travel activity and zero variance in command latency; capture timestamps spaced exactly N seconds apart; a species farmed to thousands of dupes; reports of "players never offline".

**Phase to address:**
Cooldowns/caps: Phase C + Phase F (day one). Detection heuristics + captcha escalation: Phase H (Anti-abuse & Monitoring) — do not block shipping on detection; block on the economic bounding.

---

### Pitfall 6: Real-time travel state corruption — races, stale state after restart, double-spend

**What goes wrong:**
Travel is real-time (arrival at a future timestamp). Three failure modes: (a) **race** — two concurrent travel commands double-charge or create two overlapping journeys; (b) **stale-after-restart** — travel state kept only in Redis/process memory, so a restart strands players mid-travel (paid and never arriving) or forgets they traveled (free encounters on arrival); (c) **double-spend/double-reward** — an arrival job crashes after the player arrives but before the encounter is granted, retries grant two encounters; a travel-cancel retry refunds twice; a capture-item consumption retries spend twice.

**Why it happens:**
The natural first implementation is "store ETA in Redis, set a setTimeout, grant encounter on fire" — three separate stores (Redis + timer + DB) with no single transaction. Any crash between them desyncs state, and Redis is flippable (a flush or restart resets it silently).

**How to avoid:**
- **Postgres is the source of truth for travel state.** Table: `player_travel(user_id, from_node, to_node, cost, departed_at, arrives_at, status)`; the payment and the travel row commit in one transaction (charge on arrival design from Pitfall 2 makes this even simpler).
- **SELECT FOR UPDATE on the user row** for every travel/capture/cancel command (the same pattern the betting system already uses — reuse it, don't reinvent). Reject if a travel is already active.
- **Arrival resolution is a single atomic UPDATE ... WHERE status = 'traveling' AND arrives_at <= now()** that transitions to 'arrived' and inserts the encounter in the same transaction; the WHERE clause makes retries idempotent (second run matches 0 rows).
- **Startup sweep job:** on boot, one pg-boss job finds all rows with `status='traveling'` and `arrives_at < now()` and resolves them (or, for far-future ones, re-arms a scheduler entry). Never trust in-memory timers across restarts; use pg-boss `schedule()` for arrival events, matching the existing VWAP-recalc pattern.
- **Idempotency keys for interaction-driven money ops:** capture-item spend and travel commands get a dedupe table (unique constraint on (user_id, operation_id)) so Discord interaction retries can't double-execute — the same mechanics as the researched idempotency-key pattern (work + dedupe record commit atomically).

**Warning signs:**
Support tickets "I paid for travel and never arrived" or "I got 2 encounters from one trip"; duplicate hero rows for one encounter; negative balance CHECK violations.

**Phase to address:**
Phase C (Movement & Travel) + Phase E (Battle & Capture). Verify with a restart-test and a concurrent-command test in the phase's verification plan.

---

### Pitfall 7: RNG fairness — capture streaks feel rigged, and ZH-CN players have legal-grade expectations

**What goes wrong:**
A 20% capture rate means 80% of players experience a 5-failure streak within their first dozen attempts; the community concludes "the rates are a lie" and the support channel floods. If the actual implemented rate drifts from the published rate (config change, formula bug, rounding), it's worse than a perception problem — in China (a target locale, ZH-CN), probability disclosure is legally regulated: rates must be prominently disclosed, must match the actual algorithm, and pity mechanics are subject to specific rules (visible counter, defined cap, inheritance on pool updates).

**Why it happens:**
Rates are tuned in isolation ("make rare heroes rare") without modeling the *streak distribution* players actually experience; and published rates and code rates are maintained separately, drifting apart silently.

**How to avoid:**
- **Publish capture rates in-game** (per rarity, per item bonus) — and make the published value a single source of truth (generated from the same config the code reads, so they cannot drift).
- **Pity/streak system on capture:** every failed capture increments a per-player counter that raises the next attempt's chance; reset on success. This is the industry-standard fairness mechanism (soft pity) and doubles as a pacing tool. Show the counter to the player — it converts "rigged" complaints into visible progress.
- **Server-authoritative seeded RNG** (Pitfall 3) and **never silently adjust probabilities** — any nerf/buff is announced and documented.
- Display *effective* probabilities where possible (pity-inclusive), matching the "disclose effective reward frequencies" guidance.

**Warning signs:**
"Rates are rigged" threads; capture success rates that don't match published rates in the audit log; players tracking streaks manually.

**Phase to address:**
Phase D (Encounters & RNG infrastructure) + Phase E (Battle & Capture). The pity counter and rate-disclosure command are part of the capture spec.

---

### Pitfall 8: Pacing — encounters too frequent/sparse, and grind gates that read as walls

**What goes wrong:**
Two symmetric failures: (a) encounters fire on every node hop → travel is a slot machine, chat spam, and the free-capture faucet floods the economy (Pitfall 1 feeds on this); (b) encounters are rare → travel is dead time, players quit before the first capture. Then the progression gates (t1 at level 20, t2 at 50, dupes for soul gems) are tuned as linear grinds — the early game feels slow, the mid-game is a wall, and players describe the game as "farm the same hero 500 times".

**Why it happens:**
Encounter rate is chosen by feel, not by *expected time between meaningful events*; progression gates are set by counting content ("20 levels feels reasonable") without simulating the time-to-gate through the actual capture/soul-gem loop. Grind is what players call progression that stops working — the researched signal for "grind" is *forced repetition of mastered content with no visible momentum*.

**How to avoid:**
- **Budget encounters as an economy lever** (free captures are a faucet; travel cost is the sink). Set encounter probability so expected *net* yield per hour lands in the budgeted band from Pitfall 1, then check the pacing feel — the two must be solved together, not sequentially.
- **Pacing targets, not guesses:** define "time to first capture" (minutes), "captures per hour", "time to t1", "time to t2" as explicit design numbers with a spreadsheet simulation; tune encounter rate and dupe yields against them.
- **Early-game ramp is fast** (guaranteed early encounters, generous first-capture rates — the researched consensus is a slow early game is the top retention killer); mid/late plateaus are *intentional and visible* ("you need 40 soul gems, you have 12 — here's where they come from").
- Encounters scaled to travel length: longer trips = higher chance per hop, so short hops aren't a free-farm loop and long trips feel rewarding.
- Per-zone daily encounter caps (anti-bot from Pitfall 5) double as pacing governors.

**Warning signs:**
"Too much spam" feedback; drop-off after first session; "this is a grind" threads; economy metrics showing capture-game Linh thạch yield above budget.

**Phase to address:**
Phase A (design targets/simulation) + a dedicated balance pass after Phase F once real numbers exist — pacing cannot be fully tuned in a spec; it needs the live telemetry hooks (encounter yield per hour, time-to-gate) that Phases C–F must include.

---

### Pitfall 9: i18n string explosion — collection content drowns the translation system

**What goes wrong:**
A collection game multiplies string volume: 100+ heroes × names, dozens of zones, items, evolution-tier names, encounter flavor text, battle-log templates. If all of it goes into i18next translation files as keys (hero.lvbu.name, zone.chibi.name...), the file balloons to thousands of keys, translators maintain hero names they can't see in context, the ESLint zero-hardcoded-string rule starts generating false positives, and every hero/zone added later requires a translation-file edit + deploy instead of a DB row.

**Why it happens:**
The existing i18n discipline ("no hardcoded strings") is applied literally to *everything*, without distinguishing UI strings from game-content data. Content in the translation system also conflates identity (hero names are also used in battle math, market listings, team composition) with display.

**How to avoid:**
- **Split content-data from UI strings** — this is the researched best practice for game localization:
  - *Content data* (hero names, zone names, item names, tier names) lives in the DB/config as rows with per-locale display columns (`name_vi`, `name_en`, `name_zh`), like any other game entity. Emoji IDs, stats, rarity — all in the same row.
  - *UI strings* (button labels, embeds, system messages, battle-log templates) live in i18next namespaces.
- **Interpolate, don't key-splice:** battle logs use templates with placeholders (`battle.capture_success: "Đã thu phục {hero}!"`), never t() on a dynamically built key.
- **Namespaced keys per subsystem** (`travel.`, `encounter.`, `battle.`, `capture.`, `collection.`) so the translation files stay scannable and lazy-loadable — the existing i18next scaffold already supports namespaces.
- **Extend the ESLint enforcement** to forbid dynamic keys (`t(\`hero.\${name}\`)`) and catch missing keys in CI; add an orphaned-key/duplicate-key linter as the file grows.
- ZH-CN note: avoid article/vowel-dependent sentence branching in code — keep full-sentence templates in translations rather than assembling fragments (grammar order differs per language).

**Warning signs:**
Translation files exceeding ~500 keys per namespace without the content/UI split; `t()` calls with template-literal keys; new heroes shipped with English-only names because "translations weren't ready".

**Phase to address:**
Phase B (i18n Content Infrastructure) — the content/UI split and hero/zone content schema must exist before Phase C–F content is authored, or every later phase pays the migration cost.

---

### Pitfall 10: Emoji display and cross-guild asset assumptions

**What goes wrong:**
Heroes render as Discord emoji. If the bot relies on custom emoji it doesn't own (borrowing from a guild it was invited to), emoji break or render as `:name:` text in other guilds; if emoji IDs are hardcoded in code, adding heroes requires deploys. The whole collection display collapses into a wall of broken glyphs.

**Why it happens:**
Discord custom emoji are guild-scoped; the assumption "the emoji I saw in dev guild works everywhere" fails across the multi-shard, multi-guild deployment.

**How to avoid:**
- Own a dedicated emoji set (the bot's own application/guild) or use unicode emoji with a documented fallback; store emoji ID/render string per hero in the *content-data row* (per-locale-agnostic), not in code or translation files.
- Centralize a `getHeroEmoji(heroId)` helper so a single emoji source of truth exists; validate emoji availability at startup.

**Warning signs:**
`:name:` literal text in embeds; support screenshots showing missing glyphs in specific guilds.

**Phase to address:**
Phase F (or the content phase where heroes are seeded). Low severity but embarrassing — cheap to do right, expensive to retrofix across 100 heroes.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Travel ETA stored only in Redis + in-memory timer | Ships movement fast, no schema | Restart strands players / double-grants; every crash is a support ticket | **Never** — the startup-sweep + Postgres travel row is not much more work |
| `Math.random()` for capture rolls | One line, no crypto import | Predictable RNG is farmable; audit log can't defend "rigged" claims | **Never** for anything granting assets |
| Collection items sellable on marketplace "for now" | Instant liquidity, happy players | Unbudgeted faucet mints Linh thạch; only fixable with a rollback that enrages players | **Never** — decide convertibility in the design phase, not reactively |
| Duplicate → soul gem at flat rate | Simple, understandable | Single-species farm loops; economy skews to the cheapest dupe | Only if a daily conversion cap + diminishing returns are added immediately |
| Hero names in i18next translation files | Follows the "no hardcoded strings" rule literally | Key explosion, translators out of context, hero addition = deploy | **Never** — use per-locale content columns |
| Flat encounter probability regardless of route length | One constant, easy to tune | Short hops become the optimal farm; pacing feel is uniform dead time | Only in MVP with a documented plan to move to route-scaled rates in the balance pass |
| Anti-bot cooldowns stored only in Redis with no persistence | Simple, fast | Redis flush/reset silently disables all cooldowns | MVP only — acceptable *if* the economy bounding (Pitfall 5) is the real defense, not the cooldowns |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Global marketplace (VWAP) | Adding collection items to the existing instant-buy/sell bands as a first integration | Design-gate convertibility first (Pitfall 1); if convertible, budget the yield and consider a wider sell-band discount for collection items |
| Shared `users.balance` | Writing a second, parallel balance-mutation path for capture-item purchases/travel | Every money op goes through the same SELECT FOR UPDATE + `balance_non_negative` CHECK transaction the betting system uses |
| pg-boss scheduler | Per-shard in-memory timers for arrivals (double-fires across shards, lost on restart) | Single pg-boss arrival job per travel; `schedule()` like the VWAP recalc; startup sweep resolves stale rows |
| Discord message components | Capture-confirm buttons trusting interaction custom_id + allowing re-invocation | Idempotency key per interaction (dedupe table, unique constraint) so double-clicks can't double-spend |
| Existing self-bot farming service | Ignoring that the codebase already runs automation tokens; treating collection anti-bot as a separate world | Reuse the captcha-alert infra for detection escalation; document the policy boundary explicitly (Pitfall 5) |
| Discord emoji | Hardcoding emoji IDs seen in the dev guild | Hero-content row stores the emoji; single `getHeroEmoji` helper; startup validation (Pitfall 10) |
| i18next + ESLint enforcement | Extending the linter naively → dynamic keys and content strings become false-positive noise | Enforce key *shape* (no template-literal keys) and the content/UI split, not just "no literals" (Pitfall 9) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| SELECT FOR UPDATE on user row for every travel/capture command | Lock waits spike when a popular player acts; PgBouncer pool exhaustion | Keep transactions tiny (no awaits inside the lock window); only lock the user row, not related tables; batch read-only lookups outside the tx | ~hundreds of concurrent ops on the same hot user; more likely: pool exhaustion across shards (PgBouncer already planned — verify transaction-mode settings) |
| Arrival-resolution job per player at scattered timestamps | pg-boss job table growth; thundering herd when many travels expire at the same hour | One sweep job every N seconds resolving all due travels (`WHERE arrives_at <= now()`) instead of per-travel schedules | Thousands of concurrent travels per hour |
| Per-encounter DB writes (audit log) at scale | Capture audit table grows unbounded; write amplification | Audit log is append-only by design — partition by day/month or archive after 30–90 days; keep only recent rows hot | 100K+ captures/day (later milestone; the partition plan should be in the Phase E schema) |
| Interpolating content names into battle logs on every message | Repeated DB lookups per battle turn (hero names, locale columns) | Cache hero content rows in Redis (hero ID → localized name + emoji); invalidate on content update only | High-frequency battles with 12 heroes per legion battle |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client/claimed battle state in capture chance (HP, items) | Engineered 100% capture; item exploit | Server-authoritative encounter row with server-recorded HP; capture request references server state (Pitfall 3) |
| `Math.random()` for capture/encounter RNG | Predictable outcomes, farmable patterns, indefensible audit | `crypto.randomInt`/`randomBytes`; per-player seeds; full attempt audit log |
| Non-idempotent travel/cancel/capture-item commands | Double-spend, double-refund, double-reward on retry/crash | Dedupe table with unique (user_id, operation_id); atomic `UPDATE ... WHERE status=...` transitions (Pitfall 6) |
| Unbounded item stacking on capture chance | Chance exceeds 100%, or negative after rounding | Additive-on-base stacking with hard cap; clamp [0,1] server-side |
| Refund path on travel cancel | Refund replay → Linh thạch mint | Charge-on-arrival design removes refunds entirely (Pitfall 2) |
| Rate config drifting from published rates | Legal exposure in ZH-CN market; trust collapse | Single source of truth: publish the same config the code reads (Pitfall 7) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Capture failure streaks with no explanation | "Rigged" complaints; churn after the first wall | Visible pity counter; "next capture +X%" feedback (Pitfall 7) |
| Encounter spam during travel | Channel noise; players disable/leave | Route-scaled encounter chance; batch encounter reports; per-zone caps |
| Real-time travel with no progress visibility | Players don't trust the system; "where am I / when do I arrive?" | Travel embed with countdown + ETA + cancel option (cancel only pre-arrival, no refund needed under charge-on-arrival) |
| IVs shown as raw 6 numbers | Meaningless to new players; number-format differences across locales | Grade summary (S/A/B...) plus expandable detail; use localized number formatting via i18next |
| Soul-gem requirements shown without sources | "Grind wall" perception (Pitfall 8) | Progression screen: "need 40, have 12 — from: dupe conversion (route hint), boss drop (zone hint)" |
| Captcha/soft-cap escalation without warning | Legit players feel accused (the known false-positive trap) | Escalate gently: warn message → temporary soft-cap → captcha; manual review before any ban; appeal path |

## "Looks Done But Isn't" Checklist

- [ ] **Travel:** Charges balance but the arrival job is never scheduled (or dies with the process) — verify a player who pays *arrives*, including across a restart.
- [ ] **Travel:** Cancel command exists but the refund path is not idempotent — verify double-cancel doesn't double-refund.
- [ ] **Capture:** Published capture rate ≠ code rate — verify the disclosure command reads the same config the capture roll uses.
- [ ] **Capture:** Audit log writes on success only — verify *failed attempts* are logged too (that's the data that defends "rigged" claims).
- [ ] **Restart:** In-flight travels survive restart — verify the startup sweep resolves `traveling` rows with `arrives_at < now()`.
- [ ] **Anti-bot:** Cooldowns live in Redis with no persistence — verify what happens when Redis flushes (economy bounding should still hold).
- [ ] **i18n:** New hero/zone/content added — verify it requires a DB row, not a translation-file edit and deploy.
- [ ] **Soul gems:** Duplicate conversion capped and diminishing — verify no unbounded per-player conversion loop.
- [ ] **Emoji:** Every hero renders in a guild the bot doesn't own — verify fallback path.
- [ ] **Sharding:** Arrival events fire exactly once across shards — verify with two shards processing the same travel row.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Economy exploit (faucet arbitrage, double-refund) | HIGH | Freeze the exploit path (kill switch on the conversion), snapshot affected accounts, compute clawback from the audit log, targeted balance corrections; announce honestly; **never** silently wipe accounts |
| Travel state corruption after crash | LOW-MEDIUM | Startup sweep resolves all `traveling` rows; players whose travel elapsed get their encounter + arrival message; refund only where payment happened without resolution |
| Double-spend (capture item / travel) | MEDIUM | `balance_non_negative` CHECK prevents catastrophic negative; reconcile from the dedupe table + audit log; manual credit/debit via the same transactional balance path |
| RNG fairness outcry | MEDIUM | Publish the audit-log aggregate ("last 30 days: rate X vs published Y"); add/adjust pity counter; disclose any rate change before applying |
| i18n content/UI entanglements | MEDIUM-HIGH | Migration script: hero/zone/item names extracted from translation files into per-locale content columns; linter to catch remaining dynamic-key usage |
| Bot-detection false positives | MEDIUM | Never auto-ban; soft-cap first, captcha second, human review third; appeal path documented — the researched consensus is the community riot over false bans is worse than the bots |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Faucet → marketplace arbitrage | Phase A (Economy Model) + Phase G (Marketplace Integration) | Economy report: capture-game Linh thạch yield/hour ≤ budget; no collection item marketable without a reviewed conversion spec |
| Travel cost math / refund bugs | Phase C (Movement & Travel) | Graph-wide monotonicity test; charge-on-arrival; cost ≥ 1 per edge; no refund path exists |
| Capture manipulation / RNG | Phase E (Battle & Capture) | Crypto RNG; server-authoritative state; capture-attempt audit log; chance clamped [0,1] |
| Duplicate farming loops | Phase F (Progression) | Diminishing-return table + daily conversion cap; soul gems non-convertible to Linh thạch |
| Botting | Phase C + F (cooldowns/caps from day one); Phase H (detection escalation) | Cooldown enforcement survives Redis flush; captcha escalation path wired; economy bounding holds (bot yield ≤ caps) |
| State corruption / double-spend | Phase C + E (transactional travel + idempotency) | Restart test; concurrent-command test; dedupe table rejects replays |
| RNG fairness | Phase D + E (pity counter, rate disclosure) | Published rate = code rate (same config); pity counter visible in capture embed |
| Pacing / grind | Phase A (targets + simulation) + post-F balance pass | Time-to-first-capture, captures/hour, time-to-t1/t2 telemetry vs targets |
| i18n string explosion | Phase B (Content Infrastructure) | Content/UI split in place before content authoring; no dynamic t() keys (linter) |
| Emoji / asset assumptions | Phase F (hero content seeding) | All heroes render cross-guild; fallback verified |

## Sources

| Source | Confidence | Note |
|--------|-----------|------|
| gamedev.stackexchange — how to detect/prevent botting of game API | MEDIUM | Exact-interval heuristic, CAPTCHA escalation, false-positive risk, "make it too fun to bot" |
| Verisoul — advanced bot prevention in gaming | MEDIUM | Dynamic resource spawning, transaction limits, economic honeypots, ML economic analysis |
| scitepress.org (ICSOFT 2017) — game bot detection via behavioral features | MEDIUM | Login frequency, play time, action-sequence features |
| GitHub — Pokétwo autocatcher projects (PokeBall-SelfBot, AkshatOP) | HIGH | Real-world auto-farm configs: catch rate, delay, priority lists, `max_duplicates` — the exact exploit shape to defend against |
| docs.poketwo.net — spawning & catching | HIGH | Per-user spawn cooldowns, multi-user conversation requirement as spawn gating; self-bot ban policy |
| on-systems.tech / oneuptime / dev.to — PostgreSQL SELECT FOR UPDATE & SKIP LOCKED | HIGH | Read-committed lost-update fix, row locking, advisory locks, SERIALIZABLE caveats |
| note.com/gs2 — game server retry/idempotency/double-receipt prevention | MEDIUM | `duplicationAvoider` on consume/grant actions, replay of success responses |
| dev-flow.io / backendbytes.com — idempotency keys & transactional outbox | MEDIUM | Work + dedupe record must commit atomically; reaper for stale keys |
| chinagamelegal.com — gacha probability disclosure & pity requirements (China) | MEDIUM | Legal expectations relevant to the ZH-CN locale: prominent disclosure, counter visibility, pity inheritance |
| mdpi.com / arxiv — gacha fairness, pity systems, transparency research | MEDIUM | Soft/hard pity, effective-frequency disclosure, trust mechanics |
| gamebalanceconcepts / gamedeveloper.com / gamescrye — pacing & progression | MEDIUM | Grind = forced repetition of mastered content; early-game ramp; power creep; plateau design |
| simplelocalize.io / lokalise.com / localization.blog — translation key management | MEDIUM | Key conventions, no variables in keys, no sentence splitting, orphaned-key cleanup |
| IGDA — Best Practices for Game Localization (AWS-hosted PDF) | MEDIUM | Content vs UI split, name glossaries, data-driven language branching (Korean/ZH-CN vowel/consonant cases) |
| Project repo (AGENTS.md, PROJECT.md) | HIGH | Existing patterns reused: SELECT FOR UPDATE betting race-safety, tu vi anti-farming cooldowns/caps, self-bot farming service, i18next + ESLint zero-hardcoded-strings, VWAP marketplace bands |

---
*Pitfalls research for: TuTien Bot — Milestone v3.0 Tam Quốc Collection*
*Researched: 2026-08-10*
