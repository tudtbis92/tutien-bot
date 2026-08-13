# Phase 10: Battle & Capture — Research

**Researched:** 2026-08-13
**Domain:** deterministic battle engine (seeded PRNG replay), server-authoritative capture economy (crypto RNG), IV/capture content research, collection UX
**Confidence:** HIGH

## Summary

Phase 10 closes the first vertical loop of Tam Quốc Collection: starter → travel → encounter → **battle → capture → collection**. It delivers (1) a **pure, seeded battle engine** replayable via `pure-rand` (the ONLY new npm dependency, 8.4.2 — verified on the registry 2026-07-10, legitimacy OK, 65.5M weekly downloads, no postinstall), (2) a **server-authoritative capture service** whose displayed % equals the exact roll chance (crypto RNG), with per-encounter pity and a full attempt audit log including failures, (3) **IV roll (6×0–31, uniform crypto)** + free starter onboarding (the ONLY faucet), and (4) the `/sanguo heroes` collection + `/sanguo hero` detail/companion view.

The phase is heavily constrained by existing locked decisions (D-01..D-20 in CONTEXT.md) and by **one BLOCKING plan task: the D-18/D-20 economy re-sign** — `docs/economy-budget.md` MUST be updated with the 5-tier capture-fee values (drafted below, agent-discretion pricing) and re-signed before any Phase 10 content ships. Net-sink/neutral (D-19) is the hard constraint; the free starter is the only faucet.

Key codebase facts verified this session: `pure-rand` is absent from `package.json` (D-06 confirmed); `heroes.ts` has **no base-stat or rarity columns yet** (D-02 schema migration required); `user_heroes.ts` already has the 6 IV columns with 0–31 check constraints (`src/db/schema/userHeroes.ts:37-42`); `sanguo_battles.ts` is minimal (userId/status/roundLogs — needs seed+input columns, D-06); `encounterRuns.ts` carries the F2 indexed pending-encounter re-fetch that is the battle/capture entry state; `wallet.ts` `deductBalance` is the mandated fee path; the D-25 ack button contract inverts to a battle button (D-01).

**Primary recommendation:** Build in five waves — (0) `pure-rand` install + `battleEngine.ts` as a pure `(seed, input) → result` function with the locked D-05 formula, fully unit-tested before any UI; (1) schema migration 0019 (heroes base stats + rarity + public tier; user_heroes hp_current + captured_zone; sanguo_battles seed/input/result/type/encounter_id; capture_attempts table; user_sanguo_state; encounter_runs pity_count) + base-stats/rarity content seed; (2) `battleCheckInService` + capture service (single-writer FOR UPDATE flow, wallet fee, pity, flee, audit); (3) UI: battle log embed, capture view/result embeds, fight/skip/tier/retry/retreat buttons, customId routing; (4) collection + starter onboarding + `/sanguo hero` + **the D-20 re-sign plan task first**, i18n keys for all new surfaces.

## Project Constraints (from AGENTS.md)

Extracted actionable directives from `AGENTS.md` (in system context). The planner MUST verify compliance:

| Directive | Enforcement Point |
|-----------|-------------------|
| Discord interactions via slash commands + message components only | All Phase 10 surfaces are embeds + buttons/selects (UI-SPEC) |
| Node.js 22 LTS target (discord.js 14.26.2 doc requires ≥22.12.0) | **Discrepancy:** machine has Node **v26.3.0** — satisfies the requirement; do NOT pin/downgrade |
| TypeScript 5.8.x "không nâng TS 6.x" (STACK.md) | **Discrepancy:** `package.json` already has **typescript 6.0.3** installed and the project compiles — plan with installed versions (`npm run typecheck`) |
| ShardingManager from day 1 | Interaction handlers run per-shard; no new shard concerns |
| i18n zero-hardcoded strings (eslint-plugin-i18next + `npm run check-i18n`) | All new battle/capture/heroes/hero UI strings into `sanguo` namespace, 3 locales, parity enforced |
| Linh thạch is the only currency; wallet discipline (D-03) | Capture fee MUST go through `wallet.deductBalance` |
| Stack: Drizzle 0.45.2, pg-boss, ioredis, i18next, zod | Installed versions verified below (some differ from STACK.md — use installed) |
| GSD workflow enforcement (no direct repo edits outside GSD workflows) | Planner emits plans; executor uses `/gsd-execute-phase` |

