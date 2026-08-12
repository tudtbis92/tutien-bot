---
status: completed
phase: 08-foundation-economy-budget-content-infrastructure
source: [08-VERIFICATION.md]
started: 2026-08-11T07:30:00Z
updated: 2026-08-12T02:45:00Z
---

## Current Test

number: 2
name: Deploy production — Phase 8 + post-gate (2026-08-12)
expected: |
  Deploy hoàn tất trên production: migrations 0014-0017 applied, seed sanguo đầy đủ,
  bot restart + Shard 0 ready, /health ok, journal 17 rows, không crash loop.
awaiting: done

## Tests

### 1. Live boot + emoji render smoke test (TQC-04 / SC3 / D-14)
expected: Correct app id -> bot boots and /sanguo map renders emoji markup for all 7 zone markers; wrong app id -> hard-fail at startup with logged mismatch and non-zero exit.
result: [pass] 2026-08-12 — CLIENT_ID wrong -> D-14 hard-fail exit 1 (logged mismatch); CLIENT_ID=1381818375633899562 -> boot full (Redis/i18n/pgBoss/16 commands incl. sanguo/map.js) + login OK. Production deploy boot confirmed Shard 0 ready.

### 1b. Emoji render fix — animated prefix + header size (TQC-04 / SC3 follow-up)
expected: All 7 zone markers render as emoji in a real Discord client (never literal text), readable size.
result: [pass] 2026-08-12 — Đợt 1 FAIL (user confirmed `:dtr_t0:` literal). Root cause: 1056/1056 sanguo emojis are ANIMATED (GIF) → Discord requires `<a:name:id>` markup, code emitted `<:name:id>` (missing `a:`). Fixed heroEmoji() + generator template + tests. Đợt 2 render OK. Header finding: `#` (H1) is largest; markdown headings render ONLY in message content, NOT in embed field/description values (discord/discord-api-docs#7167) → zone markers moved to message content with `# ` prefix (D-15 follow-up).

### 2. Fresh-database migrate + seed chain (SC2 / TQC-02 / D-11)
expected: On a fresh dev DB, `npx drizzle-kit migrate` (DATABASE_URL_DIRECT) then `npx tsx scripts/seed-sanguo.ts` twice both exit 0; second run leaves counts unchanged; heroes=132, map_nodes=7, sanguo_items=3; `SELECT count(*) FROM heroes WHERE name_zh IS NOT NULL` = 132.
result: [pass] 2026-08-12 — staging DB tutien_staging: migrate 0000→0017 exit 0 (18 journal rows), seed lần 1 + lần 2 exit 0 & counts không đổi. heroes=132, map_nodes=7, sanguo_items=3, hero_factions=14, hero_families=12, hero_relations=2, name_zh NOT NULL=132.

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
