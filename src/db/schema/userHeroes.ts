import { pgTable, serial, integer, smallint, timestamp, check, index } from 'drizzle-orm/pg-core';
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
    // Six IV columns (0-31) — rolled at capture (Phase 10 TQC-12)
    ivHp: smallint('iv_hp').notNull(),
    ivAtk: smallint('iv_atk').notNull(),
    ivDef: smallint('iv_def').notNull(),
    ivSpd: smallint('iv_spd').notNull(),
    ivCrit: smallint('iv_crit').notNull(),
    ivLuck: smallint('iv_luck').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // IV range checks — each stat bounded 0-31 per TQC-02
    check('iv_hp_range', sql`${table.ivHp} >= 0 AND ${table.ivHp} <= 31`),
    check('iv_atk_range', sql`${table.ivAtk} >= 0 AND ${table.ivAtk} <= 31`),
    check('iv_def_range', sql`${table.ivDef} >= 0 AND ${table.ivDef} <= 31`),
    check('iv_spd_range', sql`${table.ivSpd} >= 0 AND ${table.ivSpd} <= 31`),
    check('iv_crit_range', sql`${table.ivCrit} >= 0 AND ${table.ivCrit} <= 31`),
    check('iv_luck_range', sql`${table.ivLuck} >= 0 AND ${table.ivLuck} <= 31`),
    // For fast inventory queries by user
    index('user_heroes_user_idx').on(table.userId),
  ],
);

export type UserHero = typeof userHeroes.$inferSelect;
export type NewUserHero = typeof userHeroes.$inferInsert;