**Stack version reality check (verified `package.json` this session):** `discord.js 14.27.0`, `typescript 6.0.3`, `drizzle-orm 0.45.2`, `drizzle-kit 0.31.10`, `pg 8.23.0`, `ioredis 6.0.0`, `i18next 26.3.6`, `zod 4.4.3`, `pg-boss 12.27.0`, `@discordjs/rest 2.6.3`, `fastify 5.11.3`, `vitest 4.1.10`. STACK.md values (14.26.2 / 5.8.x / ioredis 5.x) are stale — plans must reference the installed versions. `pure-rand` is the only addition.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Encounter-initiated battle replaces the Phase 9 ack button (D-25). The "Tiếp tục hành trình" ack becomes the "Chiến đấu" button on the encounter embed. `/sanguo battle` exists as the free spar/practice surface (D-17) — it never spawns a capturable encounter, so the ≤20/hr encounter supply cap is never bypassed.
- **D-02:** Base stats = 8 columns added to `heroes`: STR/AGI/INT/MOV/LEA/CHA (matching the 6 IV stats) + HP + MP, plus a `rarity` column (1-5). Seeded via content research. `combatStat = base + IV`; HP/MP = base only — IV never adds HP.
- **D-03:** Wild hero stats = base + IV rolled at encounter time; the rolled IV is stored in the battle record.
- **D-04:** HP persists per owned hero across battles. On loss the encounter flees (no capture). Player switches active companion via `/sanguo hero`; healing is items = Phase 11. Fainted active hero → battles BLOCKED with "đổi hero đồng hành trước" prompt. All heroes at 0 HP → no further battles (accepted soft-lock).
- **D-05:** Battle formula contract (locked): `combatStat = base + IV`; HP/MP base-only; turn order = MOV desc; tie → AGI, still tie → attacker first; attack type by class — STR: vanguard/cavalry/archer, INT: spellcaster/schemer, MAX(STR,INT): vu_co/thu_binh/cong_binh; damage = max(atk − def, 1); hit/crit derive from AGI; crit doubles damage; round cap (~20, exact agent) → winner = higher total damage dealt; tie → higher remaining HP%; LEA/CHA unused in Phase 10.
- **D-06:** Replay model: seed + input, recompute. Battle seed from `crypto.randomInt`; in-battle rolls ride pure-rand seeded by it (pure-rand battle-only, never for player-facing rolls). `sanguo_battles` stores seed + both heroes' full stat input; roundLogs jsonb computed at battle time; replay = re-run engine(seed, input). `pure-rand` NOT yet a dependency — must be added.
- **D-07:** Battle log = full turn-by-turn log rendered in a single embed; round cap keeps it bounded.
- **D-08:** Rarity is a real column on `heroes` (1-5), seeded with base-stats research. Drives capture chance, flee rate, fee tier.
- **D-09:** Capture fee = 5 tiers, each with fee + capture-chance multiplier. UI shows 3 tier buttons (direct fee payment); tiers 4-5 only when the player holds a special item. Engine + schema model all 5; Phase 10 activates 1-3. Fee always through `wallet.deductBalance`.
- **D-10:** Capture flow: battle win → "Bắt" → capture view (current % + 3 tier buttons + "Bỏ qua" retreat). Roll once via crypto RNG against the DISPLAYED %. Fail → flee roll (chance by rarity). Flee → hero gone, encounter resolved, travel resumes. No flee → retry allowed (fee each attempt; % recalculated with pity).
- **D-11:** Pity = per-encounter bad-luck protection: each failed attempt adds +X% for the NEXT attempt; resets on success, flee, or retreat.
- **D-12:** Hidden-mechanics contract (hard): IV numbers and rarity ABSOLUTELY never shown on any UI — only the IV grade (Hoàng Kim / Hồng ngọc / Lam cấp / Lục cấp / Hôi cấp). The capture % shown before attempting is the exact computed chance and the single displayed number.
- **D-13:** Boss thường encounters ARE capturable after a win — at a low rate consistent with high rarity.
- **D-14:** Starter onboarding lives inside `/sanguo heroes`: empty collection → starter picker (faucet = one free hero). Set 1: Tào Tháo, Lưu Bị, Tôn Kiên. After 3 invocations without picking, the 4th call rotates to set 2: Trương Giác, Viên Thiệu, Đổng Trác (the "hidden option" = set 2, no 4th option in set 1). Chosen starter becomes active companion.
- **D-15:** `/sanguo heroes` = owned-only collection with a zone filter; each hero one line: emoji + name + tier + IV grade; active companion highlighted.
- **D-16:** New subcommand `/sanguo hero` = per-hero detail + "chọn làm hero đồng hành" (active companion switch — required by D-04 HP persistence).
- **D-17:** Spar = `/sanguo battle` vs a random real hero (base + IV, no capture). Free, no fee, no real HP loss, no reward. Blocked when active hero fainted.
- **D-18:** Retreat allowed on every encounter/capture view ("Bỏ qua / Rút lui"): wild departs, pending encounter resolves, travel resumes. Encounter cap unaffected (counts roll hits, not resolutions).
- **D-19:** No XP/leveling in Phase 10 — all heroes stay level 1.
- **D-20:** D-18 re-sign is an in-phase plan task (BLOCKING): `docs/economy-budget.md` MUST be updated + re-signed with the 5-tier capture-fee values (priced by the researcher) assuming pull-driven encounter supply (≤20/hr), BEFORE any Phase 10 content ships. Net-sink/neutral (D-19 Phase 8) stays hard; free starter is the only faucet.

### the agent's Discretion
- Exact hitChance / crit formulas and numeric values (principle locked in D-05: AGI ↑ hit/crit, defender AGI ↓).
- Exact round cap number (~20) and battle embed layout / customId naming (`sanguo:battle:*`, `sanguo:capture:*`).
- Capture fee tier values + capture multipliers (researcher prices them for the D-20 re-sign).
- Flee rate values per rarity; pity increment value (X%); IV roll distribution (uniform 0-31 default).
- Base-stats + rarity values per hero (research content); starter set roster confirmation (names locked in D-14).
- Where current HP is stored (e.g., `user_heroes` HP column) and the active-companion user-state shape.
- `sanguo_battles` schema extension (seed + input columns) beyond the Phase 8 base (userId, status, roundLogs).

