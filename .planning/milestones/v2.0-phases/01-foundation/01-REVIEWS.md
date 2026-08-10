---
phase: 1
reviewers: [gemini, codex]
reviewed_at: 2026-04-11T00:00:00Z
plans_reviewed: [01-PLAN.md]
notes: claude CLI not logged in (skipped); opencode is current runtime (skipped for independence)
---

# Cross-AI Plan Review — Phase 1: Foundation

## Gemini Review

### Summary

The implementation plan for **Phase 1: Foundation** is exceptionally well-structured and reflects a high level of senior-level architectural foresight. It successfully balances rapid bootstrapping with the strict enforcement of long-term maintainability (specifically through the i18n linting and PgBouncer integration). The decision to place `pg-boss` and the health server in the `ShardingManager` process is a critical win, preventing common distributed system pitfalls (like duplicate cron execution) early in the lifecycle. The plan is technically sound, utilizes modern best practices, and provides a robust "load-bearing" foundation for the subsequent RPG logic.

### Strengths

- **Infrastructure Maturity:** Incorporating **PgBouncer** and **pg-boss** from Day 1 demonstrates a deep understanding of PostgreSQL-centric bot scaling. Many projects skip pooling until they hit connection limits; addressing it now prevents painful refactors.
- **Architectural Discipline:** The separation of the `ShardingManager` (Manager) and `Shard` (Worker) responsibilities is clearly defined. Running the health check and job scheduler only in the Manager process is the correct approach for a stateless shard architecture.
- **Zero-Debt i18n Strategy:** The combination of `eslint-plugin-i18next`, a custom CLI key checker, and a Husky pre-commit hook is a "gold standard" approach. It ensures that "Phase 2" developers cannot introduce hardcoded strings, which is the most common form of technical debt in multi-language bots.
- **Type Safety & Validation:** Using **Zod** for environment variable validation ensures that the bot fails fast and clearly if the deployment environment is misconfigured, rather than crashing silently with `undefined` errors.
- **Surgical Database Strategy:** Using `DATABASE_URL_DIRECT` for migrations and `pg-boss` while using the PgBouncer port for general runtime queries is exactly how transaction-mode pooling should be handled to avoid advisory lock failures.

### Concerns

- **[MEDIUM] PostgreSQL Connection Saturation:** T-04 specifies `max: 5` connections per shard. While this seems low, if the bot scales to 40+ shards (common on large bots), you are looking at 200+ connections plus the Manager's connections. If the Oracle VM's `max_connections` isn't tuned, the bot might fail to start as it scales.
- **[MEDIUM] Command Registration Race Conditions:** T-09 suggests the shard entry point registers slash commands via REST. In a sharded environment, if every shard attempts to register commands globally on startup, you may hit Discord's global rate limits or cause redundant API calls.
- **[LOW] BigInt Serialization in UI:** Using `BIGINT` in PostgreSQL for currency is correct, but JavaScript's `JSON.stringify` does not support `BigInt` by default. This will cause the Health Check or any API/UI logging to throw errors if balances are included in JSON responses.
- **[LOW] Graceful Shutdown:** PM2 will send `SIGINT` to the processes. If the DB/Redis clients and `pg-boss` don't listen for this, active jobs might be killed mid-execution without returning to the queue.

### Suggestions

- **Dedicated Command Deploy Script:** Move the slash command registration out of the `shard.ts` startup logic and into a standalone script (e.g., `scripts/deploy-commands.ts`). Run this script once during the GitHub Actions `deploy` phase. This prevents 40+ shards from all trying to update the same global commands simultaneously.
- **Connection Limit Math:** Add a check or a comment in `config.ts` that calculates the total expected connections (`Shards * MaxPool + ManagerPool`). Ensure the Oracle VM's `postgresql.conf` is updated to support at least 1.5x that number.
- **BigInt JSON Helper:** Add a small utility in `src/utils/format.ts` or a global polyfill to handle `BigInt.prototype.toJSON` so that `JSON.stringify` can safely handle currency values.
- **Lifecycle Management:** Ensure `shard.ts` and `bot.ts` include a `process.on('SIGINT', ...)` block to call `db.end()`, `redis.quit()`, and `boss.stop()` gracefully.
- **Drizzle-Kit Introspection:** Add a task to verify `drizzle-kit check` in the CI pipeline to ensure the generated migrations actually match the TypeScript schema files before deployment.

### Risk Assessment: LOW

