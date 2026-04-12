# Phase 2: Core Game Loop + Progression — Research

**Researched:** 2026-04-12
**Domain:** Discord event pipelines, pg-boss workers, Drizzle ORM atomic updates, xianxia progression mechanics
**Confidence:** HIGH (all stack claims verified against Context7 + existing codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tu Vi Rates (D-01..D-04):**
- Message (≥10 chars): 10 tu vi | Voice: 5/min (max 60 min/session) | Reaction: 2 tu vi
- Daily cap: 10,000 tu vi — hard ceiling, resets midnight UTC
- Spiritual root multipliers: Kim 1.2×, Hỏa 1.15×, Mộc 1.1×, Thủy 1.05×, Thổ 1.0×
- All rate constants in `src/config/game.ts` — never scattered inline
- Spiritual root displayed as name only in /profile — no multiplier numbers shown

**Anti-Farming (D-05..D-09):**
- Two-tier pipeline: Redis fast-path → pg-boss ActivityWorker (concurrency: 1)
- 5 layers in sequence: Redis re-verify, DB cooldown check (last_message_at per-user), content quality gate (≥10 chars, no repeating runs, no dup in 5min), daily cap atomic check+increment, voice AFK check
- DB-backed cooldowns survive shard restart — Redis is L1 cache only
- Anomaly flag after 10+ quality/cap violations per day

**Realm Structure (D-10..D-14):**
- 11 major realms, 42 total tiers, realm_id SMALLINT 0–41
- Luyện Khí: 9 tiers (Tầng Một–Tầng Chín)
- Remaining 10 realms: Sơ Kỳ / Trung Kỳ / Hậu Kỳ each
- Realm metadata in `src/constants/realms.ts` — NOT a DB table
- Display names from i18n lookup keys (e.g., `game:realms.luyen_khi.tang_1`)

**Breakthrough (D-15..D-19):**
- Failure only at major realm boundary crossings (not minor tier advances)
- Failure table: LK→TC 0%, TC→KD 20%, KD→NA 40%, NA→HT 60%, HT→LH 70%, LH→VD 75%, VD→DT 80%, DT→BT 85%, BT→DT 88%, DT→CT 90%
- Failure penalty: lose 50% of excess tu vi above current realm's entry threshold
- Command: `/đột_phá` — success/fail from i18n `game:breakthrough.success/fail`

**Currency (D-20..D-21):**
- Single `users.balance BIGINT` — no second column in Phase 2

**Professions & Crafting (D-22..D-27):**
- 10 professions, all available, no lock/exclusivity
- 1 skill point per realm tier (lifetime total = realm_id)
- No respec in v1
- `characters.profession_points JSONB` e.g., `{"luyen_dan": 3, "luyen_kim": 2}`
- Unique items: is_unique, creator_character_id, custom_name, custom_emoji, attributes JSONB, base_price=0

**DB Schema (D-28..D-29):**
- New files: characters.ts, items.ts, character_items.ts, recipes.ts, recipe_ingredients.ts
- characters columns include: realm_id SMALLINT, tu_vi BIGINT, daily_tuvi INT, daily_tuvi_reset_at, profession_points JSONB, last_message_at, last_reaction_at, voice_session_started_at (nullable), anomaly_flag, streak_days, last_active_date

### Agent's Discretion
- Exact tu vi threshold curve (all 42 tiers) — **designed in this research**
- Failure probabilities for LH→VD and above — provided in D-16, accepted as-is
- Per-profession unique item archetypes + attribute pools — **designed in this research**
- Unique item trigger probability curve by profession level — **designed in this research**
- Gathering yield formula — **designed in this research**
- /profile embed layout — use `src/ui/embeds/` builder pattern + `src/ui/theme.ts`
- /bxh leaderboard pagination and display format
- Daily streak bonus amount — **designed in this research**
- Spiritual root assignment at /start: random weighted assignment (agent decision)

### Deferred Ideas (OUT OF SCOPE)
- Respec mechanic (v2 paid feature)
- Achievement/broadcast on realm advance (SOCIAL-02, v2)
- Guild/môn phái system (v2)
- Per-guild tu vi rate overrides
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-01 | Each valid message accumulates tu vi | ActivityWorker pipeline pattern, Drizzle atomic UPDATE |
| CORE-02 | Each active voice minute accumulates tu vi (max 60 min/session) | Voice session lifecycle pattern, pg-boss VoiceWorker |
| CORE-03 | Each valid reaction accumulates tu vi | Same ActivityWorker pipeline as CORE-01 |
| CORE-04 | Anti-farming: DB-backed cooldown, daily cap | 5-layer ActivityWorker with atomic cap check, Redis NX fast-path |
| CORE-05 | Anti-farming: bot exclusion, spam filter, anomaly detection | Content quality gate (Layer 3), anomaly_flag pattern |
| CORE-06 | /profile command: tu vi, realm, spiritual root, stats | buildProfileEmbed() builder, i18n realm keys, EmbedBuilder fields |
| CORE-07 | Daily streak: reward for ≥1 activity/day consecutive | streak_days + last_active_date columns, streak reset logic in ActivityWorker |
| CORE-08 | /start: register character, choose spiritual root | StringSelectMenuBuilder (or weighted random), characters table INSERT |
| PROG-01 | 42-tier cảnh giới system | realm constants file, i18n keys, threshold curve |
| PROG-02 | Breakthrough with failure probability | Failure table in realms.ts, random check, tu vi penalty calculation |
| PROG-03 | Spiritual root assigned at /start, affects accumulation | pgEnum spiritual_root, multiplier applied in ActivityWorker |
| PROG-04 | /bxh leaderboard (guild + global) | Drizzle ORDER BY tu_vi DESC LIMIT with pagination, ButtonBuilder |
| PROG-05 | 10 professions, skill point allocation | profession_points JSONB, /nghề_nghiệp command |
| PROG-06 | Gathering commands (profession + realm gated) | Gathering yield formula, cooldown per-profession, character_items INSERT |
| PROG-07 | Crafting: combine materials per recipe | recipes + recipe_ingredients tables, transaction-based craft |
| PROG-08 | Profession skill tree specialization (10 branches) | profession_points JSONB design, per-profession attribute pools |
</phase_requirements>

---

## Summary

Phase 2 is the largest phase in the project: 16 requirements covering character registration, passive tu vi accumulation across three Discord activity types, a 42-tier realm progression system, breakthrough mechanics, 10 professions, gathering, and crafting. The foundational infrastructure from Phase 1 (pg-boss, Redis, Drizzle, i18n) is fully in place — this phase builds the game on top of it.

The most critical architectural constraint is the **ActivityWorker anti-farming pipeline**. All three event types (message, voice, reaction) must go through the same 5-layer sequential guard stack before any tu vi is awarded. The pipeline is fire-and-forget from shard handlers (event → Redis NX check → pg-boss enqueue → return) with all game logic executing in the ActivityWorker in `bot.ts`. This keeps shard handlers non-blocking and game state deterministic.

The second architectural challenge is **voice session tracking** in a stateless shard environment. Shards cannot hold timers. The correct pattern uses DB-backed session timestamps (`voice_session_started_at`) with a pg-boss periodic VoiceMinuteWorker that scans active sessions every 1 minute and awards tu vi for elapsed time, while voiceStateUpdate events handle join/leave state transitions.

**Primary recommendation:** Build in order — (1) Drizzle schema migrations, (2) ActivityWorker with all 5 layers, (3) event handlers that feed it, (4) slash commands that read the character state. Never ship event handlers without the ActivityWorker live.

---

## Standard Stack

### Core (All Already Installed — No New Dependencies)

| Library | Version | Purpose | Integration Point |
|---------|---------|---------|-------------------|
| discord.js | **14.26.2** | Event handlers, slash commands, embeds, component builders | `src/events/`, `src/commands/game/` |
| drizzle-orm | **0.45.2** | Schema definitions, atomic updates, transactions | `src/db/schema/characters.ts` (new) |
| pg-boss | **12.15.0** | ActivityWorker, VoiceMinuteWorker job queues | `src/workers/activityWorker.ts` (new) |
| ioredis | **5.10.1** | Redis fast-path cooldown (tryAcquireCooldown) | `src/cache/cooldown.ts` (existing) |
| i18next | **26.0.4** | Realm display names, all UI strings | `src/i18n/index.ts` (existing) |
| zod | **4.3.6** | Game config constants validation at startup | `src/config.ts` (extend) |

[VERIFIED: package.json — all packages at these exact versions]

### No New Production Dependencies Required
Phase 2 adds zero new npm packages. All required functionality is covered by Phase 1's installed stack.

[VERIFIED: reviewed all Phase 2 requirements against installed packages — no gaps]

---

## Architecture Patterns

### Recommended Project Structure (Phase 2 Additions)

```
src/
├── commands/game/
│   ├── ping.ts             # Phase 1 (exists)
│   ├── start.ts            # /start — character registration
│   ├── profile.ts          # /profile — character info
│   ├── dotpha.ts           # /đột_phá — breakthrough
│   ├── bxh.ts              # /bxh — leaderboard
│   ├── nghenghiep.ts       # /nghề_nghiệp — profession management
│   ├── thutap.ts           # /thu_thập — gathering
│   └── cheotao.ts          # /chế_tạo — crafting
├── constants/
│   ├── game.ts             # Rates, caps, multipliers (D-03)
│   ├── realms.ts           # 42-tier threshold curve, major realm config
│   └── itemAttributes.ts   # Per-profession unique item attribute pools (D-26)
├── db/schema/
│   ├── users.ts            # Phase 1 (exists)
│   ├── seasons.ts          # Phase 1 (exists)
│   ├── characters.ts       # NEW — core character state
│   ├── items.ts            # NEW — item master catalog
│   ├── character_items.ts  # NEW — player inventory
│   ├── recipes.ts          # NEW — crafting recipes
│   ├── recipe_ingredients.ts # NEW — recipe materials
│   └── index.ts            # Re-export all schemas
├── events/
│   ├── interactionCreate.ts # Phase 1 (extend for button/select)
│   ├── messageCreate.ts    # NEW — fire-and-forget to ActivityWorker
│   ├── voiceStateUpdate.ts # NEW — session start/end tracking
│   └── messageReactionAdd.ts # NEW — fire-and-forget to ActivityWorker
├── workers/
│   ├── pgBoss.ts           # Phase 1 (extend — register ActivityWorker)
│   ├── activityWorker.ts   # NEW — 5-layer anti-farming guard
│   └── voiceWorker.ts      # NEW — periodic voice minute awards
├── ui/embeds/
│   ├── buildErrorEmbed.ts  # Phase 1 (exists)
│   ├── buildSuccessEmbed.ts # Phase 1 (exists)
│   ├── buildProfileEmbed.ts # NEW
│   ├── buildLeaderboardEmbed.ts # NEW
│   ├── buildBreakthroughEmbed.ts # NEW
│   └── buildItemEmbed.ts   # NEW
└── utils/
    └── realmUtils.ts       # NEW — realm ID → i18n key, major realm detection
```

---

### Pattern 1: Activity Event Pipeline (CRITICAL — Must Build First)

**What:** All Discord activity events funnel through a two-tier anti-farming system. Shard handlers are fire-and-forget; all game logic runs in the ActivityWorker in `bot.ts`.

**When to use:** Every messageCreate, messageReactionAdd, voiceStateUpdate

```typescript
// Source: Architecture decision D-05..D-09 + pg-boss docs (Context7: /timgit/pg-boss)

// ── shard.ts event handler (src/events/messageCreate.ts) ──
import { Events, type Message } from 'discord.js';
import { tryAcquireCooldown } from '../cache/cooldown.js';
import { boss } from '../workers/pgBoss.js';

export const name = Events.MessageCreate;

export async function execute(message: Message): Promise<void> {
  // CORE-05: immediate bot/DM/short filters (no DB I/O)
  if (message.author.bot) return;
  if (!message.guildId) return;  // DMs ignored
  if (message.content.length < 10) return;

  // L1: Redis NX fast-path cooldown (60,000ms = 60s per channel)
  const allowed = await tryAcquireCooldown(
    message.author.id,
    message.channelId,
    60_000,  // MESSAGE_COOLDOWN_MS from game.ts
  );
  if (!allowed) return;  // silently drop

  // Fire-and-forget — NO await, NO DB
  void boss!.send('activity-queue', {
    type: 'message',
    userId: message.author.id,
    guildId: message.guildId,
    channelId: message.channelId,
    content: message.content,
    timestamp: Date.now(),
  }, { expireInSeconds: 120 });  // stale jobs auto-expire
}
```

```typescript
// ── bot.ts — ActivityWorker registration (src/workers/activityWorker.ts) ──
// Source: pg-boss docs (Context7: /timgit/pg-boss)

import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import { db } from '../db/client.js';
import { characters } from '../db/schema/characters.js';
import { tryAcquireCooldown, getCooldownTTL } from '../cache/cooldown.js';
import { GAME_CONFIG } from '../constants/game.js';
import { eq, sql, and } from 'drizzle-orm';

export type ActivityJobData = {
  type: 'message' | 'reaction' | 'voice_leave';
  userId: string;
  guildId: string;
  channelId: string;
  content?: string;
  timestamp: number;
  // voice fields
  selfMute?: boolean;
  selfDeaf?: boolean;
  sessionDurationMs?: number;
};

export async function registerActivityWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue('activity-queue');
  await boss.work(
    'activity-queue',
    { localConcurrency: 1 },  // Serial — prevents race on daily cap
    async ([job]: Job<ActivityJobData>[]) => {
      await processActivityJob(job.data);
    },
  );
}

async function processActivityJob(data: ActivityJobData): Promise<void> {
  // Layer 1: Redis cooldown re-verify (confirms Redis wasn't wiped mid-restart)
  const ttl = await getCooldownTTL(data.userId, data.channelId);
  if (ttl > 0) return;  // Redis still has key — already processed recently

  // Layer 2: Fetch character (needed for all subsequent layers)
  const [char] = await db
    .select()
    .from(characters)
    .where(eq(characters.discordId, data.userId));
  if (!char) return;  // User not registered

  // Layer 2: DB-backed cooldown check
  if (data.type === 'message' && char.lastMessageAt) {
    const msSinceLast = data.timestamp - char.lastMessageAt.getTime();
    if (msSinceLast < GAME_CONFIG.MESSAGE_COOLDOWN_MS) return;
  }

  // Layer 3: Content quality gate (message type only)
  if (data.type === 'message' && data.content) {
    if (!isContentValid(data.content, char)) return;
  }

  // Layer 4: Voice AFK check
  if (data.type === 'voice_leave') {
    if (data.selfMute || data.selfDeaf) {
      // Reduce award for muted sessions — still some reward for partial activity
    }
  }

  // Compute tu vi amount with spiritual root multiplier
  const base = getTuviAmount(data);
  const multiplier = GAME_CONFIG.SPIRITUAL_ROOT_MULTIPLIERS[char.spiritualRoot];
  const amount = Math.floor(base * multiplier);

  // Layer 4 (cont): Daily cap atomic check+increment — RETURNING pattern
  // Source: Drizzle ORM docs (Context7: /drizzle-team/drizzle-orm-docs)
  const [updated] = await db
    .update(characters)
    .set({
      tuVi: sql`${characters.tuVi} + ${amount}`,
      dailyTuvi: sql`${characters.dailyTuvi} + ${amount}`,
      lastMessageAt: data.type === 'message' ? sql`now()` : undefined,
      lastReactionAt: data.type === 'reaction' ? sql`now()` : undefined,
    })
    .where(
      and(
        eq(characters.id, char.id),
        // Daily cap atomic guard: only updates if cap not exceeded
        sql`${characters.dailyTuvi} + ${amount} <= ${GAME_CONFIG.DAILY_CAP}`,
      ),
    )
    .returning({ dailyTuvi: characters.dailyTuvi, tuVi: characters.tuVi });

  if (!updated) {
    // Daily cap hit — track anomaly
    await incrementAnomalyCounter(char.id);
    return;
  }

  // Layer 5: Update streak
  await updateStreak(char.id, data.timestamp);
}
```

**Key insight:** `RETURNING []` (empty array) means the WHERE condition failed = daily cap hit. This is the only correct atomic pattern — never read-then-write for cap checks.

---

### Pattern 2: Voice Session Lifecycle

**What:** Voice activity awards 5 tu vi/minute (max 60 min/session). Shards are stateless — no intervals. Session state lives in `characters.voice_session_started_at`. A periodic pg-boss VoiceMinuteWorker polls active sessions.

**When to use:** voiceStateUpdate event handler + periodic pg-boss job

```typescript
// Source: discord.js VoiceState API (Context7: /websites/discord_js_packages_discord_js_14_26_2)
// VoiceState properties: channelId, selfMute, selfDeaf, serverMute, serverDeaf, member.id

// src/events/voiceStateUpdate.ts
import { Events, type VoiceState } from 'discord.js';

export const name = Events.VoiceStateUpdate;

export async function execute(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const userId = newState.id;  // VoiceState.id = user's snowflake
  const guildId = newState.guild.id;

  const wasInChannel = oldState.channelId !== null;
  const isInChannel = newState.channelId !== null;

  if (!wasInChannel && isInChannel) {
    // JOIN: fire-and-forget session start
    void boss!.send('activity-queue', {
      type: 'voice_join',
      userId, guildId,
      channelId: newState.channelId!,
      timestamp: Date.now(),
    }, { expireInSeconds: 120 });
  }

  if (wasInChannel && !isInChannel) {
    // LEAVE: fire-and-forget session end
    void boss!.send('activity-queue', {
      type: 'voice_leave',
      userId, guildId,
      channelId: oldState.channelId!,
      selfMute: newState.selfMute ?? false,
      selfDeaf: newState.selfDeaf ?? false,
      timestamp: Date.now(),
    }, { expireInSeconds: 120 });
  }

  // Mute/deafen state changes (not join/leave): no job needed — handled at award time
}
```

```typescript
// VoiceMinuteWorker — periodic job in bot.ts, runs every 60s
// Polls characters with active voice sessions and awards tu vi

export async function registerVoiceMinuteWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue('voice-minute-tick');
  await boss.schedule('voice-minute-tick', '* * * * *', {});  // every minute

  await boss.work('voice-minute-tick', { localConcurrency: 1 }, async () => {
    const now = Date.now();
    // Find all characters with active voice sessions
    const activeSessions = await db
      .select({
        id: characters.id,
        discordId: characters.discordId,
        spiritualRoot: characters.spiritualRoot,
        voiceSessionStartedAt: characters.voiceSessionStartedAt,
        dailyTuvi: characters.dailyTuvi,
        tuVi: characters.tuVi,
      })
      .from(characters)
      .where(sql`${characters.voiceSessionStartedAt} IS NOT NULL`);

    for (const char of activeSessions) {
      const sessionMs = now - char.voiceSessionStartedAt!.getTime();
      const sessionMins = Math.floor(sessionMs / 60_000);
      const cappedMins = Math.min(sessionMins, GAME_CONFIG.VOICE_MAX_MINUTES);

      if (cappedMins < 1) continue;  // Less than 1 full minute elapsed

      const baseAmount = cappedMins * GAME_CONFIG.VOICE_TU_VI_PER_MINUTE;
      const multiplier = GAME_CONFIG.SPIRITUAL_ROOT_MULTIPLIERS[char.spiritualRoot];
      const amount = Math.floor(baseAmount * multiplier);

      // Award 1 minute's worth, then update session start to "now - leftover"
      // Simplified: award for full minutes elapsed, reset session start
      const oneMinuteAmount = Math.floor(GAME_CONFIG.VOICE_TU_VI_PER_MINUTE * multiplier);

      await db
        .update(characters)
        .set({
          tuVi: sql`${characters.tuVi} + ${oneMinuteAmount}`,
          dailyTuvi: sql`${characters.dailyTuvi} + ${oneMinuteAmount}`,
          voiceSessionStartedAt: sql`${characters.voiceSessionStartedAt} + interval '1 minute'`,
        })
        .where(
          and(
            eq(characters.id, char.id),
            sql`${characters.voiceSessionStartedAt} IS NOT NULL`,
            sql`${characters.dailyTuvi} + ${oneMinuteAmount} <= ${GAME_CONFIG.DAILY_CAP}`,
            // Cap session at VOICE_MAX_MINUTES (60 min)
            sql`EXTRACT(EPOCH FROM (now() - ${characters.voiceSessionStartedAt})) / 60 <= ${GAME_CONFIG.VOICE_MAX_MINUTES}`,
          ),
        );
    }
  });
}
```

**Key insight:** Advancing `voice_session_started_at` forward by 1 minute per tick is the atomic "mark as paid" pattern. The WHERE clause ensures no double-award even if the job runs slightly late.

---

### Pattern 3: Breakthrough Command (Atomic Realm Advance)

**What:** `/đột_phá` checks tu vi threshold, rolls failure chance on major boundaries, awards or penalizes.

```typescript
// Source: Architecture decisions D-15..D-19 + Drizzle transactions

import { REALM_CONFIG } from '../constants/realms.js';

export async function handleDotPha(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const [char] = await db
    .select()
    .from(characters)
    .where(eq(characters.discordId, interaction.user.id));

  if (!char) {
    return interaction.editReply({ embeds: [buildErrorEmbed(t('common:errors.notRegistered'))] });
  }

  const currentRealm = REALM_CONFIG[char.realmId];
  const nextRealmId = char.realmId + 1;

  if (nextRealmId >= REALM_CONFIG.length) {
    return interaction.editReply({ embeds: [buildErrorEmbed(t('game:breakthrough.maxRealm'))] });
  }

  const threshold = currentRealm.tuViRequired;
  if (char.tuVi < threshold) {
    return interaction.editReply({
      embeds: [buildBreakthroughEmbed('insufficient', char, currentRealm, t)],
    });
  }

  // Check if this is a major realm boundary
  const isMajorBoundary = currentRealm.isMajorBoundary;
  const failureChance = isMajorBoundary ? currentRealm.failureChance : 0;

  const roll = Math.random();
  const failed = roll < failureChance;

  if (failed) {
    // Penalty: lose 50% of tu vi ABOVE the current realm's entry threshold
    const excessTuVi = char.tuVi - currentRealm.entryThreshold;
    const penalty = Math.floor(excessTuVi * 0.5);

    await db
      .update(characters)
      .set({ tuVi: sql`${characters.tuVi} - ${penalty}` })
      .where(eq(characters.id, char.id));

    return interaction.editReply({
      embeds: [buildBreakthroughEmbed('fail', char, currentRealm, t, { penalty })],
    });
  }

  // Success: advance realm
  await db
    .update(characters)
    .set({ realmId: nextRealmId })
    .where(eq(characters.id, char.id));

  return interaction.editReply({
    embeds: [buildBreakthroughEmbed('success', char, REALM_CONFIG[nextRealmId], t)],
  });
}
```

---

### Pattern 4: /start Command with Spiritual Root (Select Menu)

**What:** `/start` creates a character. Spiritual root: **random weighted assignment** with reveal (agent decision per discretion). No multi-step UI needed — simpler implementation, creates mystery/excitement.

**Rationale for random (not player-choice):** Avoids 5-option select menu complexity, maintains "hidden mechanic" philosophy (D-04), consistent with xianxia genre where talent is innate. Player discovers their affinity rather than choosing it.

```typescript
// Source: discord.js select menu docs (Context7: /discordjs/guide)
// Random weighted selection — player sees reveal of their assigned root

const SPIRITUAL_ROOT_WEIGHTS = {
  'kim': 15,   // Rarest — highest multiplier (1.2×)
  'hoa': 20,
  'moc': 25,
  'thuy': 25,
  'tho': 15,   // Common — balanced (1.0×)
} as const;

function rollSpiritualRoot(): SpiritualRoot {
  const total = Object.values(SPIRITUAL_ROOT_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.floor(Math.random() * total);
  for (const [root, weight] of Object.entries(SPIRITUAL_ROOT_WEIGHTS)) {
    roll -= weight;
    if (roll < 0) return root as SpiritualRoot;
  }
  return 'tho';
}
```

**Alternative (if player-choice is preferred):** Use `StringSelectMenuBuilder` with 5 options. Add a 60-second collector via `message.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 60_000 })`. If no selection: auto-assign random root.

---

### Pattern 5: Drizzle Schema — All Phase 2 Tables

```typescript
// Source: Drizzle ORM docs (Context7: /drizzle-team/drizzle-orm-docs)
// src/db/schema/characters.ts

import {
  pgTable, serial, integer, smallint, bigint, varchar,
  timestamp, date, boolean, jsonb, pgEnum, check, index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const spiritualRootEnum = pgEnum('spiritual_root', ['kim', 'moc', 'thuy', 'hoa', 'tho']);

export const characters = pgTable('characters', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  discordId: varchar('discord_id', { length: 20 }).notNull().unique(),
  spiritualRoot: spiritualRootEnum('spiritual_root').notNull(),
  realmId: smallint('realm_id').notNull().default(0),
  tuVi: bigint('tu_vi', { mode: 'bigint' }).notNull().default(sql`0`),
  dailyTuvi: integer('daily_tuvi').notNull().default(0),
  dailyTuviResetAt: timestamp('daily_tuvi_reset_at', { withTimezone: true }).defaultNow(),
  professionPoints: jsonb('profession_points').notNull().default({}),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  lastReactionAt: timestamp('last_reaction_at', { withTimezone: true }),
  voiceSessionStartedAt: timestamp('voice_session_started_at', { withTimezone: true }),
  anomalyFlag: boolean('anomaly_flag').notNull().default(false),
  streakDays: integer('streak_days').notNull().default(0),
  lastActiveDate: date('last_active_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('realm_id_range', sql`${table.realmId} >= 0 AND ${table.realmId} <= 41`),
  check('daily_tuvi_non_negative', sql`${table.dailyTuvi} >= 0`),
  check('tu_vi_non_negative', sql`${table.tuVi} >= 0`),
  index('characters_discord_id_idx').on(table.discordId),
  index('characters_tu_vi_idx').on(table.tuVi),  // For leaderboard queries
]);

// src/db/schema/items.ts
export const itemTypeEnum = pgEnum('item_type', [
  'material', 'consumable', 'equipment', 'formation',
  'stone', 'scroll', 'companion', 'food', 'artifact',
]);

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  nameI18nKey: varchar('name_i18n_key', { length: 100 }).notNull(),
  type: itemTypeEnum('type').notNull(),
  basePrice: bigint('base_price', { mode: 'bigint' }).notNull().default(sql`0`),
  isUnique: boolean('is_unique').notNull().default(false),
  creatorCharacterId: integer('creator_character_id').references(() => characters.id),
  customName: varchar('custom_name', { length: 50 }),
  customEmoji: varchar('custom_emoji', { length: 100 }),
  attributes: jsonb('attributes'),  // Random rolls — null for non-unique items
  createdAt: timestamp('created_at', { withTimezone: true }),
});

// src/db/schema/character_items.ts
export const characterItems = pgTable('character_items', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id),
  itemId: integer('item_id').notNull().references(() => items.id),
  quantity: integer('quantity').notNull().default(1),
}, (table) => [
  check('quantity_positive', sql`${table.quantity} > 0`),
  index('char_items_character_idx').on(table.characterId),
]);

// src/db/schema/recipes.ts
export const professionTypeEnum = pgEnum('profession_type', [
  'luyen_dan', 'luyen_khi_nc', 'tran_phap', 'linh_tru',
  'luyen_co', 'duoc_su', 'thuan_thu', 'luyen_kim', 'khai_linh', 'thuat_su',
]);

export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  resultItemId: integer('result_item_id').notNull().references(() => items.id),
  professionType: professionTypeEnum('profession_type').notNull(),
  minProfessionLevel: integer('min_profession_level').notNull().default(1),
});

// src/db/schema/recipe_ingredients.ts
export const recipeIngredients = pgTable('recipe_ingredients', {
  id: serial('id').primaryKey(),
  recipeId: integer('recipe_id').notNull().references(() => recipes.id),
  itemId: integer('item_id').notNull().references(() => items.id),
  quantity: integer('quantity').notNull(),
});
```

---

### Pattern 6: Crafting Transaction (Atomic — Consume + Produce)

```typescript
// Source: Drizzle ORM transactions (Context7: /drizzle-team/drizzle-orm-docs)

async function craftItem(characterId: number, recipeId: number): Promise<CraftResult> {
  return db.transaction(async (tx) => {
    // 1. Fetch recipe + ingredients
    const recipe = await tx.select().from(recipes).where(eq(recipes.id, recipeId));
    const ingredients = await tx.select().from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipeId));

    // 2. Check character has all ingredients (FOR UPDATE to lock rows)
    for (const ingredient of ingredients) {
      const [inv] = await tx
        .select()
        .from(characterItems)
        .where(
          and(
            eq(characterItems.characterId, characterId),
            eq(characterItems.itemId, ingredient.itemId),
          ),
        );
      if (!inv || inv.quantity < ingredient.quantity) {
        tx.rollback();
        return { success: false, reason: 'insufficient_materials' };
      }
    }

    // 3. Consume ingredients
    for (const ingredient of ingredients) {
      await tx
        .update(characterItems)
        .set({ quantity: sql`${characterItems.quantity} - ${ingredient.quantity}` })
        .where(
          and(
            eq(characterItems.characterId, characterId),
            eq(characterItems.itemId, ingredient.itemId),
          ),
        );
      // Clean up zero-quantity rows
      await tx
        .delete(characterItems)
        .where(
          and(
            eq(characterItems.characterId, characterId),
            eq(characterItems.itemId, ingredient.itemId),
            sql`${characterItems.quantity} <= 0`,
          ),
        );
    }

    // 4. Roll for unique item
    const char = await tx.select().from(characters).where(eq(characters.id, characterId));
    const profLevel = getProfessionLevel(char[0].professionPoints, recipe.professionType);
    const isUnique = rollUniqueChance(profLevel);

    // 5. Create result item (unique or standard)
    // ... (insert into items if unique, then insert into character_items)

    return { success: true, isUnique };
  });
}
```

---

### Pattern 7: Leaderboard Pagination (ButtonBuilder)

```typescript
// Source: discord.js docs + guide (Context7: /discordjs/guide)

const PAGE_SIZE = 10;

async function buildLeaderboardPage(guildId: string, page: number): Promise<EmbedBuilder> {
  const entries = await db
    .select({
      discordId: characters.discordId,
      realmId: characters.realmId,
      tuVi: characters.tuVi,
    })
    .from(characters)
    // For guild-specific: join with guild member data (requires guild member lookup)
    .orderBy(sql`${characters.tuVi} DESC`)
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  return buildLeaderboardEmbed(entries, page, t);
}

// Pagination row
const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder()
    .setCustomId(`bxh_prev_${page}`)
    .setLabel('◀')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0),
  new ButtonBuilder()
    .setCustomId(`bxh_next_${page}`)
    .setLabel('▶')
    .setStyle(ButtonStyle.Secondary),
);

// Handle button click via interactionCreate router (isButton() branch)
```

---

### Anti-Patterns to Avoid

- **Synchronous DB write in messageCreate handler** — blocks gateway, causes disconnects at scale. Always enqueue to pg-boss.
- **Redis-only cooldown without DB backup** — Redis can be wiped (restart, OOM). DB timestamp (`last_message_at`) is the truth.
- **`UPDATE ... SET daily_tuvi = daily_tuvi + X` without WHERE cap check** — non-atomic, allows over-cap in concurrent scenarios. Always use `WHERE daily_tuvi + X <= 10000`.
- **Hardcoded realm names in code** — must come from `t('game:realms.${key}')`. Pre-commit hook will catch this.
- **Shard-local in-memory timer for voice** — silently breaks on redeploy. Use pg-boss periodic job + DB session timestamp.
- **pg-boss ActivityWorker in shard.ts** — pg-boss must ONLY run in bot.ts (ShardingManager). N shards × `boss.start()` = duplicate cron jobs and advisory lock conflicts on PgBouncer.
- **`boss.send()` awaited in event handlers** — pg-boss `send()` does a DB write; awaiting it in messageCreate adds ~5-20ms latency per message. Use `void boss.send(...)` (fire-and-forget).
- **Storing BigInt in JSONB** — profession_points JSONB uses number values (skill point counts, max ~42), not BigInt. No conversion needed.
- **`$type<T>()` on JSONB without Zod validation** — Drizzle's `.$type<T>()` is compile-time only; validate JSONB data with Zod at read time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic conditional increment | Read-modify-write in application | `UPDATE ... WHERE counter + X <= cap RETURNING` | Read-modify-write is NOT atomic — race condition between concurrent workers |
| Job deduplication / throttling | Custom Redis set + expiry | `boss.sendThrottled()` with `singletonKey` | pg-boss handles this at DB level; idempotent by design |
| Cron job scheduling | `setInterval` in process | `boss.schedule()` with cron expression | Survives restarts, runs once even with multiple instances |
| DB connection pooling | Custom pool management | Existing PgBouncer + `pg.Pool` in `src/db/client.ts` | Already set up in Phase 1 |
| Emoji rendering | Inline emoji literals | `src/assets/emojis.ts` registry | ESLint rule enforces this; prevents scattered magic strings |
| i18n key lookup | `if (realmId === 0) return 'Luyện Khí Tầng 1'` | `t(REALM_CONFIG[id].i18nKey)` | 126 string lookups required; ESLint will block hardcoded strings |
| BigInt formatting | `String(tuVi)` | `formatBalance(tuVi)` from `src/utils/format.ts` | Already handles locale formatting + BigInt edge cases |
| Weighted random selection | Custom implementation | Simple loop over weight array (shown in Pattern 4) | Trivial, no library needed |

**Key insight:** The most dangerous anti-pattern is the read-modify-write race on the daily cap. The only safe approach is the atomic `UPDATE ... WHERE ... RETURNING` pattern. If RETURNING returns 0 rows, the cap was hit.

---

## Agent-Designed Constants (Discretion Items from D-13, D-24, D-26, D-27)

### Tu Vi Threshold Curve

Designed per D-13: exponential curve anchored to 10,000/day cap.

**Design parameters:**
- Average active player: ~4,000 tu vi/day
- Luyện Khí complete: ~11 days for average player (6 days at hard cap)
- Enter Trúc Cơ: ~3.5 weeks for average player
- Enter Kim Đan: ~8 weeks for average player
- Enter Nguyên Anh: ~5.5 months — start of "legendary territory"
- Upper realms (Hóa Thần+): multi-season goals for most players

Store in `src/constants/realms.ts` as `TU_VI_TO_ADVANCE[realm_id]` (tu vi needed to advance FROM this tier):

```typescript
export const TU_VI_TO_ADVANCE: readonly number[] = [
  // Luyện Khí Tầng 1-9 (realm_id 0-8)
  1_000,   // 0 → 1  (0.25 days)
  1_500,   // 1 → 2
  2_200,   // 2 → 3
  3_200,   // 3 → 4
  4_700,   // 4 → 5
  7_000,   // 5 → 6  (1.75 days avg)
  10_000,  // 6 → 7  (2.5 days avg)
  15_000,  // 7 → 8
  22_000,  // 8 → 9  (major boundary: 0% fail)
  // Cumulative to Trúc Cơ: ~66,600 / 4,000 ≈ 16.6 days

  // Trúc Cơ Sơ/Trung/Hậu (realm_id 9-11)
  35_000,  // 9 → 10
  52_000,  // 10 → 11
  78_000,  // 11 → 12 (major boundary: 20% fail)
  // Cumulative to Kim Đan: ~231,600 / 4,000 ≈ 57.9 days

  // Kim Đan Sơ/Trung/Hậu (realm_id 12-14)
  120_000, // 12 → 13
  180_000, // 13 → 14
  270_000, // 14 → 15 (major boundary: 40% fail)
  // Cumulative to Nguyên Anh: ~801,600 / 4,000 ≈ 200 days

  // Nguyên Anh Sơ/Trung/Hậu (realm_id 15-17)
  400_000, // 15 → 16
  600_000, // 16 → 17
  900_000, // 17 → 18 (major boundary: 60% fail)

  // Hóa Thần Sơ/Trung/Hậu (realm_id 18-20)
  1_350_000,
  2_000_000,
  3_000_000, // → Luyện Hư (70% fail)

  // Luyện Hư Sơ/Trung/Hậu (realm_id 21-23)
  4_500_000,
  6_750_000,
  10_000_000, // → Vấn Đỉnh (75% fail)

  // Vấn Đỉnh Sơ/Trung/Hậu (realm_id 24-26)
  15_000_000,
  22_500_000,
  33_750_000, // → Đại Thừa (80% fail)

  // Đại Thừa Sơ/Trung/Hậu (realm_id 27-29)
  50_000_000,
  75_000_000,
  112_500_000, // → Bán Tiên (85% fail)

  // Bán Tiên Sơ/Trung/Hậu (realm_id 30-32)
  170_000_000,
  255_000_000,
  382_500_000, // → Địa Tiên (88% fail)

  // Địa Tiên Sơ/Trung/Hậu (realm_id 33-35)
  575_000_000,
  860_000_000,
  1_290_000_000, // → Chân Tiên (90% fail)

  // Chân Tiên Sơ/Trung/Hậu (realm_id 36-38) — legendary
  1_935_000_000,
  2_900_000_000,
  Infinity,  // Max tier — cannot advance
] as const;
// NOTE: This array has 39 entries for realm_id 0-38.
// See Open Question #1 for the 42 vs 39 discrepancy.
```

**Context for upper realms:** At 10,000/day max, reaching Hóa Thần requires 2,701,600 / 10,000 = 270 days minimum. These are truly multi-season goals for the most dedicated players.

---

### REALM_CONFIG Structure

```typescript
// src/constants/realms.ts

export interface RealmTier {
  id: number;              // 0-41
  i18nKey: string;         // e.g., 'game:realms.luyen_khi.tang_1'
  majorRealmIndex: number; // 0=LK, 1=TC, 2=KD, ... 10=CT
  tierInMajor: number;     // 0=Sơ/Tầng1, 1=Trung/Tầng2, 2=Hậu/Tầng3, etc.
  isMajorBoundary: boolean; // true for tier 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
  failureChance: number;   // 0.0–1.0 (only relevant when isMajorBoundary=true)
  entryThreshold: number;  // cumulative tu_vi to REACH this tier (for penalty calc)
  tuViRequired: number;    // = TU_VI_TO_ADVANCE[id] — to advance TO next tier
}
```

---

### Daily Streak Bonus (CORE-07)

Streak awards a flat tu vi bonus added DIRECTLY to `tu_vi` (bypasses daily cap — it's a reward, not activity income):

| Streak Length | Daily Bonus |
|---------------|-------------|
| 1–6 days | +200 tu vi |
| 7–13 days | +600 tu vi |
| 14–20 days | +1,200 tu vi |
| 21–29 days | +2,000 tu vi |
| 30+ days | +3,000 tu vi |

Logic in ActivityWorker after tu vi award succeeds:
1. If `last_active_date` = yesterday (UTC) → `streak_days++`
2. If `last_active_date` < yesterday (UTC) → `streak_days = 1` (reset)
3. If `last_active_date` = today (UTC) → no change
4. Award streak bonus based on new `streak_days` value, update `last_active_date`

---

### Gathering Yield Formula (PROG-06)

```typescript
// Yield = base × realm factor × profession level factor
// Result is number of material items granted

function computeGatheringYield(
  realmId: number,
  profLevel: number,
  materialTier: number,  // 0=common, 1=uncommon, 2=rare, 3=epic
): number {
  const realmFactor = Math.max(1, Math.floor(realmId / 3) + 1);
  const profFactor = Math.max(1, Math.floor(profLevel * 1.5));
  const tierPenalty = Math.max(1, materialTier * 2);  // Higher tier = fewer drops
  return Math.max(1, Math.floor((realmFactor + profFactor) / tierPenalty));
}

// Minimum profession level to gather material tier:
const GATHER_TIER_REQUIREMENTS = [0, 3, 8, 15] as const; // tier 0, 1, 2, 3
// Minimum realm to gather material tier:
const GATHER_REALM_REQUIREMENTS = [0, 9, 18, 27] as const; // tier 0, 1, 2, 3
```

---

### Unique Item Trigger Probability (D-26)

```typescript
// Probability scales with profession level (L = 1 to 42)
function rollUniqueChance(profLevel: number): boolean {
  const probability = Math.min(0.15, 0.01 + (profLevel - 1) * 0.0035);
  // Level 1: 1.0% | Level 10: 4.15% | Level 20: 7.65% | Level 42: ~15%
  return Math.random() < probability;
}
```

---

### Per-Profession Unique Item Archetypes (D-26, PROG-08)

Define in `src/constants/itemAttributes.ts`:

| Profession | Unique Item Type | Attribute Pool (2-4 random attributes) |
|------------|-----------------|----------------------------------------|
| Luyện Đan | Thần Đan (Divine Pill) | cultivation_multiplier, daily_cap_boost, breakthrough_luck, spirit_recovery |
| Luyện Khí Nghề | Khí Luyện Tư (Qi Refiner) | passive_tuvi_rate, energy_efficiency, realm_affinity, meditation_bonus |
| Trận Pháp | Kỳ Trận Cổ (Formation Disc) | defense_layer, trap_power, area_effect, duration_hours |
| Linh Trù | Linh Thiện (Spirit Feast) | shared_boost_percent, hunger_resistance, social_bonus, duration_hours |
| Luyện Cổ | Thần Khí (Divine Instrument) | spiritual_resonance, realm_insight, artifact_power, passive_income |
| Dược Sư | Linh Thảo Thần (Spirit Herb) | yield_multiplier, rare_ingredient_chance, growth_speed, harvest_bonus |
| Thuần Thú | Thần Thú (Divine Beast) | combat_assist, gathering_partner, loyalty, special_skill |
| Luyện Kim | Thần Binh (Divine Weapon) | attack_bonus, defense_bonus, spiritual_root_affinity, durability |
| Khai Linh | Linh Thạch Nguyên (Origin Spirit Stone) | passive_income_rate, mining_bonus, ore_quality, vein_sense |
| Thuật Sư | Thiên Mệnh Thư (Fate Scroll) | fortune_modifier, event_luck, prediction_duration, wisdom_boost |

All attribute values are floats in JSONB, e.g.:
```json
{
  "cultivation_multiplier": 1.08,
  "breakthrough_luck": 0.05,
  "daily_cap_boost": 500
}
```

---

## Common Pitfalls

### Pitfall 1: ActivityWorker in shard.ts (CRITICAL)
**What goes wrong:** Registering `boss.work()` inside `shard.ts` creates N duplicate workers (one per shard). Each shard independently tries to acquire the pg-boss advisory lock, all succeed (PgBouncer transaction mode!), and all N workers process the same job — tu vi is awarded N times.

**Why it happens:** Developers see the shard as "the bot" and register all workers there.

**How to avoid:** ActivityWorker and VoiceMinuteWorker MUST register in `bot.ts` (ShardingManager). Only one instance. Already established as a pattern in `src/workers/pgBoss.ts`.

**Warning signs:** Tu vi awards appearing multiplied by shard count.

---

### Pitfall 2: Missing MessageContent Privileged Intent
**What goes wrong:** `messageCreate` fires but `message.content` is always an empty string `""`. Message length check never passes, zero tu vi awarded for any message.

**Why it happens:** `GatewayIntentBits.MessageContent` is a privileged intent — Discord does NOT send content without it. It must be explicitly requested AND enabled in the Discord Developer Portal for bots in 100+ guilds.

**How to avoid:** Add `GatewayIntentBits.MessageContent` to `src/shard.ts` client intents array. Enable in Discord Developer Portal → Bot → Privileged Gateway Intents.

**Warning signs:** `message.content.length === 0` for all messages; anti-farming always blocks (content quality gate never passes).

[VERIFIED: discord.js guide docs (Context7: /discordjs/guide) — MessageContent is explicitly listed as privileged intent]

---

### Pitfall 3: Daily Cap Race Condition (read-modify-write)
**What goes wrong:** Two rapid messages arrive simultaneously. Both workers read `daily_tuvi = 9,995`. Both add 10. Both write 10,005. Player exceeds the 10,000 cap.

**Why it happens:** `localConcurrency: 1` prevents this WITHIN one node, but if a second worker process is ever added (or if ActivityWorker is accidentally in shards), two processes can race.

**How to avoid:** Always use the `UPDATE ... WHERE daily_tuvi + amount <= cap RETURNING` atomic pattern. Never read-then-write. The RETURNING empty check is the rejection signal.

**Warning signs:** `daily_tuvi` column values exceeding 10,000 in production DB.

---

### Pitfall 4: drizzle-kit BigInt Default Serialization
**What goes wrong:** `bigint('tu_vi').default(0n)` crashes drizzle-kit migration generation with a BigInt serialization error.

**Why it happens:** Already documented in Phase 1 — drizzle-kit cannot serialize JavaScript BigInt literals.

**How to avoid:** Use `.default(sql\`0\`)` for all BIGINT columns. This is already the pattern in `src/db/schema/users.ts`.

[VERIFIED: Phase 1 SUMMARY.md — confirmed bug and fix]

---

### Pitfall 5: Voice Session Orphaning on Bot Restart
**What goes wrong:** Bot restarts mid-session. `voice_session_started_at` is still set for users currently in voice. They could accumulate tu vi for their next join as if they'd been in voice since before the restart.

**Why it happens:** On LEAVE, the duration is computed as `now - voice_session_started_at`. If the bot missed the real JOIN, the stored timestamp is from a previous session.

**How to avoid:** When processing a voice_leave job, cap the session duration to `VOICE_MAX_MINUTES` regardless. Also: on bot startup (in ready event), sweep `characters` for non-null `voice_session_started_at` and clear them (or limit max duration retroactively).

**Warning signs:** Single voice sessions awarding more than 300 tu vi (60 min × 5).

---

### Pitfall 6: i18n Keys Missing at Runtime
**What goes wrong:** `t('game:realms.truc_co.so_ky')` returns the key string itself instead of a translation. Realm names display as raw keys in Discord.

**Why it happens:** i18next silently falls back to key string when a key is missing from the locale file. The `check-i18n` script catches this but only if run.

**How to avoid:** Add ALL 42 × 3 locale keys (126 keys) to `locales/*/game.json` in the SAME migration/commit that creates the realm constants. Run `npm run check-i18n` as part of Wave 0 setup.

**Warning signs:** Realm names showing as `game:realms.luyen_khi.tang_1` in Discord.

---

### Pitfall 7: Profession Points JSONB Type Safety
**What goes wrong:** TypeScript type is `any` for profession_points JSONB. Code reads a non-existent key and gets `undefined`, which is then used in arithmetic, producing `NaN` tu vi awards.

**Why it happens:** Drizzle's `.$type<T>()` on JSONB is compile-time only. Runtime values are not validated.

**How to avoid:** Define a Zod schema for profession points shape:
```typescript
const ProfessionPointsSchema = z.object({
  luyen_dan: z.number().int().min(0).default(0),
  luyen_khi_nc: z.number().int().min(0).default(0),
  // ... all 10 professions
}).partial();

// Validate on read from DB
const points = ProfessionPointsSchema.parse(char.professionPoints ?? {});
```
Use a helper `getProfessionLevel(rawJson, profKey): number` that always returns 0 for missing keys.

---

### Pitfall 8: Realm Count Discrepancy (39 vs 42)
**What goes wrong:** The table in D-10 lists 9 Luyện Khí tiers + 10 major realms × 3 tiers = 39 total tiers. But D-11/D-29 say realm_id 0–41 (42 values).

**Why it happens:** Internal inconsistency in CONTEXT.md. See Open Question #1 for resolution.

**How to avoid:** Choose a resolution before writing `src/constants/realms.ts`. This is flagged as Open Question #1.

---

## Code Examples

### Verified Pattern: Drizzle Atomic Conditional Update with RETURNING
```typescript
// Source: Drizzle ORM docs (Context7: /drizzle-team/drizzle-orm-docs)
import { eq, sql, and } from 'drizzle-orm';

const [updated] = await db
  .update(characters)
  .set({
    tuVi: sql`${characters.tuVi} + ${amount}`,
    dailyTuvi: sql`${characters.dailyTuvi} + ${amount}`,
  })
  .where(
    and(
      eq(characters.id, characterId),
      sql`${characters.dailyTuvi} + ${amount} <= ${GAME_CONFIG.DAILY_CAP}`,
    ),
  )
  .returning({ dailyTuvi: characters.dailyTuvi });

const capHit = !updated;  // empty RETURNING = WHERE condition failed = cap hit
```

### Verified Pattern: pgEnum Declaration
```typescript
// Source: Drizzle ORM docs (Context7: /drizzle-team/drizzle-orm-docs)
import { pgEnum } from 'drizzle-orm/pg-core';

export const spiritualRootEnum = pgEnum('spiritual_root', ['kim', 'moc', 'thuy', 'hoa', 'tho']);
// Usage: spiritualRootEnum('spiritual_root').notNull()
```

### Verified Pattern: JSONB Default
```typescript
// Source: Drizzle ORM docs (Context7: /drizzle-team/drizzle-orm-docs)
import { jsonb } from 'drizzle-orm/pg-core';

professionPoints: jsonb('profession_points').notNull().default({}),
// IMPORTANT: default({}) works correctly — unlike bigint default which needs sql`0`
```

### Verified Pattern: pg-boss Fire-and-Forget from Event Handler
```typescript
// Source: pg-boss docs (Context7: /timgit/pg-boss)
// Do NOT await — this is intentional fire-and-forget
void boss!.send('activity-queue', jobData, { expireInSeconds: 120 });
// expireInSeconds: jobs older than 2 min are discarded (prevents stale pile-up after restart)
```

### Verified Pattern: pg-boss Worker with Concurrency 1
```typescript
// Source: pg-boss docs (Context7: /timgit/pg-boss)
await boss.work(
  'activity-queue',
  { localConcurrency: 1 },  // Serial processing — no race conditions on daily cap
  async ([job]: Job<ActivityJobData>[]) => {  // Destructure array to get single job
    await processActivityJob(job.data);
  },
);
```

### Verified Pattern: VoiceState Properties
```typescript
// Source: discord.js VoiceState API (Context7: /websites/discord_js_packages_discord_js_14_26_2)
// All properties confirmed on VoiceState class:
newState.channelId    // null = not in voice
newState.selfMute     // boolean | null
newState.selfDeaf     // boolean | null
newState.serverMute   // boolean | null
newState.serverDeaf   // boolean | null
newState.id           // user's Discord snowflake
newState.guild.id     // guild snowflake

const isAfk = newState.selfDeaf || newState.serverMute;
```

### Verified Pattern: Drizzle Transaction with Rollback
```typescript
// Source: Drizzle ORM transactions (Context7: /drizzle-team/drizzle-orm-docs)
const result = await db.transaction(async (tx) => {
  const [item] = await tx.select().from(items).where(eq(items.id, itemId));
  if (!item) {
    tx.rollback();  // throws, rolls back everything
    return null;
  }
  await tx.insert(characterItems).values({ characterId, itemId, quantity: 1 });
  return item;
});
```

---

## State of the Art

| Old Approach | Current Approach | Status |
|--------------|-----------------|--------|
| `client.on('message')` prefix commands | Slash commands via InteractionCreate | CURRENT — Phase 1 already uses this |
| Synchronous DB writes in event handlers | Fire-and-forget to job queue | CURRENT — required for gateway stability |
| Redis-only cooldowns | Two-tier Redis + DB-backed | CURRENT — Phase 2 adds DB layer |
| Hardcoded realm names | i18n keys from locale files | CURRENT — enforced by ESLint |
| `message.content` without MessageContent intent | Privileged intent must be explicitly requested | CURRENT — Phase 2 must add this |

**Deprecated/outdated:**
- `Intents.FLAGS.GUILD_MESSAGES`: Old v13 syntax. Phase 2 uses `GatewayIntentBits.MessageContent` (v14 API).
- `message.channel.send()`: Replaced by slash command reply/followUp pattern for bot responses.

---

## Environment Availability

> Phase 2 adds no new external services. All dependencies verified from Phase 1.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16+ | All game state | ✓ (Phase 1 setup) | 16+ (Oracle VM) | — |
| Redis | Cooldown fast-path | ✓ (Phase 1 setup) | Phase 1 configured | — |
| PgBouncer | Connection pooling | ✓ (Phase 1 setup) | Phase 1 configured | — |
| Node.js 22 LTS | Runtime | ✓ | v22.20.0 | — |
| MessageContent Privileged Intent | CORE-01 (message tu vi) | ⚠️ **Needs Portal Enable** | — | None — must enable |

[VERIFIED: node --version → v22.20.0]

**Blocking requirement:** `GatewayIntentBits.MessageContent` must be enabled in the Discord Developer Portal (Bot settings → Privileged Gateway Intents) before `messageCreate` content is readable. This is a one-time manual action, not a code change.

---

## Open Questions

### Open Question 1: Realm Count Discrepancy (39 vs 42) ⚠️ MUST RESOLVE BEFORE CODING

**What we know:** D-10 defines 11 major realms: Luyện Khí (9 sub-tiers) + 10 others (3 sub-tiers each) = 9 + 30 = **39 total tiers**. But D-11 and D-29 both reference realm_id 0–41, which implies **42 values**.

**What's unclear:** Three tiers are unaccounted for.

**Resolution options:**
- **Option A:** Luyện Khí has 12 tiers (Tầng Một–Tầng Mười Hai). More common in traditional xianxia. Fits xianxia genre conventions. Realm IDs: LK = 0–11, then TC = 12–14, etc. = 12 + 30 = 42. ✓
- **Option B:** Add a 12th major realm "Đại La Tiên" (tiers 39–41) at the apex. Realm IDs 36–38 = Chân Tiên, 39–41 = Đại La Tiên. Total = 9 + 11×3 = 42. ✓

**Recommendation:** Option A (extend Luyện Khí to 12 tiers) — simpler, consistent with D-11 stating "11 major realms", no new named realm needed. Update D-10 to "Tầng Một through Tầng Mười Hai." The threshold curve above would add 3 more Luyện Khí tiers at lower cost (e.g., 29,000, 38,000, 51,000 for tiers 9-11 before TC begins at realm_id 12).

**Blocked until:** Product owner confirms Option A or B.

---

### Open Question 2: Daily Reset Logic for `daily_tuvi`

**What we know:** `daily_tuvi` resets at midnight UTC. `daily_tuvi_reset_at` tracks when last reset occurred.

**What's unclear:** Does the reset happen via a pg-boss midnight cron job, or lazily on the first activity of the new day?

**Recommendation:** **Lazy reset** — simpler, no extra scheduled job. In ActivityWorker, before Layer 4:
```typescript
const now = new Date();
if (char.dailyTuviResetAt && !isSameUtcDay(now, char.dailyTuviResetAt)) {
  // Reset daily counter
  await db.update(characters)
    .set({ dailyTuvi: 0, dailyTuviResetAt: sql`now()` })
    .where(eq(characters.id, char.id));
}
```
This is atomic-safe: the reset happens inside the concurrency:1 worker before the cap check.

---

### Open Question 3: Guild-Specific Leaderboard (PROG-04)

**What we know:** PROG-04 requires "leaderboard in guild and global." Characters are global (one character per user, no server-local).

**What's unclear:** How to query "players in this guild" — the `characters` table has no guild membership column. Discord's GuildMember cache only covers guilds the bot shard has loaded.

**Recommendation:** For guild-specific leaderboard, filter by users who have sent messages in that guild (requires a `guild_activity` denormalized table with `user_id, guild_id` pairs, updated by the ActivityWorker). Keep global leaderboard as simpler initial scope.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Voice minute worker using per-minute PostgreSQL poll is feasible at scale (1,000+ concurrent sessions) | Pattern 2 | High DB load — may need Redis-based session tracking instead |
| A2 | `boss.send()` without await is safe when the pg-boss queue is full (will not throw) | Pattern 1 | If `send()` can throw on overload, event handler needs try-catch |
| A3 | Lazy daily reset (in ActivityWorker) is sufficient — no dedicated midnight cron needed | Open Question 2 | If player never triggers ActivityWorker, their daily_tuvi is never reset (benign: they earned 0 anyway) |

---

## Security Domain

> Phase 2 introduces economy-affecting game mechanics. Security must be considered.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Discord OAuth handles this |
| V3 Session Management | No | Stateless slash commands |
| V4 Access Control | Yes | Character ownership check: always verify character.discordId === interaction.user.id before mutations |
| V5 Input Validation | Yes | Zod validation on game config; content quality gate (Layer 3) |
| V6 Cryptography | No | No crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| AFK voice farming (muted/deaf bot) | Tampering | Layer 5: selfMute/selfDeaf check at session end |
| Message spam farming (rapid identical messages) | Tampering | Layer 3: duplicate content detection (5-min window) |
| Character not found bypass | Elevation of Privilege | Guard: if (!char) return early — never award to non-registered user |
| Breakthrough timing exploit | Tampering | Breakthrough atomically reads tu_vi; no TOCTOU window |
| Profession points overflow | Tampering | Check: total_points_assigned ≤ char.realmId before any allocation |
| Negative tu_vi via penalty | Tampering | DB CHECK constraint `tu_vi >= 0`; penalty formula floors at entryThreshold |
| Crafting infinite-loop (recipe output = ingredient) | Logic Error | Recipe validator: result_item_id cannot appear in recipe_ingredients |

---

## Sources

### Primary (HIGH confidence)
- Context7 `/timgit/pg-boss` — `work()`, `send()`, `sendThrottled()`, `schedule()`, `localConcurrency` confirmed
- Context7 `/drizzle-team/drizzle-orm-docs` — atomic UPDATE with RETURNING, pgEnum, JSONB, timestamp, transaction, check constraint syntax confirmed
- Context7 `/websites/discord_js_packages_discord_js_14_26_2` — VoiceState class properties confirmed (selfMute, selfDeaf, channelId, id)
- Context7 `/discordjs/guide` — MessageContent privileged intent confirmed; StringSelectMenu, ButtonBuilder patterns confirmed
- `package.json` — All package versions verified at exact installed values
- `src/workers/pgBoss.ts` — pg-boss pattern (bot.ts only, Job[] array, named import) confirmed from Phase 1

### Secondary (MEDIUM confidence)
- Phase 1 SUMMARY.md — BigInt default `sql\`0\`` bug, pg-boss `Job[]` array handler, ESLint i18next v6 API — all confirmed from Phase 1 execution

### Tertiary (LOW confidence)
- VoiceMinuteWorker "advance session_started_at by 1 minute" pattern — derived from architecture decisions, not from an official Discord bot reference. Needs testing for edge cases.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages at pinned versions, no new deps needed
- Architecture Patterns: HIGH — verified against Context7 official docs + existing codebase
- Agent-Designed Constants: MEDIUM — curves are reasonable but game balance is empirical
- Pitfalls: HIGH — all pitfalls either verified from Phase 1 execution or confirmed in official docs
- Realm Count: BLOCKED — internal discrepancy requires product owner decision

**Research date:** 2026-04-12
**Valid until:** 2026-10-12 (stable ecosystem — no fast-moving packages in this stack)