### Deferred Ideas (OUT OF SCOPE)
- Skill 2-slot system (Phase 11) — MP column exists but unused.
- XP/leveling + evolution stat model — Phase 11 (TQC-15).
- Capture tiers 4-5 special items — events / Phase 11 shop (TQC-16); schema + engine model them now, unlock later.
- Healing items — Phase 11 shop (TQC-16).
- LEA/CHA buff/debuff combat use — Phase 11 chemistry (TQC-17); unused in Phase 10 formula.
- Boss drops (items, never money) — Phase 11 (TQC-16).
- Legion / multi-hero team — Phase 11 (TQC-17); Phase 10 is solo (1 active companion).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md v3) | Research Support |
|----|----------------------------------|------------------|
| TQC-10 | Pure `battleEngine` (seeded, replayable với `pure-rand`); `sanguo_battles` records + jsonb round logs; solo battle (player-initiated + encounter-initiated) | pure-rand 8.4.2 API verified (official README); engine = pure `(seed, input) → result` (D-05/D-06); schema extension for seed/input/result columns specified below |
| TQC-11 | `captureService`: `captureChance(rarity × HP% × item)` clamped [0,1]; crypto RNG; % hiển thị trước khi bắt; pity counter; audit log đầy đủ kể cả failed attempts | Pokemon-standard HP factor verified (Bulbapedia); `cryptoUniform()` pattern exists (`encounterService.ts:57-59`); `capture_attempts` audit table + pity on `encounter_runs` specified; fee via `wallet.deductBalance` (`wallet.ts:47-82`) |
| TQC-12 | IV 6 chỉ số (0–31) roll khi bắt; starter onboarding chọn 1 hero miễn phí (faucet duy nhất) | `user_heroes` IV columns + 0–31 checks verified (`userHeroes.ts:27-42`); IV roll = `crypto.randomInt(0,32)` ×6 at capture; starter picker in `/sanguo heroes` with set rotation (D-14); grade bands locked (STATE.md:79) |
| TQC-13 | Collection view: `/sanguo heroes` (collection/pokedex theo zone, emoji + tier + IV); `/sanguo map` scaffold | Public display stars via new `heroes.tier` content column (UI-SPEC resolution — separate from hidden rarity); captured-zone snapshot column recommended; zone filter select per CR-09-01/02 layout rules |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Battle simulation (turn order, damage, hit/crit, round cap) | API / Backend (service layer) | — | Pure synchronous function `runBattle(seed, input)` with zero discord.js/db deps — deterministic, unit-testable, replayable (D-05/D-06) |
| Seeded RNG (pure-rand) | API / Backend | — | Battle-only per milestone mandate; never player-facing; seed from `crypto.randomInt` at battle start (D-06) |
| Capture chance computation + crypto roll + flee roll + pity | API / Backend | — | Server-authoritative; every player-facing roll rides `crypto.randomInt` via `cryptoUniform()` (milestone mandate; ASVS V6) |
| Capture fee deduction | API / Backend (wallet) | Database | `wallet.deductBalance` WHERE-guard + ledger row in one tx (D-03, `wallet.ts:47-82`) |
| Pity + attempt state | Database | API / Backend | `encounter_runs.pity_count` + new `capture_attempts` audit rows; single-writer FOR UPDATE (established pattern) |
| Battle log rendering | Discord client surface (bot client tier) | API / Backend | Single embed, description-only, ≤20 turn lines (D-07, UI-SPEC budget ≤ ~1,700 chars) |
| Capture / collection / hero-detail views + buttons | Discord client surface | Database | Embeds + message components; customIds routed in `interactionCreate.ts` |
| Content (base stats, rarity, tier) | Database | — | Seeded content-in-DB columns on `heroes` (D-02/D-08) via idempotent upsert (`seed-sanguo.ts` pattern) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pure-rand | **8.4.2** | Seeded PRNG for battle replay | ONLY new dependency (D-06). Official README (fetched this session): `xoroshiro128plus(seed)` (recommended generator), `uniformInt(rng, min, max)` inclusive, `uniformFloat64(rng)` [0,1), `purify()` for pure `[value, nextRng]` threading. Same seed → same sequence. Maintainer dubzzz (fast-check author). |
| discord.js | 14.27.0 (installed) | Embeds, buttons, selects, interaction routing | Existing; ack/battle/capture surfaces are Discord-native (UI-SPEC) |
| drizzle-orm + pg | 0.45.2 / 8.23.0 (installed) | Schema, migrations (drizzle-kit 0.31.10), `FOR UPDATE` single-writer | Established; migration 0019 via `drizzle-kit generate` + `npm run migrate` |
| ioredis | 6.0.0 (installed) | Encounter cap window (existing `sanguo:enc:win:{userId}` ZSET) | Battle/capture add NO new Redis usage; cap only counts roll hits (D-18) |
| i18next + i18next-fs-backend | 26.3.6 / 2.6.7 (installed) | `sanguo` namespace; new `battle/capture/heroes/hero` sections | Zero-hardcoded-string mandate; `npm run check-i18n` parity |
| zod | 4.4.3 (installed) | Runtime validation of customId payloads / parsed params | Existing project standard (V5) |
| vitest | 4.1.10 (installed) | Unit tests incl. deterministic RNG-injection (`src/**/__tests__/**/*.test.ts`) | Established; battle engine tests = pure-function replay assertions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @discordjs/rest | 2.6.3 (installed) | Not needed in Phase 10 | Pull-based check-in (D-22) — no push, no REST DM |
| pg-boss | 12.27.0 (installed) | Not needed in Phase 10 | No cron (D-22 supersedes sanguoTick); battle/capture are interaction-driven |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pure-rand 8.4.2 | `seedrandom` / `random-js` / `mersenne-twister` | pure-rand is the standard seeded-PRNG choice for fast-check/deterministic replay ecosystems; all are battle-only anyway. D-06 locks pure-rand. |
| Custom battle engine | Any npm battle framework | None fit Discord RPG auto-battle rules; D-05 formula is custom-locked. Writing `runBattle` pure function is the standard approach (research/SUMMARY.md:26) |
| `capture_attempts` table | jsonb array on `encounter_runs` | Table mirrors `wallet_transactions` audit philosophy (first-class rows + indexes for Phase 12 TQC-19 reports); jsonb array complicates aggregate queries |

**Installation:**
```bash
npm install pure-rand@8.4.2
```

**Version verification (this session):** `npm view pure-rand version` → `8.4.2`; `time.modified` → 2026-07-10; `repository.url` → git+https://github.com/dubzzz/pure-rand.git.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pure-rand | npm | ~7 yrs (published 2026-07-10 latest) | 65,498,756/wk | github.com/dubzzz/pure-rand | OK | Approved — only new dep |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                        ┌────────────────────────────────────────────────────┐
                        │                    INTERACTION LAYER               │
                        │  interactionCreate.ts (customId prefix router)     │
                        │  sanguo:battle:*  sanguo:capture:*  heroes:* hero:*│
                        └───────┬──────────────┬──────────────────┬──────────┘
                                │              │                  │
            ┌───────────────────▼────┐   ┌─────▼──────────────┐   │
            │ /sanguo travel check-in│   │ /sanguo battle     │   │
            │ (travelCheckInService) │   │ (spar, D-17)       │   │
            │  encounterPending (F2) │   └─────────┬──────────┘   │
            └───────────┬────────────┘             │              │
                        │ pending encounter        │ random hero   │
                        ▼                          ▼              ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                BATTLE ENTRY (battleCheckInService, D-01)          │
        │  FOR UPDATE lock player_travel_state + encounter_runs row         │
        │  active companion from user_sanguo_state → HP>0 gate (D-04)       │
        │  wild IV rolled (crypto, D-03) → build BattleInput                │
        │  seed = crypto.randomInt (D-06)                                   │
        └─────────────────────────────────┬────────────────────────────────┘
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │            battleEngine.ts  —  PURE function (no I/O)             │
        │  runBattle(seed, BattleInput) → { roundLogs, winner, totals,      │
        │      hpRemaining }  (D-05 formula, pure-rand rolls)               │
        │  replay: runBattle(seed, storedInput) ≡ stored roundLogs (D-06)   │
        └─────────────────────────────────┬────────────────────────────────┘
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │  sanguo_battles row: seed + input jsonb + roundLogs + result      │
        │  player HP write-back (encounter battles only, D-04)              │
        │  win → CAPTURE VIEW   |   loss → encounter 'escaped' + travel     │
        └─────────────────────────────────┬────────────────────────────────┘
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │            captureService.ts  (single-writer tx, D-10/D-11)       │
        │  chance = clamp(base(rarity) × hpFactor × tierMult + pity, 0..1)  │
        │  tier press → wallet.deductBalance(fee) → crypto roll < chance    │
        │  fail → pity++ (row) + flee roll (crypto < fleeRate(rarity))      │
        │  EVERY attempt → capture_attempts audit row (incl. failures)      │
        │  success → 6× IV roll (crypto.randomInt(0,32)) → user_heroes row  │
        └─────────────────────────────────┬────────────────────────────────┘
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │  RESOLUTION: encounter_runs status (captured/fled/skipped/escaped)│
        │  player_travel_state: encounterActive=false, updatedAt=now        │
        │  → next /sanguo travel check-in resumes (ack-pin model, D-25)     │
        └──────────────────────────────────────────────────────────────────┘
