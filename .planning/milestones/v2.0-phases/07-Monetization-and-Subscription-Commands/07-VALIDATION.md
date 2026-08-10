# Phase 07: Monetization & Subscription Commands - Validation

## Overview
This document defines the validation strategy for Phase 07, ensuring that the monetization and subscription systems are robust, secure, and meet all requirements.

## Test Strategy

### 1. Unit Testing
Focus on business logic isolation.
- **File:** `src/services/farming/__tests__/subscriptionService.test.ts`
- **Scope:** Upgrade fee calculation, pro-rating logic, date manipulations.
- **File:** `src/services/farming/__tests__/sanitization.test.ts`
- **Scope:** Correctness of `sanitizeFarmingSettings` for different tiers.

### 2. Integration Testing
Focus on database interactions and IPC.
- **File:** `src/services/farming/__tests__/integration.test.ts`
- **Scope:**
    - Atomic balance deduction (testing `.returning()` empty result on insufficient balance).
    - Database state after purchase/upgrade.
    - Master-Worker IPC notification flow (mocked `process.send`).
    - Free plan user exclusion from rebalance.
    - Plan overwrite behavior.

### 3. Command Logic Testing
Focus on the interaction layer.
- **File:** `src/commands/game/__tests__/farming.test.ts`
- **Scope:** 
    - Subcommand registration.
    - Button handler logic (ensuring service calls are made with correct parameters).
    - Response embeds contain required info (localized).

## Requirement Traceability Matrix

| Requirement ID | Test Case ID | Description | Verifier |
|----------------|--------------|-------------|----------|
| FARM-02 | TC-07-01 | Purchase basic plan (7D/30D) | `npm test` |
| FARM-02 | TC-07-02 | Upgrade basic to premium (prorated) | `npm test` |
| FARM-02 | TC-07-03 | Prevent purchase with insufficient balance | `npm test` |
| FARM-05 | TC-07-04 | Display subscription status in `/farming status` | `npm test` |
| FARM-05 | TC-07-05 | Display subscription status in `/farming setup` | `npm test` |
| FARM-07 | TC-07-06 | Enforce feature sanitization for basic tier | `npm test` |
| FARM-07 | TC-07-07 | Enforce feature sanitization for premium tier | `npm test` |
| INFRA-05 | TC-07-08 | All subscription UI strings are localized | `npm run i18n:check` |
| FARM-02 | TC-07-09 | Overwrite existing plan with new purchase (warning shown, old plan replaced) | `npm test` |
| FARM-02 | TC-07-10 | Concurrent purchase (rapid button click) — only one deduction succeeds | `npm test` |
| FARM-07 | TC-07-11 | Free plan user — bot NOT started by rebalance | `npm test` |
| FARM-02 | TC-07-12 | Purchase when balance exactly equals fee — succeeds | `npm test` |
| FARM-02 | TC-07-13 | Upgrade expired plan — rejected with PLAN_EXPIRED error | `npm test` |

## Success Criteria
- [ ] All unit and integration tests pass with 100% success rate.
- [ ] No negative balances possible via rapid button clicking (verified by atomic update + `.returning()` check).
- [ ] Expired subscriptions result in bot stoppage or downgrade within the rebalance interval (5m).
- [ ] Free plan users are never started by rebalance.
- [ ] Upgrade on expired plan is rejected with `PLAN_EXPIRED` error.
- [ ] UI correctly reflects the state stored in the database.
