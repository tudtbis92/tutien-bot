# Phase 07: Monetization & Subscription Commands - Research

**Researched:** 2024-05-24
**Domain:** Monetization, Subscription Management, Transaction Safety
**Confidence:** HIGH

## Summary

This phase implements the purchase flow for OwO farming subscriptions using Linh Thạch (spirit stones). Users can buy Weekly (7 days), Monthly (30 days), or VIP Upgrade plans. The system ensures transactional safety for currency deduction and maintains mutual exclusivity between plans. When a subscription status changes (expires or upgrades), the self-bot worker is notified to reload settings and apply feature-tier sanitization.

**Primary recommendation:** Use Drizzle ORM transactions with `.returning()` verification as an atomic guard for balance deduction (idiomatic Drizzle pattern — avoid raw `rowCount`), and utilize the existing IPC mechanism (`process.send`) to trigger `SelfBotMaster.rebalance()` whenever a subscription is modified.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Linh Thạch Currency:** All purchases use standard Linh Thạch (`users.balance`). No dual-currency system for v1.
- **Top-up Flow:** Deferred (MONET-01, MONET-04). Strictly focused on the spending mechanism.
- **Subscription Model:** Three mutually exclusive packages (Weekly, Monthly, VIP Upgrade).
- **Upgrade Path:** Prorated fee of 1,000 Linh Thạch per remaining day (rounded up).
- **Farming Feature Tiers:** Strict separation between Normal (Hunt/Battle) and VIP (Pray/Curse/Gamble/Gems/etc.) features.
- **UI:** Expiration and plan details displayed only in `/farming status` and `/farming setup`. No global VIP badges.

### the agent's Discretion
- Implementation of the background expiry check (re-use `SelfBotMaster.rebalance` or separate job).
- Exact UI layout for the purchase confirmation and error embeds.

### Deferred Ideas (OUT OF SCOPE)
- Dual-currency system (Premium vs. Bound Linh Thạch).
- Automatic top-up via Discord Native SKU or manual transfer (MONET-01, MONET-04).
- Global VIP profile enhancements.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FARM-02 | Purchase plans & upgrades | Transactional safety pattern verified in `gather.ts`. Pro-rated fee calculation logic defined. |
| FARM-05 | Status display | Mapping for `/farming status` and `/farming setup` defined. |
| FARM-07 | Feature sanitization | Sanitization logic for Basic vs Premium tiers defined in Architecture Patterns. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Plan Purchase | API / Backend | Database | Transactional logic for currency and plan updates. |
| Expiry Management | API / Backend | pg-boss | Background job to stop expired farming bots. |
| Feature Sanitization | API / Backend | — | Enforcing VIP/Basic feature sets before sending to worker. |
| Status UI | Browser / Client | — | Displaying plan details in `/farming status`. |
| Worker Reload | API / Backend | Sharding Manager | Notifying the Self-bot Master via IPC to restart workers. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | ^0.30.0 | Database Access & Transactions | Project standard for type-safe SQL and transactional integrity. |
| `discord.js` | ^14.14.0 | UI Components (Buttons/Embeds) | Core framework for bot interactions. |
| `dayjs` | ^1.11.10 | Date Manipulation | standard for expiry calculation and formatting. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `pg-boss` | ^9.0.0 | Background Jobs | For periodic subscription expiry checks (if needed beyond rebalance). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| IPC Reload | Direct Redis Pub/Sub | IPC is already implemented and simpler for single-host sharding. |

**Installation:**
```bash
# No new packages required. Existing stack covers all needs.
npm list drizzle-orm discord.js dayjs
```

## Package Legitimacy Audit

No new external packages are being introduced in this phase.

## Architecture Patterns

### Subscription Update Flow (Purchase/Upgrade)
1. **User Interaction:** User clicks "Buy Weekly" or "Buy Monthly" button.
2. **Transaction Start:**
   - Fetch user balance and current subscription.
   - Verify eligibility (e.g., sufficient balance, not already on a higher plan).
   - Atomic `UPDATE users SET balance = balance - fee WHERE id = ? AND balance >= fee` with `.returning({ id: users.id })`.
   - If `.returning()` result is empty, rollback and throw `INSUFFICIENT_BALANCE`.
   - `INSERT` or `UPDATE` `farming_subscriptions` with new `planType` and `expiresAt`.
3. **Notify Master:**
   - Call `process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId })`.
4. **Master Rebalance:**
   - `SelfBotMaster` fetches updated account and subscription.
   - Sanitizes `FarmingSettings` based on `planType`.
   - Sends `START_BOTS` to the worker.
5. **Worker Restart:**
   - `SelfBotWorker` restarts the loop with sanitized settings.