```

Data flow for the primary use case: `/sanguo travel` check-in hits an encounter → `encounterActive=true` → encounter embed with **Chiến đấu** + **Bỏ qua** buttons (D-01) → battle start → engine(seed, input) → battle log embed → win → capture view (displayed %) → tier button → fee + roll → success inserts `user_heroes` (IV) → collection shows it via `/sanguo heroes`. Every player-facing number (capture %, encounter, IV) is crypto; pure-rand exists ONLY inside the seeded battle.

### Recommended Project Structure (new files)

```
src/
├── services/sanguo/
│   ├── battleEngine.ts          # PURE seeded engine (D-05/D-06) — no db/discord imports
│   ├── battleCheckInService.ts  # pending encounter → battle → capture → travel resume (D-01/D-10)
│   ├── captureService.ts        # chance calc, crypto roll, flee, pity, audit, IV insert (TQC-11/12)
│   └── __tests__/
│       ├── battleEngine.test.ts
│       └── captureService.test.ts
├── commands/sanguo/
│   ├── battle.ts                # spar subcommand (D-17) — exports battleSubcommand + handleBattleStart...
│   ├── heroes.ts                # collection + starter picker (D-14/D-15) — exports heroesSubcommand + handlers
│   └── hero.ts                  # detail + companion switch (D-16)
├── ui/embeds/
│   ├── buildSanguoBattleLogEmbed.ts
│   ├── buildSanguoCaptureEmbed.ts        # capture view + result states (or split result builder)
│   ├── buildSanguoHeroesEmbed.ts         # collection + starter picker
│   └── buildSanguoHeroEmbed.ts
├── ui/components/
│   ├── sanguoBattleButtons.ts            # fight/skip (D-01)
│   ├── sanguoCaptureButtons.ts           # tier/retry/retreat (D-09/D-10)
│   ├── sanguoStarterButtons.ts           # starter set buttons (D-14)
│   ├── sanguoHeroesZoneMenu.ts           # zone filter select (D-15)
│   └── sanguoHeroCompanionButton.ts      # companion switch (D-16)
└── db/schema/
    ├── captureAttempts.ts       # NEW audit table (TQC-11)
    └── userSanguoState.ts       # NEW active-companion + starter-views state
```

### Pattern 1: Seeded Replayable Battle Engine (pure function)

**What:** `runBattle(seed, input)` is a synchronous, deterministic, I/O-free function. The seed (crypto-generated at battle start) drives every in-battle roll through pure-rand; the input is both heroes' full stat snapshots (base + IV + starting HP). Replay = re-run with stored seed + input and assert identical roundLogs (D-06).

**When to use:** every battle (encounter + spar). The command/service layer owns I/O (DB reads, seed generation); the engine owns only math.

```typescript
// src/services/sanguo/battleEngine.ts — SKELETON (formula per D-05, values agent-discretion)
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import { uniformFloat64 } from 'pure-rand/distribution/uniformFloat64';

export interface CombatantInput {
  heroId: string;                 // display identity only — engine never touches DB
  base: { str: number; agi: number; int: number; mov: number; lea: number; cha: number; hp: number; mp: number };
  iv: { str: number; agi: number; int: number; mov: number; lea: number; cha: number };
  hpCurrent: number;
  isPlayer: boolean;              // tie-break: attacker first (D-05)
}

export interface TurnLog { round: number; attacker: string; defender: string; hit: boolean; crit: boolean; dmg: number; defenderHpAfter: number; }

export interface BattleResult { roundLogs: TurnLog[]; winner: 'player' | 'enemy'; rounds: number; totalDamagePlayer: number; totalDamageEnemy: number; playerHpAfter: number; enemyHpAfter: number; }

export function combatStat(base: number, iv: number): number { return base + iv; } // D-05 locked

