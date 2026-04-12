# Phase 2: Core Game Loop + Progression - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers a **playable game** — players register a character, accumulate tu vi passively through real Discord activity, advance through cảnh giới with breakthrough mechanics, develop professions, gather materials, and craft items (including unique custom items).

**Requirements in scope:** CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08, PROG-01, PROG-02, PROG-03, PROG-04, PROG-05, PROG-06, PROG-07, PROG-08

**Not in scope:** Combat (Phase 3), Marketplace trading (Phase 3), Season resets (Phase 4), Monetization/purchased linh thạch (v2).

</domain>

<decisions>
## Implementation Decisions

### Tu Vi Accumulation Rates

- **D-01:** Base tu vi rates (global constants, hidden from players — not displayed anywhere in UI):
  - Message (valid, ≥10 chars): **10 tu vi**
  - Voice (per active minute, up to 60 min/session): **5 tu vi/min**
  - Reaction (valid): **2 tu vi**
  - Daily cap: **10,000 tu vi** (hard ceiling, resets at midnight UTC)
- **D-02:** Spiritual root multipliers applied to all tu vi sources (flat multiplier, not displayed — hidden game mechanic):
  - Kim (Metal): **1.2×**
  - Hỏa (Fire): **1.15×**
  - Mộc (Wood): **1.1×**
  - Thủy (Water): **1.05×**
  - Thổ (Earth): **1.0×** (balanced root, no bonus)
- **D-03:** All rate constants live in a single config file (e.g., `src/config/game.ts` or `src/constants/tuvi.ts`) — never scattered inline. Easy to tune without hunting down magic numbers.
- **D-04:** Spiritual root displayed in `/profile` as the **name only** (e.g., "Kim Cương Linh Căn") — no multiplier numbers shown to player. It's a character identity/flavor element.

### Anti-Farming Pipeline Architecture

- **D-05:** **Two-tier pipeline** — fire-and-forget from event handlers:
  1. Event fires (messageCreate / voiceStateUpdate / messageReactionAdd)
  2. Redis fast-path check via `tryAcquireCooldown()` (existing `src/cache/cooldown.ts`)
  3. If Redis passes → enqueue `ActivityJob` to pg-boss → return immediately (no await on DB)
  4. If Redis rejects → silently drop (user is on cooldown)
- **D-06:** **ActivityWorker** (`src/workers/activityWorker.ts`) processes the pg-boss queue with **`localConcurrency: 5`** — per-user `SELECT FOR UPDATE` in each job prevents races while allowing 5 jobs to run in parallel across different users. (Original decision specified `concurrency: 1`; implementation uses `localConcurrency: 5` with row-level locking, which is safe and faster.)
- **D-07:** ActivityWorker executes **4 anti-farming layers in sequence** for each job (Layer 1 was removed):
  1. ~~**Redis cooldown re-verify**~~ — **REMOVED**: Layer 1 (re-verify `getCooldownTTL` in the worker) was removed. The Redis fast-path in the event handler is sufficient; re-verifying in the worker added latency with no meaningful gain (Redis wipes during restart still handled by Layer 2 DB check).
  2. **DB cooldown check** — `characters.last_message_at` per-channel (60s minimum, DB-backed, survives restart)
  3. **Message quality gate** — ≥10 chars, no repeating-character-runs (e.g., "aaaaaaa"), no duplicate content within 5 minutes for this user
  4. **Daily cap atomic check+increment** — `UPDATE characters SET daily_tuvi = daily_tuvi + $amount WHERE id = $1 AND daily_tuvi + $amount <= 10000 RETURNING daily_tuvi` — atomic, no double-counting
  5. **Voice activity check** — for voice events: verify user is not muted/deafened (AFK farming prevention); for message/reaction events: skip this layer
