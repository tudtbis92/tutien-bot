---
status: complete
phase: 01-foundation
source: 01-SUMMARY.md
started: 2026-04-11T14:35:00Z
updated: 2026-04-11T15:45:00Z
---

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running bot process. Start the application from scratch (npm start / pm2 start). Bot boots without errors, DB preflight passes, Redis preflight passes, shards launch, and GET /health returns {"status":"ok"} with db:"ok" and redis:"ok".
result: pass
note: Logs confirmed ok. /health returns {"status":"ok"} from localhost. Port 3000 blocked from public internet by iptables — intentional per plan (T-03 Step 8).

### 2. Bot Online & Shards Ready
expected: The bot tag appears as "Online" in Discord. Logs show "[INFO] [Ready] Logged in as <BotName>" and "[INFO] [ShardingManager] Shard 0 ready". Zero shard crash loops in pm2 restart counter.
result: pass

### 3. Health Check Endpoint
expected: curl http://localhost:3000/health (from inside the VM via SSH) returns HTTP 200 with JSON containing status:"ok", db:"ok", redis:"ok", shards array with status:0 (discord.js Status.Ready), and uptime > 0.
result: pass

### 4. Database Schema Migrated
expected: PostgreSQL has tables: users, seasons, __drizzle_migrations. users table has columns discord_id (varchar), balance (bigint), locale (varchar). Inserting balance=-1 fails with CHECK constraint. Inserting locale='fr' fails with CHECK constraint.
result: pass
note: users + seasons tables present. balance_non_negative and locale_valid constraints both enforced. __drizzle_migrations in drizzle internal schema (not shown in \dt) — migrations applied successfully.

### 5. Redis Cooldown
expected: redis-cli ping returns PONG. tryAcquireCooldown returns true on first call, false on immediate second call (still on cooldown). The key expires after the TTL and a third call returns true again.
result: pass

### 6. pg-boss VWAP Cron Registered
expected: SELECT name, cron FROM pgboss.schedule; returns exactly one row: vwap-recalc | 0 * * * *. The job is registered and will fire at the top of every hour.
result: pass

### 7. i18n Locale Files in Sync
expected: npm run check-i18n exits 0 with "All locale files are in sync." All 15 locale files present (5 namespaces × 3 locales: vi/en/zh-cn). No missing keys between locales.
result: pass

### 8. /ping Slash Command
expected: Typing /ping in Discord shows the command in autocomplete. Executing it returns an embed with the bot name, WebSocket latency in ms, and Shard ID. The embed color is green (SUCCESS).
result: issue
reported: "title là Tu Tien Bot không phải là Tu Tiên Bot"
severity: minor
root_cause: resolveLocale(null, interaction.locale) resolves to 'en' when Discord client is set to English — correct i18n behavior. Bot name in en.json uses ASCII fallback without diacritics. Decision needed: hardcode bot name or add diacritic version to EN locale.

### 9. ESLint Hardcoded String Block
expected: Adding a hardcoded user-facing string to any src/*.ts file and attempting to commit is blocked by the pre-commit hook with an ESLint error. npm run lint exits non-zero on that file.
result: pass

### 10. CI Pipeline (GitHub Actions)
expected: Pushing a commit to main triggers the CI job in GitHub Actions. Pipeline runs 5 steps: Lint → Typecheck → Check i18n → Test → Build. All steps pass green. The deploy job runs after CI passes.
result: pass
note: Required two fixes — (1) ci.yml missing workflow_call trigger (commit 7932897), (2) deploy.yml fingerprint field caused drone-ssh host key mismatch regardless of format tried; removed fingerprint entirely (commit 4877539). Pipeline now green.

### 11. Auto-Deploy via GitHub Actions
expected: After CI passes on a push to main, the deploy job SSHs into 168.138.8.160, runs git pull → npm ci → npm run build → drizzle-kit migrate → pm2 restart → health check. The workflow completes green with "Deploy complete."
result: pass
note: Deploy run 24285836759 completed with conclusion=success after fingerprint field was removed from deploy.yml.

## Summary

total: 11
passed: 10
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Bot name displays with Vietnamese diacritics (Tu Tiên Bot)"
  status: open
  reason: "EN locale bot name key uses ASCII 'Tu Tien Bot' without diacritics — resolves when user's Discord client is English"
  severity: minor
  test: 8
  root_cause: "i18n behavior is correct; EN translation for bot name lacks diacritics"
  artifacts:
    - path: "src/locales/en/"
      issue: "bot name key value is 'Tu Tien Bot' not 'Tu Tiên Bot'"
  missing:
    - "Decision: use 'Tu Tiên Bot' in all locales (bot name is a proper noun, not translated) OR accept ASCII in EN"
  debug_session: ""