export function runBattle(seed: number, player: CombatantInput, enemy: CombatantInput): BattleResult {
  const rng = xoroshiro128plus(seed);
  // … deterministic loop per D-05: MOV desc order (tie → AGI, tie → attacker first),
  // attack type by class → atk/def pair, damage = max(atk − def, 1), hit/crit from AGI,
  // crit ×2, round cap (default 20) → winner by total damage, tie → remaining HP%.
  void rng; void uniformFloat64; // rolls only via this seeded rng
  throw new Error('TODO: engine body (D-05 formula)');
}
```

### Pattern 2: Single-Writer Capture Transaction

**What:** the capture attempt runs inside ONE `FOR UPDATE` transaction that locks the user's own rows (pending encounter re-fetch F2, pity read/write, wallet fee, roll, audit insert, outcome transitions). Mirrors the established check-in single-writer rule (Pitfall 5, `travelCheckInService.ts:26-33`).

```typescript
// SKELETON — capture attempt (D-10/D-11), fee via wallet (D-03)
const result = await db.transaction(async (tx) => {
  const [encounter] = await tx.select().from(encounterRuns)
    .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
    .orderBy(desc(encounterRuns.id)).limit(1).for('update');
  if (!encounter) throw new Error('NO_PENDING_ENCOUNTER');
  const chance = captureChance({ rarity, hpFraction, tierMultiplier, pity: encounter.pityCount }); // clamped [0,1]
  await deductBalance(tx, userId, tierFee, { reason: 'sanguo_capture_t' + tier, metadata: { encounterId: encounter.id, tier } });
  const roll = cryptoUniform();                       // crypto CSPRNG — never Math.random/pure-rand here
  const success = roll < chance;
  // success → 6× crypto.randomInt(0,32) IV → insert user_heroes (hp full) → encounter status 'captured'
  // fail → pity++ (UPDATE encounter_runs) + flee roll (crypto < fleeRate(rarity)) → 'fled' | stays pending
  // EVERY attempt → insert captureAttempts audit row (incl. failures — TQC-11/SC2)
  return { success, roll, chance };
});
```

### Pattern 3: IV Grade (hidden mechanics — D-12)

**What:** IV numbers are never rendered; only the grade. Grade bands locked (STATE.md:79): `100=Hoàng Kim, 90-99=Hồng ngọc, 80-89=Lam cấp, 60-79=Lục cấp, <60=Hôi cấp` where IV% = `round(sum/186 × 100)`. Grade strings via i18n keys.

### Anti-Patterns to Avoid
- **Rolling player-facing outcomes with anything but crypto:** Math.random or pure-rand for capture/flee/IV breaks fairness + economy (milestone mandate; pure-rand is battle-only — D-06).
- **Displaying a rounded % but rolling against a different number:** roll against the exact chance; display `floor(chance×100)`; store both in the audit row so SC2 ("outcome matches displayed %") is checkable.
- **Putting the fee in the customId:** `sanguo:capture:tier:{1|2|3}` carries only the tier; the fee comes from server-side tier config — prevents crafted-customId price tampering (UI-SPEC).
- **Leaving stale components on editReply:** every `editReply` must pass `components: []` when clearing (CR-09-03/04 — live-verified Discord PATCH merge semantics).
- **Forgetting the F2 re-fetch index:** battle/capture entry MUST reuse the indexed pending-encounter re-fetch (`encounter_runs_user_status_idx`, `encounterRuns.ts:30`) — never re-roll.
- **Hardcoding hex colors:** all embed colors from `src/ui/theme.ts` COLORS (SEASON/SUCCESS/DANGER/WARNING/NEUTRAL/GOLD — UI-SPEC contract).
- **Rendering raw IV/rarity anywhere:** D-12 hard rule; only IV grade + single capture %.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seeded PRNG for battle replay | Your own PRNG / Math.random | `pure-rand` 8.4.2 | Battle-tested xoroshiro128plus + unbiased uniform distributions; deterministic replay contract (D-06) |
| Player-facing random rolls | Anything custom | `crypto.randomInt` via `cryptoUniform()` (`encounterService.ts:57-59`) | CSPRNG mandate; ASVS V6; predictable PRNG breaks fairness |
| Capture fee deduction | Direct `UPDATE users SET balance` | `wallet.deductBalance(tx, …)` (`wallet.ts:47-82`) | WHERE-guard + matching ledger row in one tx (D-03, SC1 reconcilability) |
| Migrations | Hand-written SQL | `drizzle-kit generate` + `npm run migrate` | Established (migrations 0000–0018 exist; Phase 10 = 0019+) |
| i18n | Hardcoded strings | i18next `sanguo` namespace + `check-i18n` | Zero-hardcoded mandate; parity across VI/EN/ZH-CN |
| Hero emoji rendering | Raw `<:name:id>` | `heroEmoji()` (`sanguoEmojis.ts:1230`) | Animated prefix `<a:name:id>` — verified live; EMOJI_NOT_FOUND → name-only guard |
| Turn-by-turn log rendering | Fields-per-round | Single embed description (D-07) | ≤25-field cap; description ≤4,096; round cap bounds it |
| Zone filter select | Buttons for zones | `StringSelectMenuBuilder` + `setEmoji` | CR-09-01/02 live-verified layout + emoji rules |

**Key insight:** every piece of "randomness + money + state" in this phase already has a vetted in-repo primitive (crypto RNG, wallet, FOR UPDATE single-writer, F2 re-fetch, heroEmoji, theme, i18n). The only genuinely new code is the pure battle engine (a pure function — the one thing worth writing from scratch) and the capture service orchestration.

## Common Pitfalls

### Pitfall 1: Battle replay divergence (seed/input contract break)
**What goes wrong:** stored roundLogs don't reproduce from seed+input (SC1 fails).
**Why it happens:** engine reads DB/global state at replay time; input snapshot incomplete (wild IV not stored, HP not snapshot); Math.random sneaks in.
**How to avoid:** engine takes ONLY (seed, input); full stat snapshot (base+IV+hpCurrent both sides) stored in `sanguo_battles.input` jsonb at battle start (D-03/D-06); replay unit test: `runBattle(seed, input)` twice → deep-equal roundLogs.

### Pitfall 2: Displayed % vs roll mismatch
**What goes wrong:** SC2 fails — the roll doesn't match the shown number.
**Why it happens:** rounding display vs exact roll; recomputing the chance with stale pity/HP between render and press.
**How to avoid:** display `floor(chance×100)` where chance is the exact clamped value rolled against; recompute chance INSIDE the attempt tx from the locked row (pity from encounter_runs, HP from battle result); audit row stores exact chance + roll.

### Pitfall 3: Fee double-spend / concurrent capture attempts
**What goes wrong:** two presses of the tier button both deduct + both insert a hero.
**Why it happens:** no row lock; status transition not WHERE-guarded.
**How to avoid:** capture attempt runs in one tx: `FOR UPDATE` on the pending encounter row, then attempt; success transitions `status='pending' → 'captured'` with WHERE guard; the next press re-fetches and finds no pending row (F2 pattern).

### Pitfall 4: Player-facing rolls using predictable RNG
**What goes wrong:** capture/flee/IV become predictable → economy + fairness broken (ZH-CN disclosure risk).
**Why it happens:** convenience Math.random or leaking pure-rand outside battle.
**How to avoid:** crypto RNG mandate enforced in code review; pure-rand imported ONLY in `battleEngine.ts`; `cryptoUniform()` reused for capture/flee (pattern: `encounterService.ts:57-59`).

### Pitfall 5: HP persistence / fainted-block broken
**What goes wrong:** player battles with a fainted hero; HP doesn't persist across battles (D-04); spar writes real HP.
**Why it happens:** no `hp_current` on `user_heroes`; battle service always writes HP back.
**How to avoid:** `user_heroes.hp_current` (0 = fainted); encounter battles write back damage, spar does NOT; battle start gate reads active companion HP > 0 (D-04/D-17 prompt).

### Pitfall 6: D-12 leakage (raw IV/rarity rendered)
**What goes wrong:** content contract violation — raw numbers on any UI.
**Why it happens:** convenience rendering `ivStr` in the collection line.
**How to avoid:** collection/hero-detail render grade only (grade keys); capture view renders only the %; rarity never rendered; eslint/peer-review gate; display stars come from public `heroes.tier` column (UI-SPEC resolution), never derived from rarity.

### Pitfall 7: Ack-contract inversion regression (D-01)
**What goes wrong:** old ack route still active / battle button missing; `encounterActive` never cleared after battle.
**Why it happens:** `interactionCreate.ts` ACK_BTN_ID route + `handleAckPress` not fully replaced; resolution path forgets `encounterActive=false, updatedAt=now` (ack-pin model).
**How to avoid:** replace ACK route with `sanguo:battle:start` prefix route; resolution (win→capture done / loss / skip / retreat) always clears `encounterActive` and pins `updatedAt` inside the FOR UPDATE tx; regression test on travel resume.

### Pitfall 8: Battle log overflow / latency
**What goes wrong:** embed exceeds description budget; handler exceeds 3s window.
**Why it happens:** unbounded rounds; heavy DB work inside the interaction.
**How to avoid:** round cap 20 (D-05); turn line ≤ ~80 chars (log ≤ ~1,700 chars < 4,096); engine is sync pure math (µs) — deferReply → editReply pattern (CR-09-06); held-out interaction tests for the backstop items (UI-SPEC).

### Pitfall 9: Installed-version drift
**What goes wrong:** plan code written against STACK.md versions (discord.js 14.26.2, TS 5.8.x) fails against installed (14.27.0, TS 6.0.3).
**Why it happens:** STACK.md stale vs `package.json`.
**How to avoid:** reference installed versions (verified this session); `npm run typecheck` in the verification loop.

## Code Examples

Verified patterns from official sources:

### Common Operation 1: pure-rand seeded generation (official README)
```typescript
// Source: https://github.com/dubzzz/pure-rand (README, fetched 2026-08-13)
import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';

