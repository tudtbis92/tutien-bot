---
status: partial
phase: 02-core-game-loop-progression
source: [02-VERIFICATION.md]
started: 2026-04-12T10:42:05Z
updated: 2026-04-12T10:42:05Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Activity pipeline end-to-end
expected: Send a message in a Discord channel → tu vi increases in /profile output

result: [pending]

### 2. Character registration and duplicate guard
expected: /start creates a character with weighted spiritual root; second /start returns friendly error

result: [pending]

### 3. Breakthrough probability at major realm boundary
expected: Multiple /đột_phá attempts at a major boundary show fail/success paths with penalty applied correctly

result: [pending]

### 4. Guild vs global leaderboard scope filtering
expected: /bxh without toàn_server shows only guild members; /bxh toàn_server:true shows global ranking

result: [pending]

### 5. Profession cap enforcement at realmId=0
expected: /nghề_nghiệp phân_bổ fails when 0 available points (new character at realm_id=0)

result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
