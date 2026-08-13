import { pgTable, serial, integer, smallint, varchar, timestamp, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { heroes } from './heroes.js';

/**
 * user_heroes — player-owned hero instances (TQC-02 -> Phase 10 TQC-12).
 * IVs (0-31) roll at capture time (Phase 10); Phase 8 only defines the columns.
 * Deliberately NO unique index on (userId, heroId): duplicates MUST be allowed
 * (Phase 11 TQC-14 dupe -> hồn ngọc conversion consumes duplicate rows).
 */
export const userHeroes = pgTable(
  'user_heroes',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    heroId: integer('hero_id')
      .notNull()
      .references(() => heroes.id),
    level: integer('level').notNull().default(1),
    // Six IV columns (0-31) — rolled at capture (Phase 10 TQC-12).
    // Phase 8 post-gate rename: STR=physical atk+def, AGI=accuracy+evasion,
    // INT=magic atk+def, MOV=turn order, LEA=+buff/-debuff, CHA=+enemy
    // effects/-own debuffs. Max sum 186 (Hoang Kim grade at 100%).
    ivStr: smallint('iv_str').notNull(),
    ivAgi: smallint('iv_agi').notNull(),
    ivInt: smallint('iv_int').notNull(),
    ivMov: smallint('iv_mov').notNull(),
    ivLea: smallint('iv_lea').notNull(),
    ivCha: smallint('iv_cha').notNull(),
    // Phase 10 (D-04): current HP — 0 = fainted. The capture/starter insert
    // paths (10-05/10-07) write the hero's base HP explicitly; this default
    // is a safety net for direct inserts, never the expected end state.
    hpCurrent: smallint('hp_current').notNull().default(0),
    // Phase 10 (A5): zone snapshot at capture — powers the /sanguo heroes
    // zone filter (TQC-13). NULL for starter grants (not zone-captured).
    capturedZone: varchar('captured_zone', { length: 50 }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // IV range checks — each stat bounded 0-31 per TQC-02
    check('iv_str_range', sql`${table.ivStr} >= 0 AND ${table.ivStr} <= 31`),
    check('iv_agi_range', sql`${table.ivAgi} >= 0 AND ${table.ivAgi} <= 31`),
    check('iv_int_range', sql`${table.ivInt} >= 0 AND ${table.ivInt} <= 31`),
    check('iv_mov_range', sql`${table.ivMov} >= 0 AND ${table.ivMov} <= 31`),
    check('iv_lea_range', sql`${table.ivLea} >= 0 AND ${table.ivLea} <= 31`),
    check('iv_cha_range', sql`${table.ivCha} >= 0 AND ${table.ivCha} <= 31`),
    // For fast inventory queries by user
    index('user_heroes_user_idx').on(table.userId),
  ],
);

export type UserHero = typeof userHeroes.$inferSelect;
export type NewUserHero = typeof userHeroes.$inferInsert;
