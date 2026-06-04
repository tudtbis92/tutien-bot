# Phase 6 Validation: Farming Logic & Captcha Handling

## Overview
This document defines the verification criteria for the core farming logic and security handling of the OwO farming service.

## 1. Database & Infrastructure
- [ ] `farming_accounts` table contains `settings` JSONB column.
- [ ] `FarmingSettings` interface correctly mapped in code.
- [ ] `SelfBotMaster` successfully passes the full settings payload to child worker processes.

## 2. Core Farming Loop (FARM-03, FARM-07)
### Command Rotation & Lock
- [ ] Bot sends `owo hunt` and `owo battle` in sequence.
- [ ] Command lock (`isCommandInProgress`) successfully blocks overlapping commands if artificial delay is introduced or network lag occurs.
- [ ] Bot sends `owo pray` or `owo curse` on a decoupled 5-minute schedule rather than the high-frequency loop.
- [ ] **Verification:** Monitor worker logs for command sequence, execution locks, and separate intervals.

### Timing & Human Simulation
- [ ] Delays between commands are randomized within configured bounds (e.g., 15-25s).
- [ ] Bot enters "Periodic Sleep" after continuous farming and resumes automatically.
- [ ] Bot sends "Social Chatter" messages occasionally.
- [ ] **Verification:** Log analysis of execution timestamps and message content.

### Auto-Money Transfer
- [ ] Bot sends `owo give [mainAccount] [amount]` when balance exceeds threshold.
- [ ] **Verification:** Mock balance update or actual transaction check.

## 3. Smart Logic (FARM-03, FARM-07)
### Asset Management
- [ ] **Gems:** Bot detects "gem broken", runs `owo inv`, parses the available gem list table to get item IDs, and uses them.
- [ ] **Gems combined use:** Bot combines multiple gem usage into a single command: `owo use [gem1] [gem2] [gem3]` rather than separate messages.
- [ ] **Essence:** Bot executes `owo sacrifice` and `owo upgrade hb` based on priority.
- [ ] **Huntbot:** Bot executes `owo hb collect` and `owo hb refill`.
- [ ] **Verification:** Simulated responses in farming channel.

### Checklist Sync
- [ ] Bot executes `owo checklist` every 6h.
- [ ] Bot executes `owo daily` if missing.
- [ ] **Verification:** Log confirmation of checklist parsing.

## 4. Captcha & Security (FARM-04)
### Detection
- [ ] Bot stops immediately when captcha text triggers are detected in the active channel.
- [ ] Bot stops immediately when captcha text triggers are detected in DMs.
- [ ] Bot stops immediately when captcha triggers are found in embeds or attachments.
- [ ] Bot ignores captcha-like text sent by other user accounts (only reacts to the official `OWO_BOT_ID` '408785106942164992').
- [ ] Bot status in DB changes to `captcha_waiting`.
- [ ] **Verification:** Send test captcha phrases/embeds/attachments from a mock user and the official ID in both channel and DMs, then verify bot process stop.

### Notification Pipeline
- [ ] Main bot sends a DM to the user when captcha is detected.
- [ ] **Verification:** End-to-end test from worker detection to user DM receipt.

### Resume Flow
- [ ] `/farming resume` restarts the bot and sets status to `active`.
- [ ] **Verification:** Verify bot logs show "Starting loop" after command execution.

## 5. Load & Stability
- [ ] 100+ bots running in a single worker process without memory leak.
- [ ] Worker process restart (SIGTERM) handles clean shutdown of all loops.