The overall risk is **LOW**. The plan is highly detailed, follows industry-standard patterns for high-scale Discord bots, and includes automated enforcements (ESLint, Zod, CI/CD) that prevent the most common "human error" failures. The few concerns listed are optimizations for scale rather than fundamental flaws in the foundation. This plan provides a rock-solid base for building the "TuTien" RPG features.

---

## Codex Review

### Summary

Plan này nhìn chung mạnh, có cấu trúc tốt, bám sát goal của Phase 1 và đã phản ánh đúng các quyết định kiến trúc quan trọng của dự án: shard stateless, PgBouncer từ ngày đầu, pg-boss chỉ chạy ở manager, i18n wired sớm, CI/CD deploy thẳng lên VM. Task breakdown khá hợp lý, critical path rõ, và phần lớn hạ tầng "load-bearing" đã được đưa vào scope thay vì để nợ sang phase sau. Điểm yếu chính không nằm ở hướng đi mà ở vài khoảng trống vận hành và tính đúng đắn: command registration/deploy flow chưa đủ chặt, health/readiness semantics còn đơn giản, bảo mật deploy/secret handling chưa đầy đủ, và một số dependency/test gates chưa đủ để đảm bảo nền móng thật sự ổn cho Phase 2+.

### Strengths

- Tách `bot.ts` và `shard.ts` là đúng hướng cho kiến trúc shard-first; tránh nhồi scheduler/HTTP server vào shard processes.
- Quyết định cho `pg-boss` chạy chỉ ở ShardingManager là rất tốt; tránh duplicate cron/job consumers ngay từ đầu.
- Dùng `DATABASE_URL_DIRECT` cho migrate và pg-boss là chính xác với ràng buộc advisory lock + PgBouncer transaction mode.
- Scope DB bootstrap được giữ gọn: chỉ `users` và `seasons`, phù hợp Phase 1, không overbuild game schema quá sớm.
- Config qua Zod + module typed tập trung ở `src/config.ts` là nền tảng tốt để tránh `process.env` rải rác.
- i18n được đưa vào trước khi feature work bắt đầu, đúng với constraint "không hardcode string nào".
- Có lint/pre-commit + CI enforcement cho i18n, giúp biến architectural rule thành rule có thể kiểm chứng.
- Có health endpoint và pm2 config ngay trong foundation phase, tốt cho deployability và debugging sớm.
- Dependency graph nhìn chung hợp lý; T-03 là human checkpoint rõ ràng thay vì ngầm giả định infra đã sẵn sàng.
- `exec_mode: 'fork'` cho pm2 là chi tiết quan trọng và đúng; tránh conflict với ShardingManager.

### Concerns