const seed = 42;
const rng = xoroshiro128plus(seed);
const firstDiceValue = uniformInt(rng, 1, 6);   // value in {1..6} — deterministic per seed
```
Pure variant (returns `[value, nextRng]`, never mutates):
```typescript
import { uniformIntDistribution } from 'pure-rand/distribution/UniformIntDistribution';
import { purify } from 'pure-rand/utils/purify';
const uniformIntDistributionPure = purify(uniformIntDistribution);
const [value, rng2] = uniformIntDistributionPure(xoroshiro128plus(seed), 1, 6);
```
**Recommendation:** use the impure `uniformInt(rng, min, max)` threading ONE mutable rng through the battle loop — the sequence is fully seed-determined, and replay creates a fresh `xoroshiro128plus(seed)`.

### Common Operation 2: crypto roll (existing project pattern)
```typescript
// Source: src/services/sanguo/encounterService.ts:57-59 (verified this session)
export function cryptoUniform(): number {
  return crypto.randomInt(0, 1_000_000) / 1_000_000;
}
```
IV roll at capture (TQC-12): `crypto.randomInt(0, 32)` ×6 — uniform 0–31 default (agent discretion; satisfies the existing `userHeroes.ts:37-42` check constraints).

### Common Operation 3: wallet fee deduction (existing project pattern)
```typescript
// Source: src/services/wallet.ts:47-82 (verified this session)
const balanceAfter = await deductBalance(tx, userId, feeAmount, {
  reason: 'sanguo_capture_t1',                    // reason ≤ 50 chars (walletTransactions.ts:21)
  metadata: { encounterId: encounter.id, tier, chance },
});
// Throws Error('INSUFFICIENT_BALANCE') → capture.insufficient copy (UI-SPEC)
```

### Common Operation 4: pending-encounter re-fetch (F2 — the battle/capture entry)
```typescript
// Source: src/services/sanguo/travelCheckInService.ts:211-218 (verified this session)
const [pending] = await tx
  .select()
  .from(encounterRuns)
  .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
  .orderBy(desc(encounterRuns.id))
  .limit(1);
// Indexed by encounter_runs_user_status_idx (encounterRuns.ts:30) — reuse, never re-roll.
```

### Common Operation 5: IV grade computation (D-12 / STATE.md:79)
```typescript
const IV_SUM_MAX = 186;
const pct = Math.round((ivStr + ivAgi + ivInt + ivMov + ivLea + ivCha) / IV_SUM_MAX * 100);
const gradeKey = pct === 100 ? 'iv_grade.gold' : pct >= 90 ? 'iv_grade.ruby' : pct >= 80 ? 'iv_grade.sapphire'
  : pct >= 60 ? 'iv_grade.jade' : 'iv_grade.gray';   // Hoàng Kim/Hồng ngọc/Lam cấp/Lục cấp/Hôi cấp — i18n keys
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global `Math.random` / unnamed PRNG for battle rolls | Seeded `pure-rand` `xoroshiro128plus` + `uniformInt`; replay = seed+input recompute | D-06 locked; pure-rand 8.4.2 (2026-07-10) | Auditable, replayable battle logs; deterministic tests |
| Player-facing rolls via any PRNG | `crypto.randomInt` CSPRNG exclusively | Milestone Init | Fairness + economy integrity; ZH-CN disclosure compliance path |
| Capture HP factor unspecified | Pokemon-standard HP factor `(3×HPmax − 2×HPcurrent)/(3×HPmax)` (Bulbapedia Gen III–V) — lower HP → higher chance | This research | Battle performance directly feeds capture odds; validated by 25 years of Pokemon catch math |
| Travel ack button (D-25) | Battle entry replaces ack (D-01) | Phase 10 CONTEXT | Ack contract inverts: `sanguo:battle:start` route replaces `ACK_BTN_ID` |