- **D-08:** DB-backed cooldown state stored on the `characters` table: `last_message_at TIMESTAMPTZ`, `last_reaction_at TIMESTAMPTZ` — per-user, not per-channel (channel-level granularity tracked in Redis only; DB tracks the last-activity timestamp for restart recovery).
- **D-09:** Anomaly detection flag: if a user triggers the quality gate or daily cap 10+ times in a day, set `characters.anomaly_flag = true` for admin review (satisfies CORE-05 anomaly detection requirement). No automated ban — flag for human review only.

### Cảnh Giới (Realm) Structure

- **D-10:** **12 major realms, 42 total tiers** *(corrected post-research: 9 + 11×3 = 42)*:

  | Realm | Tiers | Tier Names |
  |-------|-------|------------|
  | Luyện Khí | 9 | Tầng Một, Tầng Hai, ..., Tầng Chín |
  | Trúc Cơ | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Kim Đan | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Nguyên Anh | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Hóa Thần | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Luyện Hư | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Vấn Đỉnh | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Đại Thừa | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Bán Tiên | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Địa Tiên | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Chân Tiên | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |
  | Đại La Tiên | 3 | Sơ Kỳ, Trung Kỳ, Hậu Kỳ |

- **D-11:** Realm stored as **integer ID 0–41** in the `characters` table (`realm_id SMALLINT`). Realm metadata (i18n key, tier number within major realm, major realm index) in a **code-level config constant** (`src/constants/realms.ts`) — not a DB table.
- **D-12:** Display names come from i18n lookup keys. Example: `game:realms.luyen_khi.tang_1` = "Luyện Khí Tầng Một". All 42 keys must exist in VI, EN, ZH-CN locale files. (12th realm: `game:realms.dai_la_tien.so_ky` etc.)
- **D-13:** Tu vi threshold curve: **agent designs an exponential curve** anchored to the daily cap of 10,000 tu vi. Luyện Khí should take days of active play; reaching Trúc Cơ should take weeks; upper realms (Đại Thừa+) are legendary-scale goals within a season. Exact thresholds stored in `src/constants/realms.ts`.
- **D-14:** Full 42-tier tree exists from **Season 1**. No tier gating. Upper realms serve as legendary aspirational goals — most players won't reach them in a season.

### Breakthrough Mechanics

- **D-15:** **Failure risk applies only to major realm transitions** (e.g., Luyện Khí Tầng Chín → Trúc Cơ Sơ Kỳ). Tier-within-realm advancement (e.g., Trúc Cơ Sơ Kỳ → Trung Kỳ) is always safe — no failure risk.
- **D-16:** **Failure probability table** (major realm boundary crossings):

  | Transition | Fail % |
  |------------|--------|
  | Luyện Khí → Trúc Cơ | 0% |
  | Trúc Cơ → Kim Đan | 20% |
  | Kim Đan → Nguyên Anh | 40% |
  | Nguyên Anh → Hóa Thần | 60% |
  | Hóa Thần → Luyện Hư | 70% |
  | Luyện Hư → Vấn Đỉnh | 75% |
  | Vấn Đỉnh → Đại Thừa | 80% |
  | Đại Thừa → Bán Tiên | 85% |
  | Bán Tiên → Địa Tiên | 88% |
  | Địa Tiên → Chân Tiên | 90% |
  | Chân Tiên → Đại La Tiên | 93% |

  *(Agent defines exact Luyện Hư+ values; suggested curve shown above for the upper realms)*

- **D-17:** **Failure penalty:** lose 50% of the tu vi accumulated **above the current realm's entry threshold**. Player stays at Hậu Kỳ of the current major realm. No tu vi drop below the realm entry threshold.
- **D-18:** **No retry cooldown** — player must naturally grind back the lost tu vi before attempting again. Organic pacing; no time-gating.
- **D-19:** Breakthrough command: `/đột_phá`. Success/failure outcomes rendered with thematic i18n text (locale key `game:breakthrough.success`, `game:breakthrough.fail`). Both outcomes show the new realm (or unchanged realm) in the response.

