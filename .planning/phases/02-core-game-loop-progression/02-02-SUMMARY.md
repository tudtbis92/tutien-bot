---
phase: "02"
plan: "02"
subsystem: activity-pipeline
tags: [discord-events, anti-farming, pg-boss, redis, activity-worker, voice-tracking]
dependency_graph:
  requires:
    - "02-01"  # Schema foundation (characters, guild_activity, GAME_CONFIG)
    - "01-01"  # pgBoss infrastructure, Redis cooldown, DB client
  provides:
    - activity-event-pipeline       # messageCreate → pg-boss → ActivityWorker
    - voice-session-lifecycle       # voiceStateUpdate + VoiceMinuteWorker
    - anti-farming-5-layer-guard    # Redis L1 + DB cooldown + content quality + daily cap + anomaly
    - guild-activity-tracking       # guild_activity upsert on each tu vi award
    - daily-streak-system           # streak_days + STREAK_BONUSES bypassing daily cap
  affects:
    - "02-03"  # /start command needs character to be found in ActivityWorker (discordId lookup)
    - "02-06"  # /profile will show tuVi accumulated by this pipeline
tech_stack:
  added: []  # Zero new npm packages — Phase 2 uses Phase 1 stack only
  patterns:
    - fire-and-forget event handlers (void boss.send())
    - SELECT FOR UPDATE per-user serialization in db.transaction()
    - atomic UPDATE WHERE cap RETURNING pattern (no read-modify-write)
    - mark-as-paid voice session advancement (voiceSessionStartedAt + interval '1 minute')
    - Redis NX cooldown fast-path + DB timestamp truth source
    - pg-boss send-only mode (schedule/supervise/migrate=false) for shard processes
key_files:
  created:
    - src/events/messageCreate.ts
    - src/events/voiceStateUpdate.ts
    - src/events/messageReactionAdd.ts
    - src/workers/activityWorker.ts
    - src/workers/voiceWorker.ts
  modified:
    - src/shard.ts                  # Added MessageContent intent + initPgBossForShard()
    - src/workers/pgBoss.ts         # Added initPgBossForShard() + registerActivityWorker + registerVoiceMinuteWorker
decisions:
  - id: localConcurrency-5-not-1
    choice: "localConcurrency: 5 with SELECT FOR UPDATE"
    rationale: "Eliminates global queue bottleneck while preserving per-user serialization at DB row lock level. Two workers on same user queue at DB; different users run fully parallel."
  - id: shard-send-only-boss
    choice: "initPgBossForShard() with schedule/supervise/migrate=false"
    rationale: "Shards need boss.send() for fire-and-forget events. Disabling maintenance options prevents cron duplication and advisory lock conflicts with PgBouncer in shard processes."
  - id: streak-outside-transaction
    choice: "updateStreak() called with void after db.transaction() closes"
    rationale: "Streak update runs after the row lock is released. Avoids extending transaction hold time. Idempotency guard (lastActiveDate < today) prevents double-award."
  - id: content-dup-check-normalized
    choice: "Redis dup key uses first 50 chars normalized (lowercase, trimmed)"
    rationale: "Simple, fast, no crypto dependency. Catches copy-paste spam (identical content) without over-blocking legitimate similar messages."
metrics:
  duration: "~45 minutes"
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_created: 5
  files_modified: 2
---

# Phase 02 Plan 02: Activity Event Pipeline Summary

**One-liner:** Fire-and-forget activity pipeline with 5-layer anti-farming guard using SELECT FOR UPDATE per-user serialization and atomic RETURNING daily cap enforcement.

---

## What Was Built

### Task 1: Discord Event Handlers + shard.ts Intent
Three Discord event handlers that fire-and-forget to pg-boss without any DB I/O in the event loop:

- **`src/events/messageCreate.ts`**: Filters bot/DM/short content → Redis NX cooldown (60s) → `void boss.send('activity-queue', { type: 'message', ... })`
- **`src/events/voiceStateUpdate.ts`**: Detects JOIN/LEAVE transitions → sends `voice_join`/`voice_leave` jobs with selfMute/selfDeaf state
- **`src/events/messageReactionAdd.ts`**: Filters bot reactions + partial fetch → Redis NX cooldown → `void boss.send()`
- **`src/shard.ts`**: Added `GatewayIntentBits.MessageContent` (privileged intent required for `message.content`) + `initPgBossForShard()` call
- **`src/workers/pgBoss.ts`**: Added `export let boss` + `initPgBossForShard()` (send-only mode: schedule/supervise/migrate=false)

### Task 2: ActivityWorker (5-Layer Guard) + VoiceMinuteWorker

**`src/workers/activityWorker.ts`** — 5-layer anti-farming guard:

| Layer | What | Implementation |
|-------|------|----------------|
| L1 | Redis TTL re-verify | `getCooldownTTL(userId, channelId)` — drop if key still live |
| L2a | SELECT FOR UPDATE | `db.transaction() + .for('update')` — per-user row lock |
| L2b | DB cooldown | `lastMessageAt/lastReactionAt` vs `COOLDOWN_MS` |
| L3 | Content quality | Repeating chars `/(.)\1{4,}/` + Redis dup check (5min, 50-char normalized) |
| L4 | Atomic daily cap | `UPDATE WHERE dailyTuvi + amount <= DAILY_CAP RETURNING` — empty = cap hit |
| L5 | Anomaly counter | Redis `incr anomaly:{charId}:{date}` → `anomalyFlag=true` at threshold 10 |