- **[HIGH] Command Registration Mixed With Runtime Loading:** Command registration đang bị gộp lẫn với command loading runtime. "registers slash commands globally via REST" trong `commandLoader` là rủi ro lớn vì shard startup có thể re-register commands nhiều lần, gây race, rate-limit, hoặc deploy chậm. Registration phải là step tách biệt, chạy controlled trong deploy/bootstrap.
- **[HIGH] Manager Startup Lifecycle Not Specified:** Plan chưa nói rõ manager process sẽ giữ lifecycle thế nào giữa các thành phần nền: pg-boss, Fastify, shard spawning, shutdown handling. Nếu một thành phần fail init sau khi shard đã spawn, hệ thống có thể rơi vào half-alive state.
- **[HIGH] CI/CD Has No Actual Tests:** CI/CD pipeline có `tests` trong user decisions nhưng task list và success criteria không mô tả test foundation cụ thể nào. Nếu Phase 1 không có smoke/integration tests cho config/db/redis/i18n boot path thì CI pass chưa đủ chứng minh nền móng ổn.
- **[HIGH] Deploy Security Gaps:** Bảo mật deploy còn mỏng. `git pull` trực tiếp trên VM + `.env` ở `/etc/tutien/.env` là được, nhưng chưa có chi tiết về file permissions, deploy user không phải root, SSH hardening, known_hosts pinning, hay rollback strategy khi migrate/deploy fail giữa chừng.
- **[MEDIUM] Readiness Endpoint Too Simplistic:** `GET /ready` trả `{ready:true}` quá đơn giản, dễ tạo false positive. Readiness nên phản ánh ít nhất shard manager init xong, DB/Redis reachable, và scheduler đã register.
- **[MEDIUM] Health Endpoint Only Checks WebSocket Status:** `manager.fetchClientValues('ws.status')` cho health chỉ cho biết websocket status, chưa phản ánh shard readiness thật sự như login complete, command/event load success, hay last heartbeat lag.
- **[MEDIUM] MessageContent Intent Unnecessary in Phase 1:** T-09 yêu cầu `MessageContent` intent cho bot slash-command shell là đáng nghi. Nếu Phase 1 chưa xử lý prefix/message parsing thì đây là privileged intent không cần thiết, tăng friction khi review bot với Discord.
- **[MEDIUM] Global Command Registration Slow for Development:** Global slash registration cho `ping` có thể làm propagation chậm. Với phase foundation, guild-scoped dev registration thường phù hợp hơn cho kiểm thử nhanh; global chỉ nên dùng khi release-ready.
- **[MEDIUM] Redis Failure Policy Unclear:** Redis retry backoff có nêu nhưng chưa nói rõ fail-fast vs retry-forever policy khi startup. Với foundation infra, cần quyết định rõ service có nên refuse startup nếu Redis down hay degraded mode.
- **[MEDIUM] eslint-plugin-i18next Tuning Overhead Risk:** T-11/T-12 cho `eslint-plugin-i18next` có nguy cơ tốn nhiều effort tuning vì false positives trên backend/bot code khá cao. Có dấu hiệu hơi "tooling-heavy" cho Phase 1 nếu rule không được giới hạn đúng scope.
- **[MEDIUM] users.locale Has No Constraint:** Database schema cho `users.locale` chưa nêu enum/constraint/value normalization. Vì locale resolution là core infra, để free-text từ đầu có thể tạo data drift.
- **[MEDIUM] seasons.is_active Has No Uniqueness Constraint:** `seasons` schema có `is_active` nhưng plan chưa nói uniqueness invariant kiểu "only one active season". Đây là bootstrap table, nhưng nên khóa invariant từ đầu.
- **[LOW] T-08 Assets/Theme Scope Debatable:** T-08 thêm assets/theme/embed builders vào foundation phase hơi lệch trọng tâm. Không sai, nhưng một phần có thể để sang phase đầu tiên có UI thực sự.
- **[LOW] Node Version Pin in Deploy Not Explicit:** `.nvmrc` tốt cho local dev nhưng VM dùng pm2 + direct install; chưa rõ Node version pin trong deploy script có match `.nvmrc` và production runtime không.
- **[LOW] DB Pool Sizing Not Tied to Shard Count:** `max: 5 per shard` cho DB pool là reasonable nhưng plan chưa gắn nó với expected shard count / PgBouncer pool sizing, nên sau này dễ drift khi scale.

### Suggestions

- Tách command system thành 2 concerns rõ ràng: (1) runtime loader trong shard chỉ import command definitions/handlers; (2) một script riêng như `scripts/register-commands.ts` chạy trong CI/deploy hoặc manual bootstrap để upsert slash commands.
- Thêm startup orchestration contract cho manager: Validate config → Init DB/Redis → Init i18n → Init pg-boss → Start health server → Spawn shards. Nếu bước nào fail thì exit non-zero, không để process sống ở trạng thái nửa vời.
- Thêm graceful shutdown plan cho manager và shards: close Fastify → stop pg-boss workers → close Redis/PG pools → propagate termination to shards.
- Bổ sung smoke/integration tests tối thiểu cho Phase 1: config validation fail/pass, i18n missing-key detection, Redis cooldown helper behavior, migration from zero, health endpoint in degraded vs healthy states.
- Nâng `GET /ready` thành readiness thật: chỉ trả 200 khi DB + Redis ok, pg-boss init xong, shard spawn complete; nếu không thì 503.
- Giảm scope privileged intents ở T-09. Nếu chưa dùng message content ở Phase 1 thì bỏ `MessageContent`.
- Quy định command registration mode: dev/test dùng guild commands; production deploy mới sync global commands.
- Thêm schema invariants ngay từ đầu: `users.discord_id` unique index, `users.balance` bigint default 0 check >= 0, `users.locale` constrained set hoặc validated values, partial unique index cho `seasons.is_active = true`.
- Làm rõ Redis failure policy: nếu Redis là required infra cho Phase 1 success criteria, startup nên fail hard khi Redis unavailable; nếu chấp nhận degraded mode thì health/readiness phải phản ánh rõ.
- Củng cố deploy security: deploy user riêng, hạn chế quyền file `.env`, pin `known_hosts`, chạy migrate trước `pm2 restart` và nếu migrate fail thì abort deploy.
- Thêm observability nền tảng: structured logger với request/job/shard context, startup logs rõ từng subsystem, pm2 log path rotation hoặc logrotate.

### Risk Assessment: MEDIUM