### Currency

- **D-20:** **Single linh thạch currency for v1.** The existing `users.balance BIGINT` column from Phase 1 is the sole currency field. No second balance column added in Phase 2.
- **D-21:** Purchased linh thạch (MONET-01..04) remains v2 scope. Phase 2 does not add any purchased/earned split logic or schema columns.

### Profession & Crafting Model

- **D-22:** **All 10 professions are available to every character.** No locking, no exclusivity. A player can invest points in any combination.
- **D-23:** The **10 professions:**
  1. Luyện Đan — pill crafting (consumable effects)
  2. Luyện Khí — qi refinement tools (passive cultivation aids)
  3. Trận Pháp — formation arrays (defensive/trapping items)
  4. Linh Trù — spirit cooking (food/buff items)
  5. Luyện Cổ — artifact refinement (rare instruments)
  6. Dược Sư — herb cultivation (grows ingredient materials in spirit fields)
  7. Thuần Thú — beast taming (companions/mounts)
  8. Luyện Kim — metal refinement (weapon/armor materials)
  9. Khai Linh — spirit stone excavation (passive bonus stones)
  10. Thuật Sư — divination (fortune/buff scrolls)
- **D-24:** **Skill points:** 1 point per realm tier advanced (lifetime total = realm_id). No respec in v1. Player allocates points freely across any of the 10 professions. Stored as `characters.profession_points JSONB` (e.g., `{"luyen_dan": 3, "luyen_kim": 2}`).
- **D-25:** **Item & inventory schema:**
  - `items` — master item catalog: `item_id`, `name_i18n_key`, `type` (enum: material, consumable, equipment, formation, stone, scroll, companion, food, artifact), `base_price BIGINT`, `is_unique BOOLEAN DEFAULT false`, `creator_character_id` (nullable FK → characters), `custom_name VARCHAR(50)` (nullable), `custom_emoji VARCHAR(100)` (nullable), `attributes JSONB` (nullable — random rolls for unique items), `created_at TIMESTAMPTZ` (nullable — populated for unique items)
  - `character_items` — inventory: `character_id FK`, `item_id FK`, `quantity INT`
  - `recipes` — `recipe_id`, `result_item_id FK`, `profession_type` (which profession unlocks this recipe), `min_profession_level INT`
  - `recipe_ingredients` — `recipe_id FK`, `item_id FK`, `quantity INT`
- **D-26:** **Unique item crafting:**
  - Unique items have `is_unique = true`, `creator_character_id` set, `custom_name` and `custom_emoji` provided by the player at crafting time, `base_price = 0`
  - `attributes` JSONB contains random rolls from a **per-profession, per-item-type attribute pool** (defined in `src/constants/itemAttributes.ts`)
  - Trigger probability scales with profession level: agent designs the exact curve (suggested: 1% at level 1, ~5% at level 10, ~15% at level 42)
  - Each profession produces its own unique item archetype (agent designs the full per-profession item type + attribute pool in `src/constants/itemAttributes.ts`)
- **D-27:** **Gathering commands** (`/thu_thap`, `/dao_mo`, etc.) are profession-gated: minimum profession level required varies by material tier. Gathering yield depends on realm + profession level combo. Agent designs the yield formula.

### Character Schema (New DB Tables — Phase 2 Migrations)

- **D-28:** New Drizzle schema files for Phase 2 (in `src/db/schema/`):
  - `characters.ts` — core character data
  - `items.ts` — item master catalog
  - `character_items.ts` — inventory
  - `recipes.ts` + `recipe_ingredients.ts` — crafting recipes
  - `activity_cooldowns.ts` — per-user DB-backed cooldown tracking (alternative: add columns to characters.ts)