Post-award: `guild_activity` upsert + `updateStreak()` (streak bonus bypasses daily cap).
Voice: `voice_join` sets `voiceSessionStartedAt`; `voice_leave` clears it.

**`src/workers/voiceWorker.ts`** — VoiceMinuteWorker on `* * * * *` cron:
- Mark-as-paid: `voiceSessionStartedAt + interval '1 minute'` per tick
- WHERE guards: daily cap + `VOICE_MAX_MINUTES` AFK protection
- `clearOrphanedVoiceSessions()`: startup sweep clears sessions older than 2h

**`src/workers/pgBoss.ts`** updates:
- Imports + calls `registerActivityWorker(b)` and `registerVoiceMinuteWorker(b)`
- Calls `clearOrphanedVoiceSessions()` after `boss.start()` in bot.ts context

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pgBoss `boss` variable not exported in Phase 1**
- **Found during:** Task 1 (when writing event handlers that import `boss`)
- **Issue:** pgBoss.ts declared `let boss: PgBoss | null = null` without `export`. Event handlers in shard.ts could not import it.
- **Fix:** Changed to `export let boss: PgBoss | null = null` with added clarifying comment.
- **Files modified:** `src/workers/pgBoss.ts`
- **Commit:** 68640d2

**2. [Rule 2 - Missing Critical] Shard processes had no pg-boss init for boss.send()**
- **Found during:** Task 1 (architectural analysis — shard is separate OS process)
- **Issue:** `boss` is null in shard processes until initialized. Event handlers call `boss!.send()` — would throw in production as boss was only initialized in bot.ts (ShardingManager), not in shard.ts.
- **Fix:** Added `initPgBossForShard()` function with `schedule/supervise/migrate=false` to create a send-only pg-boss instance for shard processes. Called from `shard.ts` before `loadEvents()`.
- **Files modified:** `src/workers/pgBoss.ts`, `src/shard.ts`
- **Commit:** 68640d2

---

## Architecture Notes

### Fire-and-Forget Pipeline
```
Discord Event → (filter + Redis NX) → void boss.send('activity-queue') → return
                                            ↓ (async, separate process)
                               ActivityWorker (5-layer guard)
                                            ↓ (if all layers pass)
                                  db.transaction() + FOR UPDATE
                                            ↓
                          UPDATE WHERE daily_tuvi + amount <= DAILY_CAP RETURNING
                                            ↓ (if RETURNING non-empty)
                                guild_activity upsert + updateStreak()
```

### SELECT FOR UPDATE Per-User Serialization
`localConcurrency: 5` + `SELECT FOR UPDATE` provides the correct balance:
- **Same user**: two concurrent jobs queue at the DB row lock → serialized processing
- **Different users**: run fully in parallel → no global bottleneck
- **Daily cap**: atomic WHERE clause is the final race-condition guard

### Voice Session Lifecycle
```
voiceStateUpdate (JOIN) → boss.send(voice_join) → ActivityWorker sets voiceSessionStartedAt
  ↓ (every minute)
VoiceMinuteWorker: UPDATE ... SET voiceSessionStartedAt + '1 minute' WHERE cap guards
  ↓
voiceStateUpdate (LEAVE) → boss.send(voice_leave) → ActivityWorker clears voiceSessionStartedAt
```

---

## Known Stubs

None. All functionality is fully wired:
- `boss.send()` from event handlers is real (not mocked)
- `db.transaction()` with `FOR UPDATE` is real Drizzle ORM
- Redis `getCooldownTTL` + `incr` + `set NX` are real ioredis calls

---

## Threat Surface Scan

All implemented mitigations match the plan's threat model:

| Threat ID | Mitigation | Implemented |
|-----------|-----------|-------------|
| T-02-ACT-02 | Atomic daily cap | ✅ `UPDATE WHERE dailyTuvi + amount <= DAILY_CAP RETURNING` |
| T-02-ACT-03 | 5-layer anti-farming | ✅ Redis NX + DB cooldown + content quality + cap + anomaly flag |
| T-02-ACT-04 | Voice AFK protection | ✅ VOICE_MAX_MINUTES WHERE clause + startup orphan sweep |
| T-02-ACT-06 | Worker not in shard | ✅ `registerActivityWorker` only in pgBoss.ts/bot.ts |
| T-02-ACT-07 | Job content expires | ✅ `expireInSeconds: 120` on all boss.send() calls |

No new unplanned threat surface introduced.

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/events/messageCreate.ts | ✅ FOUND |
| src/events/voiceStateUpdate.ts | ✅ FOUND |
| src/events/messageReactionAdd.ts | ✅ FOUND |
| src/workers/activityWorker.ts | ✅ FOUND |
| src/workers/voiceWorker.ts | ✅ FOUND |
| src/shard.ts (modified) | ✅ FOUND |
| src/workers/pgBoss.ts (modified) | ✅ FOUND |
| commit 68640d2 (Task 1) | ✅ FOUND |
| commit accebcb (Task 2) | ✅ FOUND |