**Deprecated/outdated:**
- `ACK_BTN_ID` (`sanguoTravelButtons.ts:9`) + `handleAckPress` (`travel.ts:520-577`): superseded by D-01 battle entry — the route is removed or repurposed; the travel-resume semantics (clear `encounterActive`, pin `updatedAt`) move into the battle/capture resolution path.
- STACK.md versions (discord.js 14.26.2, TS 5.8.x, ioredis 5.x): stale vs installed `package.json` — use installed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Draft capture-fee table (Tier 1=10💎 ×1.0, T2=30💎 ×1.5, T3=80💎 ×2.0, T4=200💎 ×3.0 item-gated, T5=500💎 ×5.0 item-gated; base capture by rarity R1 .80/R2 .55/R3 .35/R4 .20/R5 .10; HP factor Pokemon-standard; pity +5pp/attempt; flee R1 .10/R2 .20/R3 .35/R4 .55/R5 .75; rarity distribution 60/25/10/4/1 from research/SUMMARY.md) | Common Pitfalls → D-20 | D-20 re-sign must recompute E[net ≤ 0] + gross ≤ ~416/hr with these values; if rejected, capture/engine constants change but the architecture (tiers in config, chance formula, audit) is unchanged |
| A2 | Base-stats content approach: class-template-driven generation (per-class stat templates + per-hero modifiers), rarity by prominence tier, public display stars `heroes.tier` (★1–5) seeded independently of hidden rarity; committed as `scripts/data/sanguo-base-stats.json` + idempotent upsert | Standard Stack / Patterns | If the user wants per-hero hand-tuned stats (TQC-09-style research), the D-02 content task grows from a generation pass to a research pass — same schema, more effort |
| A3 | Boss thường battle needs a stat block although `encounter_runs.hero_id` is NULL for bosses (`encounterRuns.ts:20-23`): recommend a zone-scaled boss template (rarity 5, elevated HP/STR) from the same content data file | Architecture Patterns | If boss stats differ, only the boss-input builder changes; engine untouched |
| A4 | Active-companion state = new `user_sanguo_state` table (user_id unique, active_hero_id FK user_heroes.id, starter_views counter for D-14 rotation) | Patterns | If instead an `is_active` boolean on user_heroes is preferred, queries change but semantics identical |
| A5 | `user_heroes` gains `hp_current` (0 = fainted, default full at capture/starter) + `captured_zone` (snapshot at capture for zone filter D-15) | Patterns | HP storage location is explicitly agent discretion (CONTEXT); captured_zone is my addition for TQC-13 zone grouping (heroes table has no zone) |
| A6 | `sanguo_battles` extension: `encounter_id` (nullable FK), `type` ('encounter'\|'spar'), `seed`, `input` jsonb, `result` jsonb; statuses 'pending'\|'completed' | Patterns | CONTEXT explicitly leaves the seed+input schema to the agent; shape is contract-critical (D-06) |
| A7 | `encounter_runs` status vocabulary extends to 'captured'\|'fled'\|'skipped'\|'escaped' (battle-loss) | Patterns | Audit/TQC-19 clarity; if unified 'fled', reports lose win/loss attribution |
| A8 | `capture_attempts` table: user_id, encounter_id, tier, fee bigint, displayed_chance float8, roll float8, outcome ('success'\|'fail'\|'flee'), pity_before, created_at, index (user_id, created_at) | Patterns | Audit-log requirement (TQC-11) has no pre-existing sanguo audit table; a first-class table mirrors wallet_transactions philosophy |
| A9 | Hit/crit formula draft: hit = clamp(0.85 + (agiA − agiD) × 0.003, 0.50, 0.99), crit = clamp(0.05 + (agiA − agiD) × 0.001, 0.02, 0.30); round cap exactly 20 | Code Examples | Agent discretion per D-05 — must be sanity-checked against the actual seeded base-stat ranges in the balance pass |
| A10 | Redis availability for E2E: localhost:6379 closed; bot uses `.env` `REDIS_URL` (not probed — secret) — travel check-in (encounter cap) depends on it | Environment Availability | If REDIS_URL is unreachable in the dev env, check-in tests that hit the cap path fail; battle/capture core tests are DB-only |
| A11 | `heroes.tier` public column (display stars ★1–5) is distinct from the code-side spritesheet tier in `heroEmoji(heroId, tier)` (`sanguoEmojis.ts:1207`) | Standard Stack | Naming collision only; no functional coupling — spritesheet tier stays code-side default 0 |

**Planner/disuss-phase action:** A1 (fee table) and A2 (base-stats method) MUST be confirmed before the D-20 re-sign and the D-02 content task; A3–A8 are schema/service shapes the planner may adopt as recommended; A9 requires the balance sanity check; A10 is an env probe note.

## Open Questions

1. **Capture-fee tier values (D-20 BLOCKING)**
   - What we know: net-sink/neutral hard (D-19); gross magnitude bound ~416/hr averaged; encounter supply pull-driven ≤20/hr; new users start at 0 Linh thạch (economy-budget.md:17) — funding comes from the main game (football winnings), sanguo is a pure sink.
   - What's unclear: the exact 5-tier table + multipliers that satisfy the re-sign AND feel fair (players need affordable first captures; rare chase should drain).
   - Recommendation: adopt draft A1 as the starting table; the D-20 plan task computes `E[net/hour] = E[inflow] − E[outflow]` over the loop with the actual values, documents cadence assumptions (realistic human ~5–10 encounters/hr vs theoretical 20), and re-signs the document. User confirmation required (one-way gate).

2. **Base-stats + rarity content for 132 heroes (D-02)**
   - What we know: 8 base columns + rarity + public tier needed; class/role/faction data already seeded; TQC-09 precedent = researched data files + idempotent seed.
   - What's unclear: whether the user wants hand-tuned per-hero stats (research pass) or accepts class-template generation + prominence-tiered rarity (assumption A2).
   - Recommendation: default to A2 (template + committed JSON); escalate to full research only if the user requires TQC-09-grade fidelity per hero. Starter set (Tào Tháo/Lưu Bị/Tôn Kiên; set 2 Trương Giác/Viên Thiệu/Đổng Trác) must be seeded with starter-appropriate stats (names locked D-14).

3. **Boss thường stat block (D-13)**
   - What we know: boss encounters have `hero_id NULL` (`encounterRuns.ts:20-23`); boss battles must still run; boss capture is at "low rate consistent with high rarity".
   - What's unclear: the exact boss stat template.
   - Recommendation: A3 — zone-scaled boss template (rarity 5) in the content data file; keep engine agnostic.

