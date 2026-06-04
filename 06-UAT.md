# Phase 6 UAT: Farming Logic & Captcha Handling

**Status:** IN_PROGRESS
**Start Date:** 2026-06-04
**Summary:** Testing core farming loops, smart logic, and captcha detection for Milestone v2.

---

## 1. Database & Infrastructure
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| DB-01 | `farming_accounts` settings column | Column exists and is `jsonb` | PASS | Migration `0011` verified. |
| INF-01 | `FarmingSettings` interface | Interface matches schema and usage | PASS | Verified in `src/types/farming.ts`. |
| INF-02 | Settings propagation | Master passes settings to Worker | PASS | Verified in `SelfBotMaster.ts` rebalance logic. |

## 2. Core Farming Loop
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| LOOP-01 | Hunt/Battle sequence | Bot sends `owo hunt` then `owo battle` | PENDING | |
| LOOP-02 | Command Lock | No overlapping commands | PENDING | |
| LOOP-03 | Pray/Curse schedule | Decoupled 5m interval | PENDING | |
| HUMAN-01 | Randomized delays | Timing variance between 15-25s | PENDING | |
| HUMAN-02 | Periodic Sleep | Bot stops then resumes | PENDING | |

## 3. Smart Logic
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| SMART-01 | Gem re-application | Detects broken, uses from inv | PENDING | |
| SMART-02 | Essence/Huntbot | Sacrifices and refills | PENDING | |
| SMART-03 | Checklist/Daily | Runs every 6h/daily | PENDING | |

## 4. Captcha & Security
| Test Case | Description | Expected Result | Status | Notes |
|-----------|-------------|-----------------|--------|-------|
| CAP-01 | Detection (Text/Embed) | Stops on trigger | PENDING | |
| CAP-02 | DM Relay | User receives DM on captcha | PENDING | |
| CAP-03 | Resume Flow | `/farming resume` restarts | PENDING | |

---

## 5. Summary of Issues
| ID | Title | Severity | Status | Resolution |
|----|-------|----------|--------|------------|
| - | No issues found yet | - | - | - |
