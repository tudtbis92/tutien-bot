# Phase 6 & 6.1 UAT: Farming Logic & Channel Management

**Status:** COMPLETED
**End Date:** 2026-06-04
**Summary:** Verified core farming loops, smart logic, captcha detection, private channel management, auto-money transfer, and localized DM notification for Milestone v2 via code audit and comprehensive unit testing.

---

## 1. Channel Management (Phase 6.1)
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| CHN-01 | Setup Flow | `/farming` -> Modal -> Save token creates channel | PASSED | Verified in `farming.ts` and `channelService.ts`. |
| CHN-02 | Channel Permissions | Channel is private to User + Main Bot + Self-bot | PASSED | Verified permission overwrites in `channelService.ts`. |
| CHN-03 | Cleanup on Stop | `/farming stop` deletes the private channel | PASSED | Verified `deleteFarmingChannel` call in `farming.ts`. |

## 2. Core Farming Loop (Phase 6)
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| LOOP-01 | Hunt/Battle sequence | Bot sends `owo hunt` then `owo battle` | PASSED | Verified in `selfBotWorker.ts`. |
| LOOP-02 | Command Lock | No overlapping commands | PASSED | Verified `isCommandInProgress` flag usage. |
| LOOP-03 | Pray/Curse schedule | Decoupled 5m interval | PASSED | Verified separate `prayCurseTimer`. |
| HUMAN-01 | Randomized delays | Timing variance between 15-25s | PASSED | Verified `getRandomDelay` logic. |

## 3. Smart Logic (Phase 6)
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| SMART-01 | Gem re-application | Detects broken, uses from inv | PASSED | Verified regex extraction and `owo use` in loop. |
| SMART-02 | Essence/Huntbot | Sacrifices and refills | PARTIAL | Basic sacrifice and hb refill exist; specific essence upgrade logic is simplified. |
| SMART-03 | Checklist/Daily | Runs every 6h/daily | PASSED | Verified checklist parsing and daily execution. |

## 4. Captcha & Security (Phase 6)
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| CAP-01 | Detection (Text/Embed) | Stops on trigger | PASSED | Verified multi-vector detection (text, embed, attachment). |
| CAP-02 | DM Relay | User receives DM on captcha | PASSED | Verified that user locale is fetched from DB and translated warning is sent. |
| CAP-03 | Resume Flow | `/farming resume` restarts after status update | PASSED | Verified IPC signal in `farming.ts`. |

---

## 5. Summary of Issues & Gaps
| ID | Title | Severity | Status | Resolution |
|----|-------|----------|--------|------------|
| GAP-01 | Auto-Money Transfer | Medium | RESOLVED | Implemented auto-transfer with 1,000 reserve limit. |
| GAP-02 | DM Notification | Low | RESOLVED | Added DB locale lookup and i18next translation in `shard.ts`. |
| GAP-03 | Missing Tests | Low | RESOLVED | Created unit tests for ChannelService and SelfBotWorker; fixed SelfBotMaster mock issues. |
