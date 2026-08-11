---
status: testing
phase: 08-foundation-economy-budget-content-infrastructure
source: [08-VERIFICATION.md]
started: 2026-08-11T07:30:00Z
updated: 2026-08-11T07:30:00Z
---

## Current Test

number: 1
name: Live boot + emoji render smoke test (TQC-04 / SC3 / D-14)
expected: |
  Boot the production bot shard (CLIENT_ID=1381818375633899562), confirm startup proceeds
  past the appId assertion, invoke /sanguo map in a test server and confirm all 7 zone markers
  render as emoji markup (never literal text). Optionally boot with a wrong CLIENT_ID and
  confirm hard-fail process.exit(1).
awaiting: user response

## Tests

### 1. Live boot + emoji render smoke test (TQC-04 / SC3 / D-14)
expected: Correct app id -> bot boots and /sanguo map renders emoji markup for all 7 zone markers; wrong app id -> hard-fail at startup with logged mismatch and non-zero exit.
result: [pending]

### 2. Fresh-database migrate + seed chain (SC2 / TQC-02 / D-11)
expected: On a fresh dev DB, `npx drizzle-kit migrate` (DATABASE_URL_DIRECT) then `npx tsx scripts/seed-sanguo.ts` twice both exit 0; second run leaves counts unchanged; heroes=132, map_nodes=7, sanguo_items=3; `SELECT count(*) FROM heroes WHERE name_zh IS NOT NULL` = 132.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