- **D-29:** `characters` table columns include at minimum:
  - `id SERIAL PK`
  - `user_id FK → users.id`
  - `discord_id VARCHAR(20)` (denormalized for fast lookups)
  - `spiritual_root ENUM('kim','moc','thuy','hoa','tho')`
  - `realm_id SMALLINT DEFAULT 0` (0 = Luyện Khí Tầng Một)
  - `tu_vi BIGINT DEFAULT 0`
  - `daily_tuvi INT DEFAULT 0` (reset each day)
  - `daily_tuvi_reset_at TIMESTAMPTZ` (tracks when daily_tuvi was last reset)
  - `profession_points JSONB DEFAULT '{}'`
  - `last_message_at TIMESTAMPTZ` (DB-backed cooldown)
  - `last_reaction_at TIMESTAMPTZ`
  - `voice_session_started_at TIMESTAMPTZ` (nullable — set when voice session begins)
  - `anomaly_flag BOOLEAN DEFAULT false`
  - `streak_days INT DEFAULT 0`
  - `last_active_date DATE`
  - `created_at TIMESTAMPTZ DEFAULT now()`

### Agent's Discretion

- Exact exponential tu vi threshold curve for all 42 realm tiers (anchored to 10,000/day cap and week-scale Trúc Cơ target)
- Exact failure probabilities for Luyện Hư → Vấn Đỉnh and above (suggested curve in D-16)
- Per-profession unique item archetypes and attribute pools (in `src/constants/itemAttributes.ts`)
- Unique item trigger probability curve by profession level
- Gathering yield formula (realm × profession level)
- Exact DB structure for activity_cooldowns (either a separate table or columns on characters)
- `/profile` embed layout — what fields to show, order, visual density (must use `src/ui/embeds/` builder pattern and `src/ui/theme.ts`)
- `/bxh` leaderboard pagination and display format
- Daily streak bonus amount and calculation logic (CORE-07)
- Spiritual root assignment algorithm at `/start` — random weighted or player choice? If choice: how many options shown? (agent decides)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — Stack decisions (Node 22, discord.js 14.26.2, TS 5.8.x, Drizzle, ioredis, pg-boss, i18next, Zod), Key Decisions table
- `.planning/REQUIREMENTS.md` — Phase 2 requirements: CORE-01..08, PROG-01..08 with acceptance criteria
- `.planning/ROADMAP.md` §Phase 2 — Goal, Success Criteria, Notes (critical anti-farming sequencing, activity pipeline pattern, realm i18n requirement, spiritual root enum, breakthrough probability suggestion, currency question)

### Phase 1 Foundation (Prior Context)
- `.planning/phases/01-foundation/01-CONTEXT.md` — All locked structural decisions: D-01 (src/ structure), D-05 (schema-per-domain), D-11 (locale resolution), D-13 (ESLint i18n enforcement), D-14..D-17 (embed/emoji/theme patterns)

### Existing Code (Integration Points)
- `src/cache/cooldown.ts` — Existing Redis fast-path cooldown (tryAcquireCooldown, getCooldownTTL) — Phase 2 ActivityWorker calls this
- `src/cache/redis.ts` — Redis client instance
- `src/db/schema/users.ts` — Existing users table (id, discord_id, balance BIGINT, locale)
- `src/db/schema/seasons.ts` — Existing seasons table
- `src/workers/pgBoss.ts` — pg-boss instance — ActivityWorker registers with this
- `src/ui/theme.ts` — Color palette + embedFooter — all Phase 2 embeds must import from here
- `src/i18n/index.ts` — resolveLocale(), getT() — all Phase 2 commands must use these