Hướng kiến trúc đúng và đủ mạnh để làm nền cho các phase sau, nên rủi ro không ở design nền mà ở execution gaps. Nếu giữ nguyên plan, khả năng cao Phase 1 vẫn "chạy được", nhưng chưa chắc "load-bearing" đúng nghĩa do các lỗ hổng quanh command registration, startup lifecycle, deploy hardening, và test coverage. Chốt được các điểm đó thì plan này có thể xuống mức LOW; nếu không, downstream phases dễ phải quay lại sửa nền móng vận hành thay vì chỉ build feature.

---

## Consensus Summary

Phase 1 plan reviewed by 2 AI systems: **Gemini** and **Codex**.

### Agreed Strengths

Both reviewers confirmed the following as well-designed:

1. **pg-boss in ShardingManager only** — Correctly scoped; prevents duplicate cron jobs and redundant maintenance workers.
2. **DATABASE_URL_DIRECT for migrations and pg-boss** — Accurate handling of PgBouncer transaction mode breaking advisory locks.
3. **Zod config validation + single config module** — Proper fail-fast pattern; prevents silent misconfiguration.
4. **i18n wired before any feature work** — Both reviewers highlighted the ESLint + pre-commit + CI triple-enforcement as a "gold standard" approach.
5. **Two-entry-point architecture (bot.ts + shard.ts)** — Correct separation of ShardingManager and Client concerns.
6. **pm2 fork mode (not cluster)** — Critical detail correctly handled; prevents ShardingManager conflict.

### Agreed Concerns

Issues raised by both reviewers — **highest priority to address before execution**:

| # | Concern | Severity | Raised By |
|---|---------|----------|-----------|
| 1 | **Command registration mixed into shard startup** — Every shard re-registers slash commands on startup. Should be a separate deploy-time script (`scripts/register-commands.ts`) run once in CI/deploy, not inside `commandLoader`. | HIGH | Both |
| 2 | **Graceful shutdown incomplete** — Shutdown handlers for `db.end()`, `redis.quit()`, `boss.stop()` must be wired in both `bot.ts` and `shard.ts`. pm2 sends SIGTERM/SIGINT and expects processes to clean up. | MEDIUM | Both |
| 3 | **DB pool sizing not tied to shard count** — `max: 5 per shard` is unstated relative to expected shard count. At 40 shards = 200+ connections + manager. PostgreSQL `max_connections` on the Oracle VM needs to be tuned and documented. | MEDIUM | Both |

### Divergent Views

| Topic | Gemini | Codex | Worth Investigating? |
|-------|--------|-------|----------------------|
| **Overall risk** | LOW — clean foundation, concerns are optimizations | MEDIUM — execution gaps around command registration, deploy hardening, test coverage | **Yes.** Codex is more conservative. The HIGH-severity concerns (command registration, lifecycle, missing tests, deploy security) justify the MEDIUM rating if unaddressed. |
| **T-08 asset/theme scope** | Not mentioned — accepted as reasonable | LOW concern — debatable whether embed builders belong in Phase 1 | Marginal. Embed builders are used by the ping command and health embeds in Phase 1 itself; keep in scope. |
| **BigInt JSON serialization** | LOW concern — explicit mention of `JSON.stringify` risk | Not mentioned explicitly | Worth a 2-line fix: add `BigInt.prototype.toJSON = function() { return this.toString(); }` in config startup or format.ts. |
| **Testing** | Not mentioned as a concern | HIGH concern — no smoke/integration tests defined | **Yes.** Codex is correct. CI pipeline has no test task defined despite the plan claiming lint → typecheck → test → deploy. At minimum: `npm test` should run `check-i18n` + a startup smoke test. |
| **deploy security** | Not mentioned | HIGH concern — permissions, deploy user, known_hosts, rollback | Worth addressing before production. The Oracle VM deploy is currently under-specified for security. |

### Top 3 Consensus Concerns

1. **Command registration must be decoupled from shard startup.** Extract to `scripts/register-commands.ts`, run once during deploy. This is the highest-risk item because it's a race condition and rate-limit risk at scale.
2. **Manager startup lifecycle needs explicit orchestration contract.** Define the ordered init sequence (config → DB → Redis → i18n → pg-boss → health server → spawn shards) with fail-fast behavior if any step fails.
3. **Test coverage gap in CI.** The `ci.yml` pipeline has no `npm test` step. Add at minimum: `check-i18n`, a config smoke test, and a Redis cooldown unit test so CI validates the foundation, not just TypeScript compilation.
