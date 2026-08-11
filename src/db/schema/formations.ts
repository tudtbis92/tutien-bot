import { pgTable, serial, varchar, integer, bigint, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * formations — formation catalog (Phase 8 post-gate schema, buy/sell Phase 11).
 * Each formation is a purchasable template defining class/slot layout.
 * base_price in bigint (linh thach) — mode: 'bigint' per users.balance pattern.
 */
export const formations = pgTable('formations', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  nameVi: varchar('name_vi', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  nameZh: varchar('name_zh', { length: 100 }),
  slotCount: integer('slot_count').notNull(),
  basePrice: bigint('base_price', { mode: 'bigint' }).notNull().default(0n),
});

/**
 * formation_slots — per-formation slot layout: which class occupies which
 * position and how many of that class the formation allows.
 */
export const formationSlots = pgTable('formation_slots', {
  id: serial('id').primaryKey(),
  formationId: integer('formation_id')
    .notNull()
    .references(() => formations.id),
  slotOrder: integer('slot_order').notNull(),
  class: varchar('class', { length: 20 }).notNull(),
  position: varchar('position', { length: 30 }),
  quantity: integer('quantity').notNull().default(1),
});

/**
 * user_formations — which formations a player owns (acquired_at for
 * purchase history; buy/sell transaction logic lands in Phase 11).
 */
export const userFormations = pgTable('user_formations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  formationId: integer('formation_id')
    .notNull()
    .references(() => formations.id),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Formation = typeof formations.$inferSelect;
export type NewFormation = typeof formations.$inferInsert;
export type FormationSlot = typeof formationSlots.$inferSelect;
export type NewFormationSlot = typeof formationSlots.$inferInsert;
export type UserFormation = typeof userFormations.$inferSelect;
export type NewUserFormation = typeof userFormations.$inferInsert;
