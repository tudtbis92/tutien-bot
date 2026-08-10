# Phase 06 Context: Farming Logic & Captcha Handling

## Phase Goal
Implement the core farming loop and captcha detection for the OwO farming service, ensuring safe operation and reliable user notification.

## Decisions

### D-01: Farming Commands & Scope
We will support the following commands in the initial implementation:
- `hunt` and `battle` (Primary loop)
- `pray` and `curse` (Social/Support)
- `cf` (Gamble - optional toggle)
- `inv` and `use` (Internal for Auto-Gem)
- `sacrifice` (Convert animals to Essence)
- `sell` (Convert animals to Cowoncy)
- `upgrade` (Use Essence to upgrade Huntbot)
- `hb` (Manage official Huntbot: buy/collect/refill)
- `checklist` (Verify daily/vote status)

### D-02: Configuration Storage & Smart Logic
User-specific strategies and toggles will be stored in a `settings` JSONB column in `farming_accounts`.

**Advanced Settings Schema:**
```json
{
  "active": true,
  "channelId": "string",
  "commands": {
    "hunt": true,
    "battle": true,
    "pray": { "enabled": false, "targetId": null },
    "gamble": { "enabled": false, "amount": 100 }
  },
  "economy": {
    "sacrificeRanks": ["common", "uncommon"],
    "sellRanks": ["rare", "epic"],
    "autoUpgradeHuntbot": true,
    "upgradePriority": ["efficiency", "gain", "duration"]
  },
  "autoGem": {
    "enabled": true,
    "preferredTiers": {
      "hunting": 3,
      "lucky": 3,
      "empowering": 1
    },
    "useSpecialGemsDuringEvents": true
  },
  "delays": {
    "minSeconds": 15,
    "maxSeconds": 25
  },
  "antiBan": {
    "socialChatter": true,
    "periodicSleep": true
  }
}
```

**Smart Logic Details:**
1. **Gem Re-application:** The worker will parse "gem broken" messages or check `owo inv` periodically to maintain 100% uptime of the user's preferred 3-gem stack (Hunting, Lucky, Empowering). Gem usage must be optimized by combining them into a single command (`owo use [gem1_id] [gem2_id] [gem3_id]`) to minimize message footprint.
2. **Essence Management:** Automate `owo sacrifice [rank] all` based on settings. Use collected Essence to `owo upgrade hb [trait]` according to the defined priority.
3. **Huntbot Synergy:** The self-bot will run alongside the official `huntbot`. It will automate `owo hb buy` and `owo hb collect` to maximize passive income.
4. **Human Simulation:**
   - **Social Chatter:** Send random phrases or replies occasionally to level up and mimic human interaction.
   - **Checklist Sync:** Run `owo checklist` every 6 hours and notify/automate missing tasks (daily, vote).
   - **Team Rotation:** Periodically switch between battle teams (`owo setteam 1/2`) to balance XP gains.

### D-03: Captcha Detection & Response
- **Detection:** The `selfBotWorker` will monitor incoming messages globally from the official OwO Bot ID (`408785106942164992`). It will scan both the designated `channelId` and Direct Messages (DMs) for captcha messages. The scanner will check:
  - `message.content` for captcha trigger phrases (e.g., "Are you a human?", "Please solve the captcha", "verify you are human") and website links ("owobot.com/captcha").
  - `message.embeds` (titles, descriptions, URLs).
  - `message.attachments` (presence of captcha images).
- **Response:**
  1. Immediately stop all command execution for that account.
  2. Update `farming_accounts.status` to `captcha_waiting` in the database.
  3. Emit a `CAPTCHA_DETECTED` event to the `selfBotMaster`.
  4. `selfBotMaster` will trigger a notification via the Main Bot (DM to the user).

### D-04: Resume Flow
Users must manually resume farming after solving a captcha via a slash command: `/farming resume`. This command will:
1. Validate that the captcha is actually gone (optional/manual check).
2. Set `status` back to `active`.
3. Notify the `selfBotMaster` to restart the farming loop for that account.

### D-05: Anti-Ban/Human Simulation & Execution Safety
- **Randomized Delays:** Every command execution will have a randomized delay within the user-defined `minSeconds` and `maxSeconds`.
- **Command Lock:** To prevent concurrent execution due to network latency, the worker must implement a lock (`isCommandInProgress: boolean`) or a command queue. A new command is only sent if the previous command has completed.
- **Decoupled Cooldowns:** Commands with long cooldowns (such as `pray`/`curse` every 5 minutes, `checklist` every 6 hours, `sacrifice`/`upgrade` every 2 hours) must be run on independent interval timers or guarded by timestamp checks rather than being part of the primary `hunt`/`battle` command rotation loop.
- **Periodic Sleep:** The system will occasionally pause for 5-15 minutes every 1-2 hours of continuous farming.

## Reusable Assets
- `selfBotWorker.ts`: Already handles client login and proxying. Will be extended with farming logic.
- `EncryptionService.ts`: Used for decrypting tokens.
- `ProxyService.ts`: Used for mapping accounts to proxies.

## Remaining Gray Areas (Deferred)
- **Auto-Captcha Solving:** External API integration (2Captcha, etc.) is deferred to Phase 8 or later.
- **Auto-Selling Animals:** Deferred to Phase 7.
- **Multiple Channel Rotation:** Deferred to Phase 7.
