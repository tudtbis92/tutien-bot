# Research: Phase 6 — Farming Logic & Captcha Handling

## Overview
Phase 6 focuses on the core value proposition of the OwO Farming Service: automating the "hunt" and "battle" loops, managing assets (gems, essence, huntbot), and handling captchas safely.

## Requirements Mapping
- **FARM-03**: Auto-farm OwO (hunt, battle, cf, pray/curse).
- **FARM-04**: Captcha detection, pausing, and user notification.
- **FARM-07**: Custom strategies (settings-driven delays, command toggles, auto-gem).

## Current State & Gaps

### 1. Database Schema
- **Status:** The `farming_accounts` table is missing the `settings` JSONB column described in `06-CONTEXT.md`.
- **Action:** Need a migration to add `settings` to `farming_accounts`.
- **Action:** Need to update `farmingStatusEnum` to include `captcha_waiting` (already present in schema but verified).

### 2. Worker Architecture (`selfBotWorker.ts`)
- **Status:** Currently only handles login and proxy setup. No message processing or loop logic.
- **Gap:** Needs a robust loop system that respects randomized delays and handles command execution.
- **Gap:** Needs a `MessageCreate` handler to:
  - Detect captchas from OwO.
  - Parse OwO's responses for "Auto-Gem" logic (e.g., "gem broken").
  - Parse `owo checklist` results.

### 3. Master-Worker IPC (`selfBotMaster.ts`)
- **Status:** Basic status reporting (READY, ERROR, DISCONNECTED).
- **Gap:** Needs to handle `CAPTCHA_DETECTED` event from worker to notify user via the main bot.
- **Gap:** Needs to pass `settings` down to workers during `START_BOTS`.

## Technical Approach

### Farming Loop
Instead of a simple `setInterval`, use a recursive `setTimeout` pattern to allow for randomized delays between every command.
```typescript
async function runLoop(botId: string) {
  if (!active) return;
  await executeCommand(botId, 'hunt');
  const delay = random(15, 25) * 1000;
  setTimeout(() => runLoop(botId), delay);
}
```

### Captcha Detection
OwO captchas typically contain specific phrases, image links, embeds, or image attachments.
- **Reference Repo Alignment:** Our research of `advanced-discord-owo-tool-farm` shows that OwO Bot checks can occur in DMs as well as the active channel. Captchas can be delivered via text, embeds, or direct image attachments.
- **Patterns:** `Are you a human?`, `solve the captcha`, `verify you are human`, `owobot.com/captcha`.
- **Action:** Filter incoming messages globally to only parse messages from official `OWO_BOT_ID` (`408785106942164992`). Monitor both the active channel and DMs. Scan message content, embeds (titles, descriptions, URLs), and attachments. On match, immediately execute `client.destroy()`, update DB status to `captcha_waiting`, and notify the Master process.

### Settings Management
The `settings` JSONB will be the "brain" of the worker.
- Use a default settings object for new accounts.
- Deep merge user overrides.

## Risk Assessment
- **Detection Risk (Timing Patterns):** Rapid, perfectly timed commands lead to bans. **Mitigation:** High-variance randomized delays (15-25s) and periodic "sleep" periods.
- **Detection Risk (Overlapping Commands / Double Spam):** If lag causes multiple timeouts to overlap, commands will fire concurrently, triggering automated spam bans. **Mitigation:** Implement a strict command lock (`isCommandInProgress` flag) or execution queue.
- **Detection Risk (Pray/Curse Spam):** Spamming `pray` commands in the high-frequency loop triggers warnings. **Mitigation:** Decouple long cooldown commands (`pray/curse`, `checklist`, `sacrifice`) onto their own separate timer tracks.
- **Resource Exhaustion:** Hundreds of loops running in one process. **Mitigation:** Phase 5 already implements `BATCH_SIZE = 100` per worker process.
- **Proxy Failure:** If a proxy dies, the bot disconnects. **Mitigation:** Existing `DISCONNECTED` handler in `SelfBotMaster` marks it as `stopped`.

## Verification Plan
1. **Unit Tests:** Mock `discord.js-selfbot-v13` to verify captcha detection logic and delay randomization.
2. **Integration Tests:** Use a test account (with a proxy) to verify the "hunt" command is sent and the response is parsed.
3. **Manual UAT:** Verify that solving a captcha and using `/farming resume` correctly restarts the loop.
