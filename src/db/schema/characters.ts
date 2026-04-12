import {
  pgTable,
  serial,
  integer,
  smallint,
  bigint,
  varchar,
  timestamp,
  date,
  boolean,
  jsonb,
  pgEnum,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

// Spiritual root enum — exported so other modules can reference it
// Order: kim, moc, thuy, hoa, tho (must match GAME_CONFIG.SPIRITUAL_ROOT_MULTIPLIERS keys)
export const spiritualRootEnum = pgEnum('spiritual_root', ['kim', 'moc', 'thuy', 'hoa', 'tho']);

export type SpiritualRoot = (typeof spiritualRootEnum.enumValues)[number];

export const characters = pgTable(
  'characters',
  {
    id: serial('id').primaryKey(),
    // FK to users table — one character per user (global, cross-server)
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    // Denormalized for fast lookups without joining users table
    discordId: varchar('discord_id', { length: 20 }).notNull().unique(),
    spiritualRoot: spiritualRootEnum('spiritual_root').notNull(),
    // realm_id 0 = Luyện Khí Tầng Một; 41 = Đại La Tiên Hậu Kỳ
    realmId: smallint('realm_id').notNull().default(0),
    // CRITICAL: BigInt default as sql`0` due to drizzle-kit serialization bug (see Phase 1 SUMMARY)
    tuVi: bigint('tu_vi', { mode: 'bigint' }).notNull().default(sql`0`),
    // Daily tu vi accumulation — resets at midnight UTC, capped at 10,000
    dailyTuvi: integer('daily_tuvi').notNull().default(0),
    dailyTuviResetAt: timestamp('daily_tuvi_reset_at', { withTimezone: true }).defaultNow(),
    // JSONB for flexible profession skill point storage, e.g., {"luyen_dan": 3, "luyen_kim": 2}
    // Validated with ProfessionPointsSchema (Zod) at runtime — Drizzle $type is compile-time only
    professionPoints: jsonb('profession_points').notNull().default({}),
    // DB-backed cooldown state — survives shard restarts (Redis is L1 cache only)
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastReactionAt: timestamp('last_reaction_at', { withTimezone: true }),
    // Nullable — set when voice session begins, cleared on leave
    voiceSessionStartedAt: timestamp('voice_session_started_at', { withTimezone: true }),
    // Set to true after 10+ quality/cap violations per day — admin review flag
    anomalyFlag: boolean('anomaly_flag').notNull().default(false),
    // Consecutive active days streak
    streakDays: integer('streak_days').notNull().default(0),
    lastActiveDate: date('last_active_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Hard bounds: realm_id must stay within the 42-tier system
    check('realm_id_range', sql`${table.realmId} >= 0 AND ${table.realmId} <= 41`),
    // Prevent negative values from any calculation errors
    check('daily_tuvi_non_negative', sql`${table.dailyTuvi} >= 0`),
    check('tu_vi_non_negative', sql`${table.tuVi} >= 0`),
    // For fast discord_id lookups in event handlers
    index('characters_discord_id_idx').on(table.discordId),
    // For leaderboard ORDER BY tu_vi DESC queries
    index('characters_tu_vi_idx').on(table.tuVi),
  ],
);

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
