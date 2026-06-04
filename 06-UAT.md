# Phase 6 & 6.1 UAT: Farming Logic & Channel Management

**Status:** IN_PROGRESS
**Start Date:** 2026-06-04
**Summary:** Testing core farming loops, smart logic, captcha detection, and private channel management for Milestone v2.

---

## 1. Channel Management (Phase 6.1)
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| CHN-01 | Setup Flow | `/farming` -> Modal -> Save token creates channel | PENDING | |
| CHN-02 | Channel Permissions | Channel is private to User + Main Bot + Self-bot | PENDING | |
| CHN-03 | Cleanup on Stop | `/farming stop` deletes the private channel | PENDING | |

## 2. Core Farming Loop (Phase 6)
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| LOOP-01 | Hunt/Battle sequence | Bot sends `owo hunt` then `owo battle` | PENDING | |
| LOOP-02 | Command Lock | No overlapping commands | PENDING | |
| LOOP-03 | Pray/Curse schedule | Decoupled 5m interval | PENDING | |
| HUMAN-01 | Randomized delays | Timing variance between 15-25s | PENDING | |

## 3. Smart Logic (Phase 6)
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| SMART-01 | Gem re-application | Detects broken, uses from inv | PENDING | |
| SMART-02 | Essence/Huntbot | Sacrifices and refills | PENDING | |
| SMART-03 | Checklist/Daily | Runs every 6h/daily | PENDING | |

## 4. Captcha & Security (Phase 6)
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| CAP-01 | Detection (Text/Embed) | Stops on trigger | PENDING | |
| CAP-02 | DM Relay | User receives DM on captcha | PENDING | |
| CAP-03 | Resume Flow | `/farming resume` restarts after status update | PENDING | |

---

## 5. Summary of Issues
| ID | Title | Severity | Status | Resolution |
|----|-------|----------|--------|------------|
| - | No issues found yet | - | - | - |
