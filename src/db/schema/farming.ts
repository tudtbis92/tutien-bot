import { pgTable, serial, integer, text, timestamp, pgEnum, bigint } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const farmingStatusEnum = pgEnum('farming_status', ['active', 'invalid', 'captcha_waiting', 'stopped']);
export const farmingPlanEnum = pgEnum('farming_plan', ['free', 'basic', 'premium']);
export const proxyStatusEnum = pgEnum('proxy_status', ['active', 'dead', 'maintenance']);

export const proxies = pgTable('proxies', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  location: text('location'),
  provider: text('provider'),
  status: proxyStatusEnum('status').notNull().default('active'),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const farmingAccounts = pgTable('farming_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  encryptedToken: text('encrypted_token').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  keyVersion: text('key_version').notNull(),
  proxyUrl: text('proxy_url'),
  proxyId: integer('proxy_id').references(() => proxies.id),
  status: farmingStatusEnum('status').notNull().default('stopped'),
  workerId: integer('worker_id'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const farmingSubscriptions = pgTable('farming_subscriptions', {
  id: serial('id').primaryKey(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull(), // Assuming bigint in plan
  planType: farmingPlanEnum('plan_type').notNull().default('free'),
  expiresAt: timestamp('expires_at'),
});

export type FarmingAccount = typeof farmingAccounts.$inferSelect;
export type NewFarmingAccount = typeof farmingAccounts.$inferInsert;

export type FarmingSubscription = typeof farmingSubscriptions.$inferSelect;
export type NewFarmingSubscription = typeof farmingSubscriptions.$inferInsert;

export type Proxy = typeof proxies.$inferSelect;
export type NewProxy = typeof proxies.$inferInsert;
