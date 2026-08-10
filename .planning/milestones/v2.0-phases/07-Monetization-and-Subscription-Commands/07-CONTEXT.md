# Phase 07: Monetization & Subscription Commands - Context & Decisions

## Context
This phase implements the subscription model for the OwO Self-bot Farming service. It focuses on the user flow for purchasing subscription packages using the existing in-game currency (Linh Thạch) and managing their self-bot's configuration based on their subscription tier.

## Core Decisions & Gray Area Resolutions

### 1. Linh Thạch Currency (MONET-02)
- **Decision:** **DEFERRED**. 
- **Rationale:** The architecture will remain simple for v1. We will NOT implement a dual-currency system (Premium vs. Bound Linh Thạch) at this time. All purchases will use the standard Linh Thạch (`users.balance`).

### 2. Top-up / Payment Flow (MONET-01 & MONET-04)
- **Decision:** **DEFERRED**.
- **Rationale:** We are not opening the top-up flow (Discord Native SKU or Manual Transfer) in Phase 07. This phase is strictly focused on creating the "sink" (spending mechanism) for Linh Thạch via the OwO farming service.

### 3. Subscription Model & Pricing (FARM-02)
- **Decision:** Three mutually exclusive packages with a mid-cycle upgrade path.
- **Pricing Structure:**
  - **Gói Tuần (7 Days - Normal):** 10,000 Linh Thạch.
  - **Gói Tháng (30 Days - Normal):** 35,000 Linh Thạch.
  - **Gói Nâng Cấp (30 Days - VIP):** 50,000 Linh Thạch.
- **Logic:** 
  - **Mutual Exclusivity:** A user can only have ONE active plan at a time. Purchasing a new plan while another is active will **overwrite** the previous plan's duration and type (the UI should show a warning).
  - **Upgrade Path:** If a user has an active "Normal" (Weekly/Monthly) plan, they can choose to upgrade to VIP for the remaining duration of their current plan.
  - **Upgrade Fee:** **1,000 Linh Thạch per remaining day** (rounded up to the nearest day).
  - **Upgrade Effect:** Changes `planType` from `basic` to `premium`. The expiry date remains the same.

### 4. Farming Feature Tiers (FARM-07)
- **Normal Tier (Gói Tuần / Gói Tháng):**
  - `hunt` (Auto-hunt)
  - `battle` (Auto-battle)
  - Basic inventory management (sell/sacrifice)
- **VIP Tier (Gói Nâng Cấp / Upgraded Plan):**
  - All Normal features
  - `pray` / `curse` (Auto-pray/curse)
  - `gamble` (Auto-gamble)
  - `autoGem` (Auto-use gems for hunting)
  - `economy.autoUpgradeHuntbot` (Auto-upgrade OwO huntbot)
  - `moneyTransfer` (Auto-transfer cowoncy to a main account)
  - `antiBan` (Social chatter and periodic sleep patterns)

### 5. UI and Profiles
- **Decision:** No global VIP UI.
- **Rationale:** Since VIP is currently only applicable to the OwO Farming service, we will NOT modify the global `/profile` command to show VIP badges or colored embeds. The subscription status (Basic/Premium and expiry date) will be displayed exclusively within the `/farming status` and `/farming setup` command interfaces.

## Locked Technical Constraints
- **State Management:** When a user's subscription expires or drops from Premium to Basic, their `FarmingSettings` MUST be sanitized to disable VIP features, and the active self-bot worker MUST be restarted with the downgraded configuration.
- **Currency Deduction:** Utilize Drizzle ORM's transactional guarantees to ensure Linh Thạch is safely deducted before granting subscription time. Rely on the existing `balance_non_negative` DB check constraint to prevent race conditions.
- **i18n:** All new UI elements (modals, buttons, purchase confirmations) must be fully localized (VI, EN, ZH-CN) via `locales/*/game.json`. No hardcoded strings.