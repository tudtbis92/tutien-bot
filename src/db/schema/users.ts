import { pgTable, serial, varchar, bigint, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  discordId: varchar('discord_id', { length: 20 }).notNull().unique(),
  // CRITICAL: mode: 'bigint' returns JS BigInt — never use mode: 'number' for currency
  // Display with formatBalance() from src/utils/format.ts — never embed BigInt directly
  // Note: DB default expressed as sql`0` due to drizzle-kit BigInt serialization limitation
  balance: bigint('balance', { mode: 'bigint' }).notNull().default(sql`0`),
  // Constrained to supported locales — prevents data drift in locale resolution
  locale: varchar('locale', { length: 10 }).default('vi'),
}, (table) => [
  // DB-level guard against double-spend bugs (balance can never go negative)
  check('balance_non_negative', sql`${table.balance} >= 0`),
  // Enforce only valid locale values at DB level — matches resolveLocale() supported set
  check('locale_valid', sql`${table.locale} IN ('vi', 'en', 'zh-cn')`),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
