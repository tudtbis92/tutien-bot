import {
  pgTable,
  serial,
  integer,
  bigint,
  varchar,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { characters } from './characters.js';

// Item type enum — covers all Phase 2+ item categories
export const itemTypeEnum = pgEnum('item_type', [
  'material',
  'consumable',
  'equipment',
  'formation',
  'stone',
  'scroll',
  'companion',
  'food',
  'artifact',
]);

export type ItemType = (typeof itemTypeEnum.enumValues)[number];

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  // i18n key for item name, e.g., 'game:items.linh_thao.ten_cay'
  nameI18nKey: varchar('name_i18n_key', { length: 100 }).notNull(),
  type: itemTypeEnum('type').notNull(),
  // CRITICAL: BigInt default as sql`0` due to drizzle-kit serialization bug (see Phase 1 SUMMARY)
  basePrice: bigint('base_price', { mode: 'bigint' }).notNull().default(sql`0`),
  // Unique items have is_unique=true, creator info set, base_price=0
  isUnique: boolean('is_unique').notNull().default(false),
  // FK to character who crafted this unique item — null for standard items
  creatorCharacterId: integer('creator_character_id').references(() => characters.id),
  // Custom name and emoji set by crafter at crafting time — unique items only
  customName: varchar('custom_name', { length: 50 }),
  customEmoji: varchar('custom_emoji', { length: 100 }),
  // Random attribute rolls for unique items (null for standard items)
  // Example: {"cultivation_multiplier": 1.08, "breakthrough_luck": 0.05}
  attributes: jsonb('attributes'),
  // Populated for unique items only — standard catalog items have null
  createdAt: timestamp('created_at', { withTimezone: true }),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