### Project Structure
```
src/
├── commands/
│   └── game/
│       └── farming.ts      # Updated with purchase handlers
├── services/
│   └── farming/
│       └── subscriptionService.ts  # Logic for pricing, upgrade fees, and sanitization
└── db/
    └── schema/
        └── farming.ts      # Schema updates (userId type fix)
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date Math | Native `Date` offsets | `dayjs` | Handling months and leap years correctly. |
| Atomic Deduction | In-memory balance check | `UPDATE ... WHERE balance >= fee` | Prevents race conditions (double spending). |
| Encrypted Storage | Custom cipher | `EncryptionService` | Project already provides hardened AES-256-GCM. |

## Architecture Patterns (Code Examples)

### Upgrade Fee Calculation
```typescript
/**
 * Upgrade Fee: 1,000 Linh Thạch per remaining day (rounded up).
 * IMPORTANT: Use dayjs.utc() for timezone consistency.
 * Guard: Reject upgrade on expired plans to prevent free upgrade exploit.
 */
export function calculateUpgradeFee(expiresAt: Date): bigint {
  const now = dayjs.utc();
  const expiry = dayjs.utc(expiresAt);
  const daysLeft = Math.ceil(expiry.diff(now, 'day', true));
  if (daysLeft <= 0) throw new Error('PLAN_EXPIRED');
  return BigInt(daysLeft * 1000);
}
```

### Feature Tier Sanitization
```typescript
// Source: Project reasoning based on Phase 07 Context
export function sanitizeFarmingSettings(settings: FarmingSettings, planType: 'free' | 'basic' | 'premium'): FarmingSettings {
  if (planType === 'premium') return settings;
  
  // Basic tier restricts everything except hunt, battle, and basic inventory
  return {
    ...settings,
    commands: {
      ...settings.commands,
      pray: { enabled: false, targetId: null },
      curse: { enabled: false, targetId: null },
      gamble: { ...settings.commands.gamble, enabled: false },
    },
    economy: {
      ...settings.economy,
      autoUpgradeHuntbot: false,
    },
    autoGem: {
      enabled: false,
      preferredTiers: { hunting: 0, lucky: 0, empowering: 0 },
      useSpecialGemsDuringEvents: false,
    },
    antiBan: {
      socialChatter: false,
      periodicSleep: false,
    },
    moneyTransfer: {
      enabled: false,
      mainAccountId: null,
      threshold: 0,
    },
  };
}
```

## Common Pitfalls

### Pitfall 1: Non-Atomic Balance Deduction
**What goes wrong:** User clicks button twice rapidly; both checks pass before either deduction finishes, resulting in a negative balance or double purchase.
**How to avoid:** Always use `UPDATE ... WHERE balance >= fee` and check the number of rows affected.

### Pitfall 2: Silent Expiry
**What goes wrong:** Subscription expires, but the worker keeps running with Premium features until the next manual reload.
**How to avoid:** `SelfBotMaster.rebalance()` runs periodically (5m), but we should also ensure it checks the `expiresAt` field and stops bots/sanitizes settings.

### Pitfall 3: Timezone Drift
**What goes wrong:** DB uses UTC, but application might use local time for calculations.
**How to avoid:** Always use `dayjs.utc()` for both `now` and DB timestamps. Import `dayjs.extend(utc)` at module level. (Project uses `timestamp` without timezone — PostgreSQL stores as UTC.)

### Pitfall 4: Free Plan Users in Rebalance
**What goes wrong:** `farming_subscriptions` default is `planType = 'free'`. If rebalance doesn't explicitly exclude 'free', bots could start for non-paying users.
**How to avoid:** Filter rebalance query: `WHERE planType != 'free' AND expiresAt > NOW()`.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `farming_subscriptions.user_id` is `bigint` | Migration to change to `integer` and add FK to `users.id`. |
| Live service config | `FarmingSettings` in JSONB | Sanitization required when loading into worker. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Data layer | ✓ | 15+ | — |
| Redis | Caching | ✓ | 7.2 | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FARM-02 | Purchase basic plan | Integration | `npm test src/services/farming/__tests__/subscriptionService.test.ts` | ❌ Wave 0 |
| FARM-02 | Upgrade to premium | Integration | `npm test src/services/farming/__tests__/subscriptionService.test.ts` | ❌ Wave 0 |
| FARM-07 | Sanitization | Unit | `npm test src/services/farming/__tests__/sanitization.test.ts` | ❌ Wave 0 |
| FARM-05 | Status display | Integration | `npm test src/commands/game/__tests__/farming.test.ts` | ❌ Wave 0 |

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Validate `userId` and `planId` in command handlers. |
| V6 Cryptography | yes | `EncryptionService` (AES-256-GCM) for tokens. |
| V12 Business Logic | yes | Atomic currency deduction; expiration checks. |

### Known Threat Patterns for Discord/Postgres Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Race Condition (Double Spend) | Tampering | Atomic SQL Update with `WHERE balance >= fee`. |
| Token Theft | Information Disclosure | AES-256-GCM encryption; restricted worker access. |

## Sources

### Primary (HIGH confidence)
- `src/db/schema/farming.ts`: Verified existing subscription table structure.
- `src/commands/game/gather.ts`: Verified transaction safety pattern for currency.
- `src/workers/selfBotMaster.ts`: Verified worker rebalance and IPC notification mechanism.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH - Uses existing project libraries.
- Architecture: HIGH - Integration with existing `SelfBotMaster` is clear.
- Pitfalls: HIGH - Double-spend and expiry are known vectors in this codebase.

**Research date:** 2024-05-24
**Valid until:** 2024-06-24