### No external specs
No ADRs or external design documents yet — all requirements and decisions captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cache/cooldown.ts` — `tryAcquireCooldown(userId, channelId, cooldownMs)` and `getCooldownTTL()` — ActivityWorker uses these as the L1 Redis check
- `src/ui/embeds/buildErrorEmbed.ts` and `buildSuccessEmbed.ts` — extend with `buildProfileEmbed()`, `buildLeaderboardEmbed()`, `buildBreakthroughEmbed()`, etc.
- `src/ui/theme.ts` — COLORS.PRIMARY, COLORS.GOLD, COLORS.SUCCESS, COLORS.DANGER defined; embedFooter() available
- `src/i18n/index.ts` — `resolveLocale()`, `getT()` — locale resolution fully wired; `game` namespace already declared in i18next init
- `src/utils/commandLoader.ts` — auto-discovers `src/commands/**/*.ts` — Phase 2 commands drop into `src/commands/game/`
- `src/utils/format.ts` — `formatBalance()` for BIGINT display — use for tu vi amounts too

### Established Patterns
- **Schema per domain**: `src/db/schema/characters.ts`, `src/db/schema/items.ts`, etc. (following D-05)
- **Command autodiscovery**: commands drop into `src/commands/game/` subfolder, auto-registered (D-03)
- **Embed builders**: typed functions in `src/ui/embeds/`, import from theme.ts (D-16, D-17)
- **Config validation**: Zod schema at startup in `src/config.ts` — game constants also validated here (D-06)
- **pg-boss workers**: `src/workers/pgBoss.ts` initializes boss; ActivityWorker follows same pattern as existing workers

### Integration Points
- `messageCreate` / `voiceStateUpdate` / `messageReactionAdd` Discord events → fire-and-forget enqueue to pg-boss ActivityWorker
- `characters` table ← center of Phase 2 game state; all game commands query/mutate this
- Phase 3 (Combat + Marketplace) will reference: `items`, `character_items`, `characters.realm_id` (realm-gating for marketplace/combat)
- i18n `game` namespace: 42 realm i18n keys must be populated in VI/EN/ZH-CN before any realm display works

</code_context>

<specifics>
## Specific Ideas

- **Realm naming specifics**: Luyện Khí uses "Tầng Một" through "Tầng Chín" (ordinal naming); all other major realms use "Sơ Kỳ / Trung Kỳ / Hậu Kỳ" sub-divisions. This naming must be reflected in all 42 i18n keys.
- **Unique item identity**: Players name their unique crafted items and assign an emoji — this is intentionally a social/identity feature. The item card in `/kho` (inventory) and marketplace (Phase 3) should display creator name and creation date prominently. It's part of the game's social fabric.
- **Anti-farming is non-negotiable day-one**: ROADMAP explicitly states "anti-farming ships WITH accumulation, never after." The ActivityWorker with all 5 layers must be live before the first `messageCreate` handler is deployed. Never ship accumulation without the full guard stack.
- **Hidden mechanics philosophy**: Tu vi rates, spiritual root multipliers, and unique item chance percentages are intentionally hidden from players. They should feel like a discovery, not a spreadsheet optimization. Only show outcome, not the formula.
- **Embed visual quality**: Phase 1 specifics (D-16/D-17) established a visual quality standard — "scientifically/aesthetically clean." Profile, leaderboard, and breakthrough embeds in Phase 2 must maintain this bar.

</specifics>

<deferred>
## Deferred Ideas

- **Spiritual root assignment at `/start`** — Whether this is random or player-choice from a limited pool was noted as agent's discretion. If player-choice, the UX (button select vs. slash option) is deferred to the planner.
- **Respec mechanic** — User did not request this, but profession skill respec was explicitly noted as "no respec in v1." Could be a v2 paid feature (consumes purchased linh thạch).
- **Achievement/broadcast system** — Reaching a new major realm could broadcast to the server. Noted in REQUIREMENTS.md as SOCIAL-02 (v2 scope). Not in Phase 2.
- **Guild/môn phái system** — Out of scope per REQUIREMENTS.md (v2).
- **Per-guild tu vi rate overrides** — Considered during discussion, deferred. Global constants only for v1.

</deferred>

---

*Phase: 02-core-game-loop-progression*
*Context gathered: 2026-04-12*