4. **Hit/crit numeric balance vs actual base-stat ranges**
   - What we know: D-05 locks the principle (AGI ↑ hit+crit, defender AGI ↓) and the constants are agent discretion.
   - What's unclear: the actual AGI spread after the D-02 content pass determines whether the draft constants (A9) produce sensible hit/crit bands.
   - Recommendation: implement constants as exported config; the balance task (post-content-seed) sanity-checks with a small simulation over the seeded stat ranges before capture balancing.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime (discord.js ≥22.12.0 requirement) | ✅ | v26.3.0 (Current — differs from documented 22 LTS target; satisfies requirement) | — |
| npm | Install pure-rand 8.4.2 | ✅ | 11.16.0 | — |
| PostgreSQL | All schema/service work (migrations 0019+, wallet, battles, capture) | ✅ | localhost:5432 open | — |
| Redis | Travel check-in encounter cap (`sanguo:enc:win:{userId}` ZSET) — E2E only | ⚠️ | localhost:6379 CLOSED; `.env` `REDIS_URL` configured (remote assumed — not probed to avoid secrets) | Battle/capture core unit tests are DB-only; E2E needs the configured Redis |
| pure-rand | Battle engine | ✅ (registry OK) | 8.4.2 | — |
| Docker | Deployment only — NOT required for Phase 10 code | ❌ | not installed | — |

**Missing dependencies with no fallback:** none for the code path (Redis reachability affects only full E2E of the check-in chain; `.env` REDIS_URL is the production path).
**Missing dependencies with fallback:** Docker (deployment-only, out of scope for Phase 10 code); Redis local (use the configured `.env` REDIS_URL).

## Security Domain

> `security_enforcement` absent from config.json → enabled. This phase's security surface is small and mostly already-mandated (crypto RNG, wallet guards, server-authoritative state).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Discord handles identity; userId from interaction (existing pattern) |
| V3 Session Management | no | Interaction-scoped; no sessions |
| V4 Access Control | no | No admin surface in this phase |
| V5 Input Validation | yes | customId parsing with parseInt NaN guards (established `interactionCreate.ts` pattern); tier parsed from `sanguo:capture:tier:{n}` then validated server-side (1–5); zod where payload parsing is needed |
| V6 Cryptography | yes | `crypto.randomInt` CSPRNG for ALL player-facing rolls (capture %, flee, IV, wild IV, battle seed); pure-rand strictly battle-internal (D-06) |

### Known Threat Patterns for the battle/capture stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Predictable RNG manipulation (player computes rolls) | Tampering | Crypto CSPRNG exclusively for player-facing outcomes; pure-rand never outside `battleEngine.ts` |
| Crafted customId fee tampering (e.g. `sanguo:capture:tier:1` forged with wrong price intent) | Tampering | Fee NEVER in customId — tier number only; fee + chance resolved server-side from pending-encounter state inside the tx (UI-SPEC contract) |
| Capture double-spend / concurrent attempt race | Tampering | Single-writer `FOR UPDATE` on the pending encounter row; status transition WHERE-guarded; wallet WHERE-guard + rowCount (`wallet.ts:53-62`) |
| Client-influenced RNG (roll based on client-reported HP/state) | Spoofing | Server-authoritative: wild HP from the stored battle result, pity from `encounter_runs`, fee from config — nothing from the interaction payload |
| Audit evasion (failed attempts hidden) | Repudiation | `capture_attempts` row for EVERY attempt incl. failures (TQC-11/SC2); wallet ledger row per fee (D-03) |

## Sources

### Primary (HIGH confidence)
- [Context7 library ID: n/a for pure-rand (not indexed)] — official README fetched: https://github.com/dubzzz/pure-rand (README.md raw, 2026-08-13) — API verified verbatim
- [npm registry] — `npm view pure-rand` (8.4.2, modified 2026-07-10, repo dubzzz/pure-rand) + package-legitimacy gate OK (65.5M wk downloads, no postinstall)
- [In-repo code, read this session] — `src/db/schema/{heroes,userHeroes,sanguoBattles,encounterRuns,playerTravelState,walletTransactions,sanguoItems,userSanguoItems}.ts`, `src/services/{wallet,sanguo/encounterService,sanguo/travelCheckInService,sanguo/travelService}.ts`, `src/commands/sanguo/{map,travel}.ts`, `src/events/interactionCreate.ts`, `src/ui/theme.ts`, `src/ui/components/sanguoTravelButtons.ts`, `src/ui/embeds/buildSanguo{Encounter,Ack}Embed.ts`, `src/assets/sanguoEmojis.ts:1206-1247`, `scripts/seed-sanguo.ts:1-100`, `package.json`, `drizzle.config.ts`, `vitest.config.ts`, `.env.example`, `docs/economy-budget.md`, `.planning/{CONTEXT,REQUIREMENTS,STATE,ROADMAP,UI-SPEC,notes/sanguo-game-design}.md`

### Secondary (MEDIUM confidence)
- [CITED: bulbapedia.bulbagarden.net/wiki/Catch_rate] — Pokemon Gen III–V catch formula incl. HP factor `(3×HPmax − 2×HPcurrent)/(3×HPmax)`; lower HP → higher chance; ball multipliers (corroborated by Catch_rate_(GO) + Talk:Catch_rate)
- [CITED: .planning/research/SUMMARY.md] — pure-rand 8.4.2 as the pre-identified battle dependency; rarity distribution 60/25/10/4/1 as starting values; Pitfall 3 (capture manipulation) mapping

### Tertiary (LOW confidence)
- Draft numeric values (A1, A9) — agent-discretion pricing/formulas derived from D-05 principle + Pokemon standards; MUST be confirmed via D-20 re-sign / balance pass before content ships

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure-rand verified on registry + official README; all other libs already installed and read
- Architecture: HIGH — schema/service/flow anchored to locked D-01..D-20 and read-verified integration points
- Pitfalls: HIGH — 8 of 9 pitfalls are grounded in read-verified in-repo facts (CR-09 fixes, single-writer rule, D-12, F2 index); pricing/balance numerics are MEDIUM (agent discretion)

**Research date:** 2026-08-13
**Valid until:** 2026-09-12 (30 days — stack stable; pure-rand 8.x stable)
