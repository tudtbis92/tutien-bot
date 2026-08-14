# Phase 11: Progression, Chemistry & Economy Depth — Research

**Researched:** 2026-08-14
**Domain:** hồn ngọc progression (dupe→conversion→level→evolve), multi-currency shop + item economy, 3+9 legion chemistry battle (battleEngine extension), boss redesign (random zone general), 2-slot skill/MP system
**Confidence:** MEDIUM (balance numbers are agent-discretion proposals requiring an in-plan balance pass; architecture/schema findings HIGH)

## Summary

Phase 11 delivers the depth layer of the Tam Quốc Collection vertical loop: per-hero hồn ngọc (Pokemon-Go candy model, D-02), an accelerating level curve (max 100, D-01/D-05), evolution t0→t3 (D-06..D-10), the multi-currency `/sanguo shop` + bag + guaranteed boss item drops (D-11..D-16), the **boss redesign** (random zone general, t2 + IV100 + L50, forced 3v1 legion, capturable — D-24..D-28/D-35/D-36, closing WINDOWS.md #5), the **legion 3+9 chemistry battle engine extension** (D-17..D-23), and the full **2-slot skill/MP system** (D-29..D-32) with wild encounter levels (D-33/D-34). It closes the economy loop under the D-19 net-sink/neutral hard constraint.

All 8 agent-discretion research questions are resolved with concrete, internally-consistent proposals: the level curve `1 + ⌊(L−1)²/200⌋` hồn ngọc per level (identical across tiers), flat **+2/level** on the 6 battle stats, tier multipliers t0 1.0 / t1 1.1 / t2 1.25 / t3 1.5, EA FC-grounded chemistry (family+spouse 3pt > faction 2pt > role 1pt → S/A/B/C/D tiers → +10/+8/+6/+4/+2% buffs), class-based skill pools with rarity weights + LEA-driven support-effect trigger chances, D-19-compliant shop prices (heal 50💎, booster 100💎, formations 200-500💎) and boss drop weights (heal 70% / booster 25% / key4 4.9% / key5 0.1%), and concrete schema shapes (user_heroes tier + per-copy skill columns, new `user_hero_soulgems` per-hero pool, `sanguo_skills` catalog, `sanguo_items` price-currency model, `encounter_runs` level/skill columns, `user_legions` + `user_legion_slots`).

**One economy conflict found:** `docs/economy-budget.md`'s convertibility matrix lists "Linh thạch → evolution" (Phase 8-era wording), but CONTEXT D-01/D-06 lock evolution/leveling/re-roll as **hồn ngọc** sinks (never Linh thạch). The budget document needs a Phase 11 AMENDMENT (same pattern as the Phase 9/10 amendments) restating the Linh thạch sink set (shop + formation purchases only) — this makes D-19 compliance *stronger* (hồn ngọc is minted only from dupes, never from Linh thạch), but the doc must be re-signed before content ships.

**Primary recommendation:** Build in six waves — (1) schema migration 0020 (user_heroes tier + skills; sanguo_skills; user_hero_soulgems; sanguo_items price-currency; encounter_runs level/skills; user_legions/user_legion_slots; formations emoji) + content seed (skills, items, formations) + **economy-budget.md amendment (BLOCKING checkpoint:decision)**; (2) hồn ngọc service (convert/level/evolve/reroll — new `deductHonNgoc` primitive + FOR UPDATE single-writer) + copy-selector extension of `/sanguo hero`; (3) shop + bag services (wallet sinks, multi-currency, booster consumption) + boss drop service; (4) battleEngine legion extension (`runLegionBattle` — chemistry pre-baked, skills/MP, support effects) + boss fight/capture routing (random zone general, WINDOWS #5 close); (5) legion assembly command + `/sanguo heroes` filters (SC5); (6) UI: shop/bag/legion/convert/evolve/reroll embeds + customId routing (`sanguo:shop:*` `sanguo:bag:*` `sanguo:legion:*` `sanguo:convert:*` `sanguo:evolve:*` `sanguo:reroll:*`) + i18n + balance pass against seeded stat ranges.

## Project Constraints (from AGENTS.md)

| Directive | Enforcement Point |
|-----------|-------------------|
| Discord interactions via slash commands + message components only | All Phase 11 surfaces are embeds + buttons/selects (11-UI-SPEC approved) |
| Node.js 22 LTS target | **Discrepancy:** machine has Node **v26.3.0** — satisfies discord.js ≥22.12.0; do NOT pin/downgrade |
| TypeScript 5.8.x "không nâng TS 6.x" (STACK.md) | **Discrepancy:** `package.json` has **typescript 6.0.3** installed and compiles; plan with installed versions |
| ShardingManager from day 1 | Interaction handlers run per-shard; no new shard concerns |
| i18n zero-hardcoded strings (eslint-plugin-i18next + `npm run check-i18n`) | New `shop/bag/legion/convert/level/evolve/skills/reroll` sections in `sanguo` namespace, 3 locales, parity enforced |
| Linh thạch is the only currency; wallet discipline (D-03) | Shop + formation purchases MUST go through `wallet.deductBalance`; hồn ngọc is a SEPARATE account-bound per-hero resource, never a `users.balance` flow |
| Stack: Drizzle 0.45.2, pg-boss, ioredis, i18next, zod (STACK.md) | **Use installed versions** (verified `package.json` this session): discord.js 14.27.0, typescript 6.0.3, drizzle-orm 0.45.2, drizzle-kit 0.31.10, pg 8.23.0, ioredis 6.0.0, i18next 26.3.6, zod 4.4.3, pg-boss 12.27.0, vitest 4.1.10, pure-rand 8.4.2. **No new dependencies.** |
| GSD workflow enforcement (no direct repo edits outside GSD workflows) | Planner emits plans; executor uses `/gsd-execute-phase` |

**Stack version reality check:** no new npm packages are introduced by Phase 11 — every deliverable is seed content, schema, service, and UI code on the existing stack. The Phase 10 additions (pure-rand 8.4.2, drizzle schemas) carry verbatim.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Hồn ngọc is the ONLY progression currency — no XP. Every level costs hồn ngọc; evolution ALSO costs hồn ngọc. Evolution does NOT block leveling. Max level = 100.
- **D-02:** Hồn ngọc is PER-HERO (Pokemon Go candy-style) — converting a Tào Tháo duplicate yields Tào Tháo hồn ngọc, spendable only on Tào Tháo copies. Account-bound; NEVER converts to Linh thạch.
- **D-03:** Dupe → hồn ngọc value FLAT BY TIER: t0 = 1, t1 = 5, t2 = 10, t3 = 20. No per-dupe decay. No daily conversion cap.
- **D-04:** Conversion + leveling surface = copy selector in `/sanguo hero` (paged at 25, Discord select limit); convert/level/evolve/skill-re-roll act on the selected copy.
- **D-05:** Leveling is an explicit action; each level costs hồn ngọc on an accelerating cost curve; per-level cost IDENTICAL across t0/t1/t2/t3. Exact curve = researcher/agent.
- **D-06:** Evolution is an explicit evolve action. Conditions: level requirement (L20→t1, L50→t2) + hồn ngọc cost.
- **D-07:** Evolution changes: (1) base stats increase (Pokémon Go-style boost), (2) emoji to t1/t2 spritesheet variant, (3) dupe→hồn ngọc value (t1=5, t2=10). IVs stay capture-locked.
- **D-08:** Leveling raises the 6 battle stats with a FLAT per-level gain (extends `combatStat = base + IV` to `base + IV + levelGain`). Exact gain = agent.
- **D-09:** t3 gated by BOTH a level requirement (e.g., L80+) AND an event-item gate — unreachable in v3; schema models t3.
- **D-10:** `user_heroes` gains a tier/evolution column (t0/t1/t2/t3) — single source of truth for player evolution AND captured boss tier.
- **D-11:** v1 item catalog = 3 items: healing item, `capture_key` (shown not sold), booster ×2 on NEXT dupe conversion. All account-bound; none marketable.
- **D-12:** Booster = next-conversion 2× consumable, one charge, used BEFORE converting a dupe.
- **D-13:** Bag = new `/sanguo bag` subcommand with a "Dùng" button per item; healing targets active companion (or a copy via selector); booster applies at the conversion site; capture_key gates T4/T5 capture buttons.
- **D-14:** Boss thường drops = GUARANTEED item per boss win (≥1, rarity-weighted). Items only, never money.
- **D-15:** Item sourcing: healing + booster BOTH sold (Linh thạch, via `wallet.deductBalance`) AND dropped. Capture_key shown but locked (drop-only now; event items during events — never Linh thạch).
- **D-16:** Shop is multi-currency — tabs by currency (💎 Linh thạch / 🎁 Event). `sanguo_items` needs a price-currency model (currently only `base_price`). Linh thạch through `wallet.deductBalance`; event items through their own inventory/burn.
- **D-17:** Legion battle = 3 mains FIGHT + 9 support heroes BUFF ONLY. `battleEngine` extends from 1v1 to 3v1/3vN; `sanguo_battles` stores the full legion input snapshot.
- **D-18:** Support buffs are NOT just chemistry — supports field their OWN 2-slot skill loadouts; their SPECIAL skills can trigger in-battle support effects on a roll/chance (attack-boost turns, HP regen, MP regen). LEA/CHA feed these trigger chances.
- **D-19:** Chemistry quantified EA FC-style: links → points → tier → buff. family + spouse tier-1 strongest, faction mid, role weakest. Exact points/thresholds/buff% = agent.
- **D-20:** Strict class-match for slot contribution — wrong slot = zero contribution.
- **D-21:** Formations: free STARTER formation at onboarding + additional formations purchasable (Linh thạch from shop / event items) + boss drops. Buy/sell logic lands here.
- **D-22:** Team assembly = dedicated legion/formation command — pick formation, assign 3 mains + 9 support (class-matched), persisted as active legion.
- **D-23:** Legion battle applies to BOSS battles ONLY. Regular wild encounters stay SOLO.
- **D-24:** Boss = a real hero drawn from the zone pool, using t2 base stats + IV 100 for the FIGHT. A real `heroes` row exists → capturable (resolves WINDOWS.md #5 BOSS_CAPTURE_UNAVAILABLE).
- **D-25:** Boss battle entry = FORCED legion battle (3v1, no solo option). Win → guaranteed item drop + capture; loss → boss departs, travel resumes.
- **D-26:** Boss capture uses the SAME 5-tier capture-fee model (D-20 signed) with the rarity-5 (10%) base chance. NO new fee schedule → no re-sign required.
- **D-27:** Boss frequency = keep the existing ~5-10% boss sub-roll replacing a successful hero roll. No scheduled windows.
- **D-28:** The boss you FIGHT is t2 + IV100, but the CAPTURED hero is a RANDOM roll — random IV + random tier weighted t0 95% / t1 4.98% / t2 0.02%. `user_heroes.tier` stores the captured roll.
- **D-29:** Full 2-slot skill system ships: every hero has exactly 2 skill slots — normal + special. Normal attacks GENERATE MP; special attacks CONSUME MP. MP column already exists on `heroes`.
- **D-30:** Skills come from CLASS-BASED skill pools; encounter rolls skills randomly weighted by skill rarity.
- **D-31:** Skills roll AT ENCOUNTER SPAWN and CARRY TO CAPTURE; replayable battles include rolled skills in the `sanguo_battles.input` snapshot.
- **D-32:** Skills re-rollable with hồn ngọc (Pokemon Go TM-style), ONE slot at a time. Different copies can carry different rolls.
- **D-33:** Wild heroes spawn at RANDOM level: L1-10 = 60%, L11-20 = 30%, L21-30 = 9.9%, L31-50 = 0.1% ("30+" caps at L50). Exact roll mechanics = agent.
- **D-34:** The captured hero KEEPS the encounter level. Level is NOT reset on capture.
- **D-35:** The boss fights at FIXED level L50 (t2 evolution threshold) — t2 base + IV100 + L50.
- **D-36:** Boss capture result unaffected by the L50 fight — captured boss copy is a random roll (D-28) and the captured LEVEL is fixed **L20**.

### the agent's Discretion
- Exact accelerating level-cost curve numbers; flat stat gain per level; exact wild-level distribution roll mechanics (band roll then uniform-within-band).
- Exact chemistry point values, tier thresholds, buff % per tier.
- Exact skill pools, skill rarity weights, skill effect values; exact support-effect trigger chances from LEA/CHA.
- Boss item drop rarity weighting; shop price values (must comply with D-19 net-sink/neutral + ~416/hr gross bound).
- `user_heroes` evolution-tier column shape; `sanguo_items` price-currency schema; skill storage (per-copy columns vs `user_hero_skills` table); legion-input snapshot shape for the battle engine.
- Exact shop/bag/legion/convert embed layouts + customId naming (`sanguo:shop:*`, `sanguo:bag:*`, `sanguo:legion:*`, `sanguo:convert:*`, `sanguo:evolve:*`, `sanguo:reroll:*`).

### Deferred Ideas (OUT OF SCOPE)
- Boss server + PvP — post-v1; the legion 3+9 engine built here is the foundation for both.
- Capture tiers 4-5 event unlocks — schema/engine model all 5 tiers now; only the item gate sourcing (boss drops here, event items later) lands in Phase 11.
- `/profile` transaction history UI — ledger accumulates from Phase 8; visualization stays deferred.
- Skill content breadth — full class pools seed in Phase 11; hero-unique special skills / `tiers.json` forms (mecha/god/sexy) could expand later.
- Marketplace listing of sanguo items — Phase 12 TQC-20 gating; no item marketable this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md v3) | Research Support |
|----|----------------------------------|------------------|
| TQC-14 | Duplicate → hồn ngọc: tier-scaled, diminishing returns, daily conversion cap, account-bound (không convert Linh thạch) | Flat-by-tier D-03 (t0 1 / t1 5 / t2 10 / t3 20); per-hero pool storage (`user_hero_soulgems`); conversion tx guard (≥2 copies); **amended**: no daily cap, diminishing returns satisfied by the rarity curve (CONTEXT D-03) |
| TQC-15 | Evolution L20→t1 / L50→t2; t3 schema-gated (chờ event/item đặc biệt) | Tier column on `user_heroes` (D-10); evolution cost (hồn ngọc 20/50/100); tier stat multipliers t0 1.0 / t1 1.1 / t2 1.25 / t3 1.5; t3 = L80+ AND event-item gate (D-09) |
| TQC-16 | `/sanguo shop` + bag; boss thường drop items (never money); mọi sink qua `wallet.deductBalance` | Multi-currency price model on `sanguo_items` (D-16); heal 50💎 / booster 100💎 / formations 200-500💎 via wallet; capture_key locked (sale_state='locked'); boss drop weights 70/25/4.9/0.1%; D-19 amendment needed (evolution is hồn ngọc, not wallet) |
| TQC-17 | Legion battle 3+9 chemistry (buff hệ kiểu EA FC, bonus-only không penalty) mở rộng `battleEngine` | `runLegionBattle(seed, input)` extension; chemistry points 3/2/1 → tiers S/A/B/C/D → +10/+8/+6/+4/+2% (bonus-only, EA FC 0-chemistry grounding); strict class-match (D-20); support-skill effects (D-18) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hồn ngọc balance (convert/level/evolve/reroll) | API / Backend (service layer) | Database | Per-hero pool `user_hero_soulgems`; new `deductHonNgoc` WHERE-guard primitive mirroring `wallet.deductBalance`; FOR UPDATE single-writer txs (established pattern) |
| Level/evolution stat model (tier multipliers, levelGain) | API / Backend | — | Pure constants consumed by the battle formula + hero detail; base stats stay D-12 hidden |
| Chemistry computation (links → points → tier → buff %) | API / Backend (service layer) | Database | Pure function over legion slots + hero reference tables (faction/family/role/spouse); buffs baked into the engine input (replay snapshot) |
| Shop purchases + formation purchases (Linh thạch sinks) | API / Backend (wallet) | Database | `wallet.deductBalance` WHERE-guard + ledger in one tx (D-03); prices from server config, never customId |
| Boss item drops | API / Backend | Database | Guaranteed ≥1 item per boss win, rarity-weighted (D-14); `user_sanguo_items` upsert (quantity_positive check); items only, never money (D-19) |
| Boss battle (3v1 legion) + capture | API / Backend | — | `runLegionBattle` pure extension (D-17); boss = random zone general (D-24); capture reuses signed D-20 fees + rarity-5 base (D-26) |
| Skill system (roll at spawn, MP economy, support effects) | API / Backend | Database | `sanguo_skills` catalog; skills rolled at encounter spawn (crypto), carried via `encounter_runs` to `user_heroes` (D-31) |
| Legion assembly (formation pick, 3+9 assign) | API / Backend | Database | `user_legions` + `user_legion_slots`; ownership + class-match server-side validation (D-20/D-22) |
| Shop/bag/legion/progression UI (embeds + components) | Discord client surface | Database | Discord-native embed/button/select surface per 11-UI-SPEC (approved); customIds routed in `interactionCreate.ts` |
| Content (skills, items, formations, chemistry reference) | Database | — | Seed content via idempotent upsert (`seed-sanguo.ts` pattern); skill names = i18n keys (UI-SPEC), hero/zone/item names = DB per-locale columns |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | 14.27.0 (installed) | Embeds, buttons, selects, interaction routing | Existing; all Phase 11 surfaces are Discord-native per the approved 11-UI-SPEC |
| drizzle-orm + pg | 0.45.2 / 8.23.0 (installed) | Schema, migrations (drizzle-kit 0.31.10), `FOR UPDATE` single-writer | Established; migration 0020 via `drizzle-kit generate` + `npm run migrate` |
| i18next + i18next-fs-backend | 26.3.6 / 2.6.7 (installed) | `sanguo` namespace; new `shop/bag/legion/convert/level/evolve/skills/reroll` sections | Zero-hardcoded-string mandate; `npm run check-i18n` parity |
| pure-rand | 8.4.2 (installed, Phase 10) | Seeded PRNG for battle replay (legion extension) | D-06 replay contract; battle-internal ONLY (never player-facing) |
| zod | 4.4.3 (installed) | Runtime validation of customId payloads / parsed params | Existing project standard (V5) |
| vitest | 4.1.10 (installed) | Unit tests incl. deterministic RNG-injection (`src/**/__tests__/**/*.test.ts`) | Established; battle-engine replay + pure-function assertions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @discordjs/rest | 2.6.3 (installed) | Not needed in Phase 11 | Pull-based check-in (D-22 Phase 9) — no push, no REST DM |
| pg-boss | 12.27.0 (installed) | Not needed in Phase 11 | No cron; every Phase 11 action is interaction-driven (established pull model) |
| ioredis | 6.0.0 (installed) | No NEW Redis usage | Encounter cap ZSET already exists; Phase 11 adds no caching requirement |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-hero hồn ngọc pool (`user_hero_soulgems` table) | `hon_ngoc` column on `user_heroes` | Pool is per-(user, hero) — shared across copies (D-02 "spendable on Tào Tháo copies"); a column on the per-copy row would fragment the pool and force aggregation on every level/convert |
| Per-copy skill columns (`skill_normal_id`/`skill_special_id` on user_heroes) | `user_hero_skills` child table | Exactly 2 fixed slots (D-29) with copy-level identity (D-32); columns give TM-swap semantics with zero joins; a child table adds a unique-constraint dance for zero benefit |
| `user_legion_slots` child table | jsonb `assignments` on a one-row-per-user table | Child table keeps FK integrity on `userHeroId` + joins hero names for the legion embed; jsonb would force manual integrity |
| `runLegionBattle(seed, input)` alongside `runBattle` | Refactor `runBattle` into a generic N-v-N engine | Phase 10 tests pin `runBattle`'s 1v1 contract; a thin new entry keeps backward compat while the shared helpers (hit/crit/damage) stay DRY |

**Installation:** none — no new packages. Verify with `npm install` only if package-lock drifted.

**Version verification:** all libraries above verified this session against `package.json` (npm registry via package-legitimacy gate: pure-rand OK 65.5M/wk, drizzle-orm OK 18.2M/wk, no postinstall on either — see audit below).

## Package Legitimacy Audit

> Phase 11 introduces **no new external packages** — every deliverable is seed content, schema, service, or UI code on the existing installed stack. The gate ran on the stack's key packages to confirm the baseline stays clean.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pure-rand | npm | ~7 yrs (latest 2026-07-10) | 65,498,756/wk | github.com/dubzzz/pure-rand | OK | Approved (existing, Phase 10) |
| drizzle-orm | npm | ~7 yrs (latest 2026-03-27) | 18,171,638/wk | github.com/drizzle-team/drizzle-orm | OK | Approved (existing) |
| i18next | npm | mature | large | github.com/i18next/i18next | OK | Approved (existing) |
| ioredis | npm | mature | ~8M/wk | github.com/redis/ioredis | OK | Approved (existing) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**New packages proposed:** none — no install step in any plan task.

*All packages above are existing installed dependencies (`package.json` verified this session), not new additions. The Phase 11 skill/item/formation content is seed JSON + schema, not npm packages.*
## Architecture Patterns

### System Architecture Diagram

```
                        ┌────────────────────────────────────────────────────┐
                        │                    INTERACTION LAYER               │
                        │  interactionCreate.ts (customId prefix router)     │
                        │  sanguo:shop:*  sanguo:bag:*  sanguo:legion:*      │
                        │  sanguo:convert:*  sanguo:evolve:*  sanguo:reroll:*│
                        │  sanguo:hero:copy:*  sanguo:heroes:*  battle:*     │
                        └───────┬──────────────┬───────────────┬─────────────┘
                                │              │               │
        ┌───────────────────────▼───┐   ┌──────▼──────────┐   ┌▼───────────────┐
        │ /sanguo shop (D-16)        │   │ /sanguo bag     │   │ /sanguo hero   │
        │ tabs linh|event → buy      │   │ use (heal/      │   │ copy selector  │
        │ wallet.deductBalance       │   │ booster hint)   │   │ convert/level/ │
        └───────────┬───────────────┘   └──────┬───────────┘   │ evolve/reroll  │
                    │ price from config        │ consume       └───────┬────────┘
                    ▼                          ▼                        ▼
        ┌──────────────────────────────────────────────────────────────────────┐
        │                ECONOMY SERVICES (FOR UPDATE single-writer)           │
        │  shopBuy: wallet.deductBalance + user_sanguo_items upsert            │
        │  bagUse: heal (hp_current update) / booster consumed at convert site │
        │  convert: guard ≥2 copies → DELETE copy + user_hero_soulgems upsert  │
        │  level/evolve/reroll: deductHonNgoc WHERE-guard + tier/level/skills  │
        └───────────────────────────────┬──────────────────────────────────────┘
                                        │
        ┌───────────────────────────────▼──────────────────────────────────────┐
        │               ENCOUNTER SPAWN (travelCheckInService, D-30/D-33)      │
        │  wild level band roll (crypto) → encounter_runs.level                │
        │  skill roll from class pools (crypto, rarity-weighted) →             │
        │    encounter_runs.skill_normal_id / skill_special_id                 │
        │  boss sub-roll (D-27) → random zone general (D-24) → encounter_runs  │
        └───────────────────────────────┬──────────────────────────────────────┘
                                        ▼
        ┌──────────────────────────────────────────────────────────────────────┐
        │            battleCheckInService — boss routing (D-23/D-25)           │
        │  hero encounter → SOLO runBattle (Phase 10 engine, +level term)      │
        │  boss encounter → LEGION runLegionBattle(seed, input)                │
        │    input = { mains[3]: buffed snapshots + skills,                    │
        │              supports[9]: { class, lea, special },                   │
        │              boss: t2 base × IV{31×6} × L50 + skills }               │
        │  chemistry buffs PRE-BAKED into main stats (replay-faithful)         │
        └───────────────────────────────┬──────────────────────────────────────┘
                                        ▼
        ┌──────────────────────────────────────────────────────────────────────┐
        │        battleEngine.ts (PURE — runBattle 1v1 + runLegionBattle)      │
        │  MOV desc → AGI → player-first order; dmg = max(atk−def,1); crit ×2  │
        │  MP: normal +12 / special −cost (fallback to normal if insufficient) │
        │  support effects: per-round trigger roll (seeded rng) < chance(lea)  │
        │  round cap 20 → winner by total damage, tie → remaining HP%          │
        └───────────────────────────────┬──────────────────────────────────────┘
                                        ▼
        ┌──────────────────────────────────────────────────────────────────────┐
        │  sanguo_battles row (seed + full legion input jsonb + logs + result) │
        │  BOSS WIN → guaranteed item drop (D-14, crypto-weighted) + capture   │
        │  BOSS LOSS → boss departs, travel resumes (D-25)                     │
        │  CAPTURE (D-28/D-36): rarity-5 10% base, same 5-tier fees; success → │
        │    random IV + random tier t0 95/4.98/0.02 + fixed L20 + rolled      │
        │    skills → user_heroes insert (tier column = captured roll)         │
        └──────────────────────────────────────────────────────────────────────┘
```

Data flow for the primary use case: player builds a legion (`/sanguo legion` → `user_legions`) → travels (`/sanguo travel`) → check-in rolls a boss sub-roll → encounter_runs records the zone general + its L50 fight level + rolled skills → boss battle entry forces the legion (`runLegionBattle`) → win → guaranteed item drop + capture view (same D-20 fees) → capture success inserts the RANDOM-tier/RANDOM-IV/L20 copy → `/sanguo heroes` shows it with faction/zone/IV-grade filters → converting dupes feeds the per-hero hồn ngọc pool → level/evolve/reroll spend it. Every player-facing roll is crypto; pure-rand exists ONLY inside the seeded battle.

### Recommended Project Structure (new files)

```
src/
├── services/sanguo/
│   ├── soulgemService.ts          # convert/level/evolve/reroll — FOR UPDATE + deductHonNgoc (TQC-14/15)
│   ├── chemistryService.ts        # pure: legion slots + reference tables → per-main tier + buff% (D-19)
│   ├── shopService.ts             # multi-currency buy (wallet), item grants (TQC-16)
│   ├── bagService.ts              # bag listing + heal/booster use (D-13)
│   ├── dropService.ts             # boss guaranteed item drop, rarity-weighted (D-14)
│   ├── legionService.ts           # formation pick + 3+9 assign + class-match validation (D-20/D-22)
│   ├── skillService.ts            # class-pool skill roll at spawn (crypto, D-30/D-31)
│   ├── encounterLevelService.ts   # wild band roll → uniform-within-band (D-33)
│   ├── battleEngine.ts            # EXTEND: +level term, +runLegionBattle, MP/skills/support effects
│   ├── battleCheckInService.ts    # EXTEND: boss → legion routing (D-23/D-25), skills in snapshot (D-31)
│   ├── captureService.ts          # EXTEND: boss capture roll (D-28), tier/skills/level on insert
│   └── __tests__/                 # soulgem/chemistry/shop/drop/legion/level/engine tests
├── commands/sanguo/
│   ├── shop.ts                    # /sanguo shop (multi-currency tabs) + buy handlers
│   ├── bag.ts                     # /sanguo bag + use handlers
│   ├── legion.ts                  # /sanguo legion + assembly handlers
│   ├── hero.ts                    # EXTEND: copy selector + convert/level/evolve/reroll actions
│   └── heroes.ts                  # EXTEND: faction/zone/IV-grade filters (SC5)
├── ui/embeds/                     # shop, bag, legion, progression-result, boss-encounter; extend hero/heroes/battle-log/capture
├── ui/components/                 # 16 new component builders per 11-UI-SPEC §New Files & Extensions
├── constants/
│   ├── sanguoProgression.ts       # level curve, evolution costs, tier multipliers, reroll cost
│   ├── sanguoChemistry.ts         # link points, tier thresholds, buff % (HIDDEN — D-19 never renders)
│   └── sanguoBoss.ts              # REPLACED: zone-general redesign (D-24) supersedes BOSS_TEMPLATES
└── db/schema/
    ├── sanguoSkills.ts            # NEW skill catalog (mechanics; names = i18n keys)
    ├── userHeroSoulgems.ts        # NEW per-hero hồn ngọc pool
    ├── userLegions.ts             # NEW active-legion state + slots
    └── (userHeroes/sanguoItems/encounterRuns/formations — EXTEND)
```

### Pattern 1: Level/Evolution/Skill Numeric Tables (the balance contract)

**What:** all Phase 11 progression numbers live in ONE hidden constants module (`sanguoProgression.ts`) consumed by services, never rendered (D-12). The balance pass (in-plan, mirroring Phase 10 A9→10-04) sanitizes them against the seeded stat ranges.

**Proposal (agent discretion, D-05/D-08/D-09/D-32):**

| Constant | Value | Notes |
|----------|-------|-------|
| `LEVEL_COST(level)` = `1 + Math.floor((level-1)**2 / 200)` | level 1..99 | Identical across tiers (D-05); L1→21 ≈ 27 hồn ngọc, L1→51 ≈ 264, L1→100 ≈ 1741 — L20 a grind, L50 endgame, L100 aspirational |
| `STAT_GAIN_PER_LEVEL` | `2` (each of the 6 stats) | `combatStat = base + IV + (level−1)×2`; HP/MP stay base-only (D-05) |
| Tier multipliers (base stats) | t0 `1.0`, t1 `1.1`, t2 `1.25`, t3 `1.5` | Applied to all 8 base stats (D-07 "Pokémon Go-style boost") |
| Evolution hồn ngọc costs | t0→t1 `20`, t1→t2 `50`, t2→t3 `100` | Gated: t1 needs L20, t2 needs L50, t3 needs L80+ AND event item (D-09) |
| Skill re-roll cost | `10` hồn ngọc per slot | D-32; one slot at a time |
| Boss fight stats | t2 multiplier × IV all-31 × L50 | D-24/D-35; the wall requires EVOLVED mains near L50+ (see Pitfall 5) |

### Pattern 2: Chemistry Points → Tier → Buff (EA FC-grounded)

**What:** per-main link points from the 9 supports → tier → multiplicative buff on the main's 6 combat stats. Bonus-only (0 links = no buff, no penalty — EA FC 0-chemistry grounding verified via Tavily). Chemistry tier + link COUNT render; points and % never render (UI-SPEC D-19 contract).

**Proposal (agent discretion, D-19):**

| Link type | Points per link | Source |
|-----------|-----------------|--------|
| family (exact `family_id`) | 3 | `heroes.family_id` FK — bloodline match (STATE.md:84) |
| spouse (`hero_relations` type='spouse') | 3 | `heroRelations.ts:12` — tier-1, equal to family |
| faction (exact `faction_id`) | 2 | flat faction match (STATE.md:77) |
| role | 1 | weakest (Phase 8 lock) |

| Tier | Main point sum | Buff (× combatStat) |
|------|----------------|---------------------|
| S | ≥ 12 | +10% |
| A | 8–11 | +8% |
| B | 5–7 | +6% |
| C | 3–4 | +4% |
| D | 1–2 | +2% |
| — | 0 | none (no tier line; bonus-only) |

Links form **main↔support pairs only** (3×9 = 27 per main; supports never link to each other — they buff, not fight, D-17). Buff applies **multiplicatively to the final combatStat** (`(base + IV + levelGain) × (1 + buff%)`) so chemistry scales with level — the depth the phase adds. Strict class-match (D-20): a hero placed in a wrong-class slot contributes NO chemistry and NO support effect (server-side validation in `legionService`).

### Pattern 3: Skills + MP + Support Effects

**What:** 2-slot skills (normal + special) rolled at encounter spawn from class-based pools, rarity-weighted (crypto); normal attacks generate MP, specials consume it (D-29, grounded in the Sea of Stars / classic RPG MP loop); supports' specials trigger in-battle buff effects on a LEA-driven chance (D-18).

**Proposal (agent discretion, D-30/D-31/D-18):**

| Constant | Value |
|----------|-------|
| Skill rarity weights — normal pool | common 80% / rare 20% |
| Skill rarity weights — special pool | common 60% / rare 30% / epic 10% |
| MP gain per normal hit | +12 |
| Special MP costs | 15 (common) / 25 (rare) / 40 (epic) |
| MP start per battle | base mp (`heroes.mp`, base-only per D-05) |
| Support trigger chance | `clamp(0.15 × (1 + (lea − 10) × 0.02), 0.05, 0.35)` — LEA drives friendly-buff rate (Phase 8 stat definition); lea 10 → 15%, lea 40 → 24%, lea 60 → 30% |
| Support effect values | attack_up: +20% atk 1 turn on one random main · hp_regen: heal 15% of main max HP · mp_regen: +10 MP |

Skill effect types: `damage` (special attack, multiplier on the class stat pair), `attack_up`, `hp_regen`, `mp_regen` (support-only, the UI-SPEC trio). CHA is reserved for enemy-effect/debuff subsystems (boss server / PvP — deferred); it has no v3 engine use (consistent with Phase 10's "LEA/CHA unused", now LEA gains its first use).

### Pattern 4: Boss Redesign — Random Zone General (closes WINDOWS.md #5)

**What:** the boss encounter becomes a REAL hero from the zone pool (like a normal encounter) whose fight stats are t2 × IV{31×6} × L50 — superseding the `BOSS_TEMPLATES` zone-scaled template approach (D-24). `encounter_runs.hero_id` is no longer NULL for bosses → a real `heroes` row exists → the Phase 10 `BOSS_CAPTURE_UNAVAILABLE` guard (captureService.ts:150) is removed. Fight difficulty ≠ prize: the CAPTURED copy is a fresh roll (random IV, tier t0 95% / t1 4.98% / t2 0.02%, fixed L20 — D-28/D-36), stored via the new `user_heroes.tier` column (D-10).

**Capture math (D-26):** same `CAPTURE_TIERS` 5/15/40/100/250💎 × multipliers 1.0/1.5/2.0/3.0/5.0, rarity-5 base 10%, flee 75%, pity capped 0.60 (sanguoCapture.ts:43-49,87-93 — all read verbatim this session). No new fee schedule → no D-18 re-sign. The captured tier roll rides `cryptoUniform()`; the hidden t0/t1/t2 weights NEVER render (D-28, UI-SPEC).

### Pattern 5: Hồn ngọc Single-Writer Transactions (new primitive)

**What:** every hồn ngọc mutation (convert / level / evolve / reroll) runs in ONE FOR UPDATE tx that locks the user's own rows (`user_hero_soulgems` pool row + the target `user_heroes` copy + `user_sanguo_state`), with a new `deductHonNgoc(tx, userId, heroId, amount)` helper mirroring `wallet.deductBalance`'s WHERE-guard + rowCount pattern (throws `INSUFFICIENT_HON_NGOC` on zero rows). The booster (D-12) is consumed (quantity 1, `user_sanguo_items`) in the SAME tx as the conversion it doubles — atomicity prevents booster cloning. Conversion additionally guards ≥2 owned copies of the hero (the copy being consumed must be a true dupe).

**Convert flow (D-03/D-04/D-12):** copy selector press → tx: lock pool + copy rows → verify ≥2 copies → DELETE the selected `user_heroes` row → read booster ownership (`user_sanguo_items` quantity ≥1, `boost_x2`) → `amount = TIER_VALUE[tier] × (booster ? 2 : 1)` → upsert `user_hero_soulgems.amount += amount` → if booster consumed, decrement/delete its inventory row → SUCCESS embed (yield visible; booster hint visible).

### Anti-Patterns to Avoid
- **Re-rolling battle-side state per press:** level/evolve/convert must NEVER re-roll anything (deterministic values; only the boss capture roll and spawn rolls are crypto) — the FOR UPDATE tx re-fetches the latest rows instead.
- **Putting prices/costs in customIds:** `sanguo:shop:buy:{itemCode}` carries the item code ONLY; price resolves server-side from `sanguo_items`/formations config inside the tx (UI-SPEC anti-tamper contract, Phase 10 Pitfall 3 carry).
- **Converting the last copy / the active companion:** conversion guard requires ≥2 copies; converting the ACTIVE companion copy should be blocked or auto-switch the companion (a deleted activeHeroId breaks `NO_ACTIVE_HERO` in battleCheckInService.ts:131).
- **Baking chemistry into the engine as a live DB read:** the engine is PURE (D-06) — chemistry must be pre-computed and baked into the snapshot, never read inside `runLegionBattle`.
- **Extending `runBattle`'s signature destructively:** Phase 10 tests pin `runBattle(seed, player, enemy)`; add the OPTIONAL `level` field (default 1 → levelGain 0 → existing tests unchanged) and add `runLegionBattle` alongside.
- **Rendering hidden numbers:** chemistry points/buff%, boss capture weights (D-28), skill rarity weights (D-30), wild-level distribution % (D-33), base stats, tier multipliers — the 11-UI-SPEC never-render list extends the Phase 10 D-12 contract.
- **Evolution via wallet:** evolution/level/reroll are HỒN NGỌC sinks (D-01/D-06) — routing them through `wallet.deductBalance` would both violate D-02's account-bound rule and contradict the CONTEXT; the economy-budget.md amendment must restate this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seeded PRNG for legion battle replay | Your own PRNG / Math.random | `pure-rand` 8.4.2 (existing) | Deterministic replay contract D-06; xoroshiro128plus threaded through `runLegionBattle` |
| Player-facing random rolls | Anything custom | `crypto.randomInt` via `cryptoUniform()` (encounterService.ts:57-59) | CSPRNG mandate; ASVS V6; spawn level/skill rolls + boss capture roll |
| Linh thạch sink deduction | Direct `UPDATE users SET balance` | `wallet.deductBalance(tx, …)` (wallet.ts:47-82) | WHERE-guard + ledger row in one tx (D-03, SC1 reconcilability) |
| Hồn ngọc pool deduction | Reimplemented balance logic per site | New `deductHonNgoc(tx, …)` mirroring wallet | One WHERE-guarded primitive for convert/level/evolve/reroll; `INSUFFICIENT_HON_NGOC` convention |
| Migrations | Hand-written SQL | `drizzle-kit generate` + `npm run migrate` | Established (migrations 0000–0019 exist; Phase 11 = 0020+) |
| i18n | Hardcoded strings | i18next `sanguo` namespace + `check-i18n` | Zero-hardcoded mandate; parity across VI/EN/ZH-CN; skill names are i18n keys (UI-SPEC) |
| Hero emoji (tier-aware) | Manual `<:name:id>` | `heroEmoji(heroId, tier, star)` (sanguoEmojis.ts:1230) | Animated `<a:name:id>` per tier variant — evolution emoji swap (D-07) renders via the tier suffix |
| Item/skill/formation emojis | Theme constants | Content-driven emoji columns in seed tables (UI-SPEC) | Per-item/per-skill/per-formation emoji — never theme constants |
| Capture fee / boss capture | New fee schedule | `CAPTURE_TIERS` + `CAPTURE_BASE_BY_RARITY` (sanguoCapture.ts:43-62) | D-26 reuses the signed D-20 contract — no re-sign |
| Legion embed joins | jsonb denormalization | `user_legion_slots` child table + join | FK integrity + per-locale hero names via heroes join |
| Battle replay log rendering | Fields-per-round | Single embed description, ≤20 rounds (UI-SPEC ≤ ~2,000 chars) | ≤25-field cap; description ≤4,096 |

**Key insight:** every "randomness + money + state" primitive in this phase already exists in-repo (crypto RNG, wallet, FOR UPDATE single-writer, F2 re-fetch, heroEmoji tier-aware, theme, i18n). The genuinely new code is (1) the pure `runLegionBattle` extension, (2) the `deductHonNgoc` pool primitive, (3) the pure chemistry/level/skill math — all pure functions worth writing from scratch, mirroring the Phase 10 engine discipline.

## Common Pitfalls

### Pitfall 1: Hồn ngọc double-spend / concurrent level presses
**What goes wrong:** two presses of the level button both deduct the pool and both level up.
**Why it happens:** no row lock on the pool; deduction without a WHERE-guard.
**How to avoid:** every hồn ngọc mutation runs in ONE FOR UPDATE tx; `deductHonNgoc` uses `UPDATE … WHERE amount >= cost` + rowCount (mirrors wallet.ts:53-62); the level column write shares the tx (rollback on zero rows). Regression test: concurrent level calls → exactly one succeeds, second throws `INSUFFICIENT_HON_NGOC`.

### Pitfall 2: Booster cloning (double 2× yield)
**What goes wrong:** the ×2 booster applies to more than one conversion.
**Why it happens:** booster decrement and conversion yield in separate txs / reads.
**How to avoid:** booster consumption + yield computation in the SAME conversion tx (FOR UPDATE on `user_sanguo_items` row; decrement with quantity ≥1 guard; delete row at 0 — quantity_positive check at userSanguoItems.ts:20).

### Pitfall 3: Converting the active companion / last copy → orphaned state
**What goes wrong:** deleting the active `user_heroes` copy leaves `user_sanguo_state.activeHeroId` dangling → `NO_ACTIVE_HERO` (battleCheckInService.ts:131) on the next battle.
**Why it happens:** conversion only guards ≥2 copies, not the companion identity.
**How to avoid:** in the convert tx, if the selected copy is the active companion, either block (`convert.insufficient`) or auto-switch the companion to the earliest remaining copy; regression test on `handleCompanionPress` + battle entry after conversion.

### Pitfall 4: Chemistry/level balance drift vs the seeded stat ranges
**What goes wrong:** the proposed tier multipliers / +2-per-level / boss t2×IV100×L50 produce an unwinnable boss wall or a trivial one (damage = max(atk−def,1) floors hard when the boss's stats exceed the mains').
**Why it happens:** D-05's mirrored stat pairs make any uniformly-stronger opponent near-unbeatable without enough level/evolution/chemistry edge.
**How to avoid:** the in-plan balance pass (mirroring Phase 10 A9→10-04) simulates the seeded stat ranges (scripts/data/sanguo-base-stats.json: 6 stats in the 10-90 band, HP 50-300) at representative legion levels (L50/L60/L70 × t0/t1/t2 mains × chemistry tiers) and tunes the constants before content ships. The structure (constants module, pre-baked buffs) is locked; the numbers are the balance task's.

### Pitfall 5: D-12/UI-SPEC hidden-mechanics leakage
**What goes wrong:** chemistry points/buff%, boss capture weights, skill rarity weights, wild-level percentages, base stats, or tier multipliers reach an embed.
**Why it happens:** convenience rendering of the same objects the engine uses.
**How to avoid:** the 11-UI-SPEC never-render list is explicit; embed data interfaces carry ONLY the visible fields (tier label + link count, rolled level, stars/grade, MP cost, hồn ngọc costs); eslint/peer-review gate; skill names render via i18n keys with MP cost only.

### Pitfall 6: Replay contract break in the legion snapshot
**What goes wrong:** `sanguo_battles.input` doesn't carry the full legion state (buffed stats, rolled skills, MP, support loadouts) → replay diverges.
**Why it happens:** chemistry applied at render/engine time instead of pre-baked; skills omitted from the snapshot.
**How to avoid:** `runLegionBattle(seed, input)` snapshot = { mains[3] (buffed combatStats + level + skillIds), supports[9] (heroId/class/lea/special), boss (t2 stats + IV + L50 + skillIds) } — exactly the values passed to the engine; replay test deep-equals roundLogs (Phase 10 Test 8 pattern).

### Pitfall 7: Boss capture regression (WINDOWS.md #5 left open)
**What goes wrong:** the `BOSS_CAPTURE_UNAVAILABLE` guard (captureService.ts:150) still blocks boss capture, or the boss battle still routes through `BOSS_TEMPLATES`.
**Why it happens:** the D-24 redesign is a one-way supersession — the old template path and the old guard must be REMOVED (not dormant), like the Phase 10 ack→battle inversion (Pitfall 7 carry).
**How to avoid:** remove the guard + `bossTemplateFor()` usage; boss input builder reads the zone general's real `heroes` row (t2×IV100×L50); encounter_runs.hero_id non-null for bosses; regression test on capture success granting a user_heroes row with the captured tier/level/skills.

### Pitfall 8: Shop/formation price drift vs the economy amendment
**What goes wrong:** prices or drop weights change after the economy-budget.md amendment → D-19 drift (Phase 12 audit baseline broken).
**Why it happens:** prices embedded in UI or duplicated constants.
**How to avoid:** prices are SEED data (`sanguo_items` price columns, `formations.base_price`) — single source; the amendment documents the exact values; the D-19 compliance verification in the plan recomputes `E[net/hour] ≤ 0` + gross < ~416/hr with the actual numbers (economy-budget.md:104 method).
## Code Examples

Verified patterns from the existing codebase (read this session) + the external grounding. All balance constants below are PROPOSALS (agent discretion) — the in-plan balance pass sanitizes them.

### Common Operation 1: CombatantInput extension (level term, D-08) — non-breaking

```typescript
// src/services/sanguo/battleEngine.ts — EXTEND (existing shape verified this session, lines 39-71)
export interface CombatantInput {
  heroId: string;
  base: { str: number; agi: number; int: number; mov: number; lea: number; cha: number; hp: number; mp: number };
  iv: { str: number; agi: number; int: number; mov: number; lea: number; cha: number };
  hpCurrent: number;
  class: 'vanguard' | 'cavalry' | 'archer' | 'spellcaster' | 'schemer' | 'vu_co' | 'thu_binh' | 'cong_binh';
  isPlayer: boolean;
  /** Phase 11 (D-08): optional level — absent → levelGain 0 → Phase 10 behavior unchanged. */
  level?: number;
}

/** D-08: combatStat = base + IV + levelGain; levelGain = (level−1) × STAT_GAIN_PER_LEVEL. */
export const STAT_GAIN_PER_LEVEL = 2 as const;
function eff(c: CombatantInput, key: 'str' | 'agi' | 'int' | 'mov' | 'lea' | 'cha'): number {
  const levelGain = ((c.level ?? 1) - 1) * STAT_GAIN_PER_LEVEL;
  return c.base[key] + c.iv[key] + levelGain; // D-05 + D-08
}
```

### Common Operation 2: Hồn ngọc pool deduction (new primitive mirroring wallet)

```typescript
// src/services/sanguo/soulgemService.ts — NEW (pattern: src/services/wallet.ts:47-82, verified this session)
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** WHERE-guarded per-hero pool deduction — mirrors wallet.deductBalance's rowCount guard.
 * Throws Error('INSUFFICIENT_HON_NGOC') on zero rows (whole tx rolls back). */
export async function deductHonNgoc(tx: Tx, userId: number, heroDbId: number, amount: number): Promise<void> {
  const rows = await tx
    .update(userHeroSoulgems)
    .set({ amount: sql`${userHeroSoulgems.amount} - ${amount}` })
    .where(and(
      eq(userHeroSoulgems.userId, userId),
      eq(userHeroSoulgems.heroId, heroDbId),
      sql`${userHeroSoulgems.amount} >= ${amount}`,
    ))
    .returning({ amount: userHeroSoulgems.amount });
  if (rows.length === 0) throw new Error('INSUFFICIENT_HON_NGOC');
}

/** Level up (D-05) — single-writer tx: lock copy + pool, charge, level++. */
const cost = LEVEL_COST(currentLevel); // 1 + Math.floor((level-1)**2 / 200)
// inside db.transaction: FOR UPDATE on the user_heroes copy + user_hero_soulgems row,
// then deductHonNgoc(tx, ...) + UPDATE user_heroes SET level = level + 1
```

### Common Operation 3: Wild level band roll (D-33) + skill roll at spawn (D-30)

```typescript
// src/services/sanguo/encounterLevelService.ts — NEW pure module (analog: encounterService.ts)
import crypto from 'node:crypto';

/** D-33: band roll (crypto.randomInt(1000) for 0.1% precision) then uniform-within-band.
 * L1-10 = 60%, L11-20 = 30%, L21-30 = 9.9%, L31-50 = 0.1% (the "30+" band caps at L50). */
export function rollWildLevel(rng: () => number = cryptoUniform): number {
  const band = Math.floor(rng() * 1000); // 0..999
  if (band < 600) return crypto.randomInt(1, 11);       // L1-10
  if (band < 900) return crypto.randomInt(11, 21);      // L11-20
  if (band < 999) return crypto.randomInt(21, 31);      // L21-30
  return crypto.randomInt(31, 51);                       // L31-50 (band "30+" capped at L50)
}
// Written to encounter_runs.level at spawn (D-31/D-34); battle reads it, capture copies it.

/** D-30: class-pool skill roll — weighted pick over the class's special pool.
 * Rarity weights: special common 60 / rare 30 / epic 10 (agent discretion). */
export function rollSpecialSkill(classPool: SanguoSkill[], rng: () => number = cryptoUniform): SanguoSkill {
  const total = classPool.reduce((s, sk) => s + RARITY_WEIGHT[sk.rarity], 0);
  let roll = rng() * total;
  for (const sk of classPool) if ((roll -= RARITY_WEIGHT[sk.rarity]) <= 0) return sk;
  return classPool.at(-1)!;
}
```

### Common Operation 4: Chemistry computation (pure, pre-baked into the engine input)

```typescript
// src/services/sanguo/chemistryService.ts — NEW pure module (D-19)
export const CHEMISTRY_POINTS = { family: 3, spouse: 3, faction: 2, role: 1 } as const; // hidden (D-12)
export const CHEMISTRY_TIERS = [
  { min: 12, label: 'S', buff: 0.10 }, { min: 8, label: 'A', buff: 0.08 },
  { min: 5, label: 'B', buff: 0.06 },  { min: 3, label: 'C', buff: 0.04 },
  { min: 1, label: 'D', buff: 0.02 },  { min: 0, label: null, buff: 0 }, // bonus-only
] as const;

/** Points from ONE main's links to its 9 supports (main↔support pairs only, D-17). */
export function mainChemistryPoints(main: { factionId: number; role: string; familyId: number | null },
  supports: Array<{ factionId: number; role: string; familyId: number | null; spouseOfMain: boolean }>): number {
  return supports.reduce((sum, s) => {
    if (s.spouseOfMain || (main.familyId !== null && s.familyId === main.familyId)) return sum + 3; // family+spouse tier-1
    if (s.factionId === main.factionId) return sum + 2;                                            // faction mid
    if (s.role === main.role) return sum + 1;                                                       // role weakest
    return sum;
  }, 0);
}
// Buff applied pre-engine: effectiveStat = (base + IV + levelGain) × (1 + buff) — baked into
// the mains' CombatantInput so sanguo_battles.input snapshots stay replay-faithful (D-06/D-31).
```

### Common Operation 5: Support-effect trigger chance (D-18, LEA-driven)

```typescript
/** Phase 8 stat definition: LEA = ↑ tỉ lệ buff. Chance = base × LEA scaling, clamped. */
export function supportTriggerChance(lea: number): number {
  return Math.min(0.35, Math.max(0.05, 0.15 * (1 + (lea - 10) * 0.02)));
}
// In runLegionBattle: each round, per support, `uniformFloat64(rng) < supportTriggerChance(lea)`
// → apply the support's special effect to one main (attack_up / hp_regen / mp_regen).
// Seeded rng ONLY — the engine stays pure; crypto touches only spawn/capture rolls.
```

### Common Operation 6: Boss capture roll (D-28/D-36)

```typescript
// src/services/sanguo/captureService.ts — EXTEND the success branch (existing insert verified,
// lines 218-234). Boss capture: same fees, rarity-5 10% base (D-26); the CAPTURED copy is a
// fresh roll — random IV, random tier t0 95% / t1 4.98% / t2 0.02%, fixed level 20.
if (success && encounter.encounterType === 'boss') {
  const tierRoll = cryptoUniform();
  const capturedTier = tierRoll < 0.95 ? 0 : tierRoll < 0.9998 ? 1 : 2; // t0 95 / t1 4.98 / t2 0.02
  const capturedLevel = 20; // D-36 fixed — never the L50 fight level
  // insert user_heroes: iv = 6× crypto.randomInt(0,32), tier = capturedTier,
  // level = capturedLevel, skillNormalId/skillSpecialId from encounter_runs (D-31)
}
```

### Common Operation 7: Shop buy via wallet (TQC-16, D-16)

```typescript
// src/services/sanguo/shopService.ts — NEW. Price NEVER rides the customId
// ('sanguo:shop:buy:{itemCode}' carries only the code — UI-SPEC anti-tamper).
export async function buyItem(userId: number, itemCode: string): Promise<{ name: string; qty: number; price: bigint }> {
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(sanguoItems).where(eq(sanguoItems.code, itemCode)).limit(1);
    if (!item || item.saleState !== 'sold') throw new Error('ITEM_NOT_FOR_SALE'); // capture_key locked (D-15)
    const price = item.priceLinh; // Linh thạch path; event path (price_event) is Phase 12+ content
    await deductBalance(tx, userId, price, { reason: 'sanguo_shop_' + itemCode, metadata: { itemId: item.id } });
    await tx.insert(userSanguoItems).values({ userId, itemId: item.id, quantity: 1 })
      .onConflictDoUpdate({ target: [userSanguoItems.userId, userSanguoItems.itemId],
        set: { quantity: sql`${userSanguoItems.quantity} + 1` } });
    return { name: item.nameVi, qty: 1, price }; // display name per-locale at the UI layer
  });
}
```

### Common Operation 8: Idempotent content seed (skills/items/formations)

```typescript
// scripts/seed-sanguo.ts — EXTEND (existing upsert pattern verified, lines 352-368:
// onConflictDoUpdate keyed on natural keys + clobber-safe spreads). New datasets:
// scripts/data/sanguo-skills.json    { skillId, class, slot, rarity, mpCost, mpGain,
//                                      effectType, effectValue, triggerChance, emoji }
// scripts/data/sanguo-items.json     replaces SANGUO_ITEMS placeholder (seed-sanguo.ts:312-337)
// scripts/data/sanguo-formations.json { code, name*, slotCount, basePrice, emoji, slots[] }
// All three REQUIRED datasets (FATAL on missing — mirror sanguo-base-stats.json, seed-sanguo.ts:228-236).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static level 1 heroes (D-19 Phase 10) | hồn ngọc-only progression, max L100, accelerating cost curve | Phase 11 (D-01) | The D-05 formula gains a level term; every battle input carries a level |
| `combatStat = base + IV` (D-05) | `base + IV + (level−1)×2` + tier multipliers t0 1.0 / t1 1.1 / t2 1.25 / t3 1.5 | Phase 11 (D-07/D-08) | Level + evolution become the progression power curve |
| Boss = `BOSS_TEMPLATES` zone-scaled template (sanguoBoss.ts), not capturable | Boss = random zone general, t2×IV100×L50, forced 3v1 legion, capturable with random-tier prize | Phase 11 (D-24..D-28), closes WINDOWS.md #5 | `encounter_runs.hero_id` non-null for bosses; `BOSS_CAPTURE_UNAVAILABLE` guard removed; fight difficulty ≠ prize |
| Solo battle engine (runBattle 1v1) | `runLegionBattle(seed, input)` — 3 mains + 9 supports vs 1 boss, MP economy, support effects | Phase 11 (D-17/D-29) | Same pure-rand replay contract; foundation for boss server + PvP (deferred) |
| MP column unused (Phase 10) | 2-slot skills + MP: normal +MP / special −MP, rolled from class pools at spawn | Phase 11 (D-29..D-32) | Encounter → battle → capture data flow carries skills; `sanguo_battles.input` snapshot extended |
| LEA/CHA unused in combat (Phase 10) | LEA drives support-effect trigger chances | Phase 11 (D-18) | First combat use of the Phase 8 stat definitions; CHA reserved for enemy effects |
| `sanguo_items.base_price` only | Multi-currency price model (linh/event) + sale_state + drop_weight | Phase 11 (D-16) | Shop tabs by currency; capture_key locked-but-shown; boss drop weighting |
| EA FC-style chemistry unspecified | Points 3/2/1 (family+spouse > faction > role) → tiers S/A/B/C/D → +10/+8/+6/+4/+2% (bonus-only) | Phase 11 (D-19), grounded in EA FC 24-26 (verified via Tavily) | Bonus-only with no penalty matches EA FC's 0-chemistry = base-stats model |

**Deprecated/outdated:**
- `src/constants/sanguoBoss.ts` `BOSS_TEMPLATES` + `bossTemplateFor()`: superseded by the random-zone-general redesign (D-24) — remove the module or repurpose to a constants stub.
- `captureService.ts:150` `BOSS_CAPTURE_UNAVAILABLE` guard: removed once boss encounters carry a real heroId.
- `docs/economy-budget.md` convertibility row "Linh thạch → evolution": superseded by D-01/D-06 (evolution = hồn ngọc) — the Phase 11 amendment restates the Linh thạch sink set.
- `scripts/seed-sanguo.ts` placeholder `SANGUO_ITEMS` (heal_pill 10 / xian_tea 25 / qinglong_dan 120): replaced by the D-11 catalog (heal_pill, booster_x2, capture_key) + drop weights + emoji.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Level curve `1 + ⌊(L−1)²/200⌋` hồn ngọc per level (L1→21 ≈ 27, L1→51 ≈ 264, L1→100 ≈ 1741); evolution 20/50/100; reroll 10 | Pattern 1 | Pure balance knob — if the curve feels too steep/flat, only the constants change (no schema/engine impact) |
| A2 | `STAT_GAIN_PER_LEVEL = 2`; tier multipliers t0 1.0 / t1 1.1 / t2 1.25 / t3 1.5 | Pattern 1 | The boss-wall math (Pitfall 4) depends on these — the balance pass must verify the L50/L60/L70 legion vs boss outcome over the seeded stat ranges |
| A3 | Chemistry: family+spouse 3pt / faction 2pt / role 1pt; S≥12→+10%, A 8-11→+8%, B 5-7→+6%, C 3-4→+4%, D 1-2→+2%; main↔support pairs only; multiplicative buff | Pattern 2 | The chemistry balance contract (D-19) — if the user wants different values, only `sanguoChemistry.ts` constants change; the tier label set S/A/B/C/D is UI-SPEC-locked |
| A4 | Skill rarity weights normal 80/20, special 60/30/10; MP +12/hit, costs 15/25/40; support trigger `clamp(0.15×(1+(lea−10)×0.02), 0.05, 0.35)`; effect values attack_up +20% / hp_regen 15% / mp_regen +10 | Pattern 3 | Skill balance is seed content — rebalancing is a seed edit, no economy re-sign needed (hồn ngọc/skill loop is intra-collection) |
| A5 | Shop prices heal 50💎 / booster 100💎 / formations 200-300-500💎; boss drops heal 70% / booster 25% / key4 4.9% / key5 0.1% | Patterns 4/5 | MUST pass the D-19 recompute in the economy amendment (net ≤ 0, gross < ~416/hr) before content ships — checkpoint:decision |
| A6 | MP resets to base at battle start (per-battle resource); HP persists (D-04) | Pattern 3 | If the user wants MP persistence, the schema gains an mp_current column — small change, flagged for discuss-phase |
| A7 | Hồn ngọc pool = new `user_hero_soulgems` table (userId+heroId unique) — per-hero, shared across copies (D-02 "spendable on Tào Tháo copies") | Schema | If instead per-copy pools were intended, a column on user_heroes + aggregation would be needed — schema migration cost |
| A8 | Skills stored as per-copy columns (`skill_normal_id`/`skill_special_id` on user_heroes) + `encounter_runs` carries the spawn roll | Schema | If a `user_hero_skills` table is preferred (e.g., future >2 slots), the migration grows; 2-slot is D-29-locked so columns are the minimal shape |
| A9 | Active legion = `user_legions` (one row/user) + `user_legion_slots` (12 rows, unique(userId, slotOrder)) | Schema | Child table chosen for FK integrity; a jsonb alternative would drop joins but lose integrity |
| A10 | Conversion requires ≥2 owned copies (a true dupe); converting the active companion is blocked or auto-switches | Pitfall 3 | If the user wants last-copy conversion allowed, the NO_ACTIVE_HERO soft-lock path needs a recovery design — flagged |
| A11 | The booster is a monitored hồn ngọc faucet (100💎 → ≤+20 hồn ngọc on one conversion); it does NOT violate D-19 (Linh thạch net flow still ≤ 0) | Economy | Phase 12 audit (TQC-19) should flag booster volume; if the user later disallows Linh thạch→hồn ngọc, the booster becomes drop-only (D-15 already supports that) |
| A12 | `encounter_runs` gains `level` + `skill_normal_id`/`skill_special_id` written at spawn; IV stays a battle-time roll (Phase 10 D-03 behavior, CR-02 guard carries) | Patterns 4/5 | If the level also moved to battle-time, the CR-02 stale-button guard would need to cover it — spawn-time is the D-31/D-34-consistent choice |

**Planner action:** A1-A4 are pure constant tables (adopt as proposed, balance-pass tunes); A5 REQUIRES the economy-budget.md amendment + D-19 recompute as a `checkpoint:decision` plan task (mirror Phase 10's 10-03); A6-A10, A12 are schema/service shape recommendations the planner may adopt; A11 is a documented monitoring flag for Phase 12.

## Open Questions

> All four questions are RESOLVED by in-plan tasks (revision 2026-08-14); each carries its resolution mapping.

1. **Economy-budget.md amendment (BLOCKING, D-18 one-way gate) — (RESOLVED → 11-01 Task 1 checkpoint:decision)**
   - What we know: the convertibility matrix's "Linh thạch → evolution" row conflicts with CONTEXT D-01/D-06 (evolution/leveling/reroll = hồn ngọc, never Linh thạch). The only new Linh thạch sinks are shop + formation purchases.
   - What's unclear: the exact amended wording + the recomputed `E[net/hour]` with Phase 11 shop prices (proposed heal 50 / booster 100 / formations 200-500💎) vs the ~416/hr gross bound.
   - Resolution: 11-01 Task 1 is the blocking checkpoint:decision that amends the convertibility matrix, restates the Linh thạch sink set (shop + formations only, all via wallet.deductBalance), records the boss drop weights (70/25/4.9/0.1), recomputes `E[net/hour] ≤ 0` + gross < ~416/hr with the confirmed prices, and re-signs the document (D-18). The seed (11-02) then writes the confirmed values.

2. **Boss-wall balance calibration — (RESOLVED → 11-08 Task 1 balance pass)**
   - What we know: D-05's `damage = max(atk−def, 1)` with mirrored stat pairs makes a uniformly-stronger boss (t2×IV100×L50 ≈ +25-35 edge over a same-level main) near-unbeatable at exactly L50.
   - What's unclear: the exact level/tier/chemistry combination that makes the L50+ legion wall beatable-but-hard.
   - Resolution: 11-08 Task 1 runs the balance-pass simulation (legion-vs-boss over the seeded stat ranges at L50/60/70 × t0/t1/t2 × chemistry tiers via runLegionBattle) and tunes the constants (STAT_GAIN_PER_LEVEL / TIER_MULTIPLIERS / CHEMISTRY_TIERS buffs) — NEVER the D-05 fight formula (locked). The wall asserts beatable-but-hard at L60+ t2 S-legions.

3. **Booster as Linh thạch→hồn ngọc bridge (A11) — (RESOLVED → flagged assumption A11, 11-01 + 11-04)**
   - What we know: D-11/D-12 lock the booster (Linh thạch-priced, doubles ONE conversion's hồn ngọc); D-02 says hồn ngọc never converts TO Linh thạch (which holds — one-way only).
   - What's unclear: whether the user considers Linh thạch→hồn ngọc (via booster) consistent with the account-bound stance, and what volume Phase 12 should monitor.
   - Resolution: kept as designed — a documented, bounded bridge (net Linh thạch flow stays ≤ 0; the booster is a sink, E[inflow] stays 0). Recorded as flagged assumption A11 in 11-01 (economy amendment) + 11-04 (booster volume), with Phase 12 TQC-19 monitoring; no runtime cap in v3 (D-11/D-12).

4. **Support-effect randomness inside the replayable engine — (RESOLVED → 11-05 Task 1, seeded-rng note)**
   - What we know: D-18 support effects roll on a chance; D-06 demands full replayability.
   - What's unclear: none technically — the trigger rolls ride the seeded rng (snapshot carries the support loadouts); this is locked by the D-06 contract.
   - Resolution: adopted seeded-rng support rolls — 11-05 Task 1 threads the support-trigger rolls through the same xoroshiro128plus (uniformFloat64) as hit/crit, and documents in the battleEngine header that support-effect outcomes are part of the replay (11-05 flagged assumption 'support-trigger determinism, RESEARCH OQ4').

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime (discord.js ≥22.12.0 requirement) | ✅ | v26.3.0 (Current — differs from documented 22 LTS target; satisfies requirement) | — |
| npm | No new installs; lockfile checks | ✅ | 11.16.0 | — |
| PostgreSQL | All schema/service work (migrations 0020+, wallet sinks, hồn ngọc pool, legion state) | ✅ | localhost:5432 LISTENING (verified this session) | — |
| Redis | Encounter cap ZSET — E2E of the spawn path only | ⚠️ | localhost:6379 CLOSED; `.env` `REDIS_URL` configured (production path, not probed to avoid secrets) | Unit tests are DB-only; E2E uses the configured Redis (Phase 10 A10 carry) |
| Docker | Deployment only — NOT required for Phase 11 code | ❌ | not installed | — |

**Missing dependencies with no fallback:** none for the code path (Redis reachability affects only full E2E of the check-in chain).
**Missing dependencies with fallback:** Docker (deployment-only, out of scope for Phase 11 code); Redis local (use the configured `.env` REDIS_URL).

Step 2.6 note: Phase 11 is interaction-driven (no cron, no new external services) — the only environment dependencies are the existing PostgreSQL + configured Redis.
## Security Domain

> `workflow.security_enforcement` is TRUE (ASVS level 1, block on high). This phase's security surface is larger than Phase 10: new currency (hồn ngọc pool), new wallet sinks (shop/formations), a new conversion/evolve sink family, boss capture randomness, and the legion assembly surface. All patterns carry from Phase 10 (crypto RNG, wallet guards, FOR UPDATE single-writer, customId anti-tamper, server-authoritative state).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Discord handles identity; userId from interaction (existing pattern) |
| V3 Session Management | no | Interaction-scoped; no sessions |
| V4 Access Control | yes | Legion assembly: ownership gate (the pressed userHeroId must belong to the user) + class-match validation (D-20) — crafted heroIds → `legion.class_mismatch`/ownership error, no state change |
| V5 Input Validation | yes | customId parsing with parseInt NaN guards (established `interactionCreate.ts` pattern); item codes validated against `sanguo_items`; slot indexes validated 0-11; tier 1-5 (existing); zod where payload parsing is needed |
| V6 Cryptography | yes | `crypto.randomInt`/`cryptoUniform` for ALL player-facing rolls: wild level band (D-33), skill roll at spawn (D-30), boss capture result (D-28), boss item drop (D-14); pure-rand strictly battle-internal (D-06) |

### Known Threat Patterns for the progression/chemistry/economy stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hồn ngọc double-spend (concurrent level/convert/evolve/reroll) | Tampering | Single-writer `FOR UPDATE` on the pool + copy rows; new `deductHonNgoc` WHERE-guard (`amount >= cost` + rowCount → `INSUFFICIENT_HON_NGOC`, whole tx rolls back) — mirrors wallet.ts:53-62 |
| Booster cloning (2× applied twice) | Tampering | Booster consumption + conversion yield in the SAME tx; FOR UPDATE on the `user_sanguo_items` row; quantity ≥1 guard; delete at 0 (quantity_positive check) |
| Crafted customId price tampering (`sanguo:shop:buy:{code}`, `sanguo:evolve:go:{id}`) | Tampering | Costs/values NEVER in customIds (UI-SPEC contract) — item code/hero id only; prices/curves resolve server-side inside the tx from config/seed |
| Last-copy / active-companion conversion → orphaned state | Tampering | Conversion guards ≥2 owned copies; active companion blocked or auto-switched in the tx (Pitfall 3) |
| Crafted legion assembly (wrong-class hero in a slot) | Tampering | Server-side class-match validation in `legionService` (D-20 strict rule) — a crafted `sanguo:legion:hero:{slot}:{id}` with a mismatched class → `legion.class_mismatch`, no write |
| Predictable RNG manipulation (boss capture, skill rolls, drops) | Tampering | Crypto CSPRNG exclusively for player-facing outcomes; pure-rand never outside `battleEngine.ts` |
| Boss capture regression (WINDOWS.md #5 left open) | Spoofing | Remove the `BOSS_CAPTURE_UNAVAILABLE` guard + `bossTemplateFor()` path (D-24 one-way supersession); regression test that boss capture grants a user_heroes row with the captured tier/level/skills |
| D-12/UI-SPEC hidden-mechanics leakage (chemistry %, weights, multipliers) | Information disclosure | Never-render list enforced structurally (embed data interfaces carry only visible fields — tier label + link count, rolled level, stars/grade, MP, costs); eslint/peer-review gate |
| Audit evasion (conversion/level/evolve/reroll history) | Repudiation | hồn ngọc ledger: mirror wallet_transactions with a `soulgem_transactions` audit table (userId, heroId, type convert/level/evolve/reroll, amount, balanceAfter) for Phase 12 TQC-19 + `/profile` future |
| Booster-driven hồn ngọc faucet abuse | Tampering | Booster is a documented, bounded Linh thạch→hồn ngọc bridge (A11); flagged for Phase 12 monitoring (TQC-19) — no runtime cap in v3 per D-11/D-12 |

## Sources

### Primary (HIGH confidence — codebase read this session)
- `src/db/schema/userHeroes.ts:12-53` — per-copy schema: 6 IV columns (0-31 checks), `level default 1`, `hp_current default 0`, `captured_zone`; deliberately NO unique (userId, heroId) — "duplicates MUST be allowed (Phase 11 TQC-14 dupe -> hồn ngọc conversion consumes duplicate rows)"
- `src/services/sanguo/battleEngine.ts:39-129,185` — `CombatantInput` shape, `combatStat(base, iv) = base + iv` ("D-05 locked"), `BATTLE_CONFIG` (ROUND_CAP 20, HIT_BASE 0.85, HIT_AGI_FACTOR 0.003, CRIT_BASE 0.05, CRIT_AGI_FACTOR 0.001), `runBattle(seed, player, enemy)` pure contract
- `src/services/sanguo/battleCheckInService.ts:51-74,224-313` — FOR UPDATE single-writer, `defaultSeed = crypto.randomInt(2 ** 32)`, HP write-back, BATTLE_ALREADY_FOUGHT guard, replay record (input jsonb = full CombatantInput snapshots)
- `src/services/sanguo/captureService.ts:64-76,118-291` — `captureChance` clamp [0,1] + pity cap, tier resolved server-side from `CAPTURE_TIERS`, `BOSS_CAPTURE_UNAVAILABLE` guard at line 150 (to be REMOVED), IV roll `crypto.randomInt(0, 32)` ×6, audit row per attempt
- `src/constants/sanguoCapture.ts:43-49,56-62,87-93` — `CAPTURE_TIERS` = `{ tier: 1, fee: 5n, multiplier: 1.0, requiresItem: null }` … `{ tier: 5, fee: 250n, multiplier: 5.0, requiresItem: 'capture_tier5_key' }`; `CAPTURE_BASE_BY_RARITY` = `{1:0.8, 2:0.55, 3:0.35, 4:0.2, 5:0.1}`; `PITY_CAP_BY_RARITY` = `{1:0.8, 2:0.75, 3:0.7, 4:0.65, 5:0.6}`
- `src/services/wallet.ts:47-82` — `deductBalance` WHERE-guard `users.balance >= amount` + ledger row in one tx; throws `INSUFFICIENT_BALANCE` on zero rows
- `src/db/schema/formations.ts:10-48` — formations/formation_slots/user_formations schema (base_price bigint, class varchar per slot, quantity); "buy/sell logic lands in Phase 11"
- `src/db/schema/sanguoItems.ts:9-23` — `base_price bigint` only (D-16 needs the price-currency model)
- `src/db/schema/userSanguoItems.ts:6-26` — `quantity_positive` check + `uniqueIndex(userId, itemId)` upsert pattern
- `src/db/schema/heroes.ts:44-97` — 8 base stats + `rarity` 1-5 (hidden) + `tier` ★1-5 (public) + `factionId`/`role`/`class`/`familyId` FKs
- `src/db/schema/heroRelations.ts:12-33` — `hero_relation_type` enum = `['spouse']` only; undirected pair unique index
- `src/db/schema/encounterRuns.ts:18-46` — `hero_id` nullable (boss NULL → D-24 makes it non-null), `encounter_type` 'hero'|'boss', status vocab, `pity_count`; F2 indexed re-fetch
- `src/db/schema/sanguoBattles.ts:12-39` — `seed` bigint mode 'number', `input`/`result` jsonb (the D-06 replay contract the legion snapshot extends)
- `src/commands/sanguo/hero.ts:142-170,178-219` — duplicate resolution "prefers the ACTIVE companion copy, else the earliest captured (lowest userHeroes.id)" (D-04 copy selector extends this); `renderHeroDetail` + `handleCompanionPress` pattern
- `src/commands/sanguo/heroes.ts:138-153` — `queryOwnedHeroes` zone filter (SC5 adds faction + IV grade)
- `src/commands/sanguo/map.ts:14-57` — subcommand composition + `SanguoComponentHandlers` re-export pattern
- `src/events/interactionCreate.ts:119-259` — customId prefix/exact routing pattern (sanguo:travel/battle/capture/starter/companion)
- `scripts/seed-sanguo.ts:312-337,342-476` — placeholder `SANGUO_ITEMS` (heal_pill 10n / xian_tea 25n / qinglong_dan 120n) to REPLACE; idempotent onConflictDoUpdate + clobber-safe spread pattern; FATAL-required datasets
- `src/ui/theme.ts:15-52` — `EMOJI`/`COLORS`; UI-SPEC adds ONLY `EMOJI.HON_NGOC: '🧿'` (verified `💠` clash: `src/db/seed.ts:68` linh_khi_tinh)
- `src/assets/sanguoEmojis.ts:1230` — `heroEmoji(heroId, tier = 0, star = false)` — tier-aware emoji for the D-07 evolution swap
- `.planning/config.json` — `workflow.nyquist_validation: false` (Validation Architecture SKIPPED); security_enforcement absent → enabled
- `package.json` — installed versions (no new deps)

### Secondary (MEDIUM confidence — external grounding via Tavily, tagged per the source hierarchy)
- [CITED: fifauteam.com/fc-24-chemistry + yardbarker.com FC 26 guide + operationsports.com FC 26 guide] — EA FC 24-26 chemistry: 0-3 chemistry points per player; 0 = base stats, NO penalty (bonus-only); links via club/nation/league with thresholds (FC 26: Club 2/4/7, Nation 2/5/8, League 3/5/8 → +1/+2/+3); boosts in 3/6/9 point tiers; position match required. Grounding for the D-19 chemistry model (points → tier → buff, bonus-only).
- [CITED: pokemongohub.net Guide to Power Up Costs + pokemongo.fandom.com/wiki/Power_up] — Pokemon GO power-up costs: stardust/candy step up every ~4 power-ups; L20→50 totals 475k stardust/248 candy/296 XL; costs per power-up rise to 15k stardust/20 XL at L50; CP multiplier scales stats per level. Grounding for the accelerating level curve + per-species candy model.
- [CITED: deargamers.net Sea of Stars combat] — "By using standard attacks, characters can restore a small amount of MP… special skills consume MP" — the exact D-29 MP model, established RPG pattern.
- [CITED: rampantgames.com/blog?p=3726 + omegathorion.wordpress.com mana system] — class-based vs skill-based systems + the mana economy loop (attack-generated mana → skill consumption).

### Tertiary (LOW confidence)
- WebSearch-only grounding (tagged LOW per `classify-confidence --provider tavily`): the EA FC/Pokemon GO/MP citations above are secondary-tier for DESIGN GROUNDING but the exact numeric values are my agent-discretion proposals, not sourced numbers — they must pass the in-plan balance pass + economy amendment.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all versions verified against `package.json` + package-legitimacy gate this session.
- Architecture: HIGH for the schema shapes and engine-extension pattern (all anchored in code read this session); MEDIUM for the balance numbers (A1-A5, agent-discretion proposals pending the in-plan balance pass + economy amendment).
- Pitfalls: HIGH — the six pitfalls are direct analogs of Phase 10's verified pitfalls (double-spend, replay contract, hidden mechanics, stale components) plus Phase-11-specific extensions (booster cloning, companion-orphan, boss-capture regression).

**Research date:** 2026-08-14
**Valid until:** 2026-09-13 (stable domain — codebase-verified; re-verify the economy amendment + balance numbers at plan time)



