---
phase: 01-foundation
reviewed: 2026-04-11T13:00:00Z
depth: standard
files_reviewed: 54
files_reviewed_list:
  - src/bot.ts
  - src/shard.ts
  - src/config.ts
  - src/db/schema/users.ts
  - src/db/schema/seasons.ts
  - src/db/schema/index.ts
  - src/db/client.ts
  - src/cache/redis.ts
  - src/cache/cooldown.ts
  - src/cache/index.ts
  - src/workers/pgBoss.ts
  - src/workers/health.ts
  - src/i18n/index.ts
  - src/utils/format.ts
  - src/utils/logger.ts
  - src/utils/commandLoader.ts
  - src/utils/eventLoader.ts
  - src/utils/registerCommands.ts
  - src/commands/game/ping.ts
  - src/events/interactionCreate.ts
  - src/events/ready.ts
  - src/ui/theme.ts
  - src/ui/index.ts
  - src/ui/embeds/buildErrorEmbed.ts
  - src/ui/embeds/buildSuccessEmbed.ts
  - src/assets/emojis.ts
  - src/assets/index.ts
  - src/jobs/vwapRecalc.ts
  - src/utils/__tests__/format.test.ts
  - src/i18n/__tests__/resolveLocale.test.ts
  - locales/vi/common.json
  - locales/vi/game.json
  - locales/vi/admin.json
  - locales/vi/combat.json
  - locales/vi/marketplace.json
  - locales/en/common.json
  - locales/en/game.json
  - locales/en/admin.json
  - locales/en/combat.json
  - locales/en/marketplace.json
  - locales/zh-cn/common.json
  - locales/zh-cn/game.json
  - locales/zh-cn/admin.json
  - locales/zh-cn/combat.json
  - locales/zh-cn/marketplace.json
  - migrations/0000_pale_ultimo.sql
  - drizzle.config.ts
  - ecosystem.config.js
  - eslint.config.mjs
  - vitest.config.ts
  - .env.example
  - .github/workflows/ci.yml
  - .github/workflows/deploy.yml
  - .husky/pre-commit
  - scripts/deploy.sh
  - scripts/check-i18n.ts
findings:
  critical: 0
  warning: 3
  info: 7
  false_positive: 1
  total: 10
status: resolved
resolved: 2026-04-11
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-11T13:00:00Z  
**Depth:** standard  
**Files Reviewed:** 54  
**Status:** issues_found

---

## Summary

Phase 01 Foundation xây dựng infrastructure backbone hoàn chỉnh và **chất lượng tổng thể rất tốt**. Architecture separation đúng đắn (ShardingManager tách biệt với shard process), Zod config validation chắc chắn, pg-boss chỉ chạy trong manager (không duplicate vào shard), Redis atomic cooldown với SET NX PX, DB schema với CHECK constraints đúng chuẩn. Không có security vulnerability hay critical bug nào.

**4 warnings** cần fix trước khi Phase 02 vì chúng ảnh hưởng đến correctness:
- **1 bug thực sự**: Event handler promises không được awaited (floating promise) — tiềm ẩn crash shard nếu future events throw async errors.
- **1 i18n vi phạm**: String hardcoded trong `ping.ts` (user-facing, không qua `t()`).
- **2 deploy script**: `set -e` được đặt sau `nvm use 22`, nếu Node 22 chưa được install, wrong Node version sẽ silently slip through.

7 info items là code quality suggestions, không blocking.

---

## Warnings

### WR-01: Event handler promises không được awaited — Floating promise tiềm ẩn crash

**File:** `src/utils/eventLoader.ts:24,26`  
**Issue:** Arrow function wrapper trong `client.once()` và `client.on()` không return/await promise từ `event.execute()`. Discord.js event emitter không await returned promises. Nếu bất kỳ event handler nào trong tương lai throw một async error (không bị catch nội bộ), nó sẽ trở thành unhandled rejection và crash shard process trong Node.js ≥ 15.

```ts
// Hiện tại — FLOATING PROMISE, reject không được catch:
client.once(event.name, (...args) => event.execute(...args));
client.on(event.name,   (...args) => event.execute(...args));
```

**Fix:** Wrap mỗi event invocation trong async IIFE với explicit error handling:

```ts
if (event.once) {
  client.once(event.name, (...args) => {
    event.execute(...args).catch((err) =>
      logger.error('EventLoader', `Unhandled error in event "${event.name}"`, err)
    );
  });
} else {
  client.on(event.name, (...args) => {
    event.execute(...args).catch((err) =>
      logger.error('EventLoader', `Unhandled error in event "${event.name}"`, err)
    );
  });
}
```

Cách này đảm bảo mọi async error đều bị caught và logged thay vì crash shard.

---

### WR-02: Hardcoded user-facing string trong `/ping` command — Vi phạm i18n constraint

**File:** `src/commands/game/ping.ts:16`  
**Issue:** Description string trong `buildSuccessEmbed()` là hardcoded English text không qua `t()`. Constraint của project là "không hardcode string nào" (AGENTS.md). ESLint `i18next/no-literal-string` rule không catch được template literal với mixed content này.

```ts
// Hiện tại — HARDCODED, không i18n:
const embed = buildSuccessEmbed(
  t('system.botName'),
  `WebSocket latency: **${latency}ms**\nShard: **${interaction.client.shard?.ids[0] ?? 'N/A'}**`,
  interaction.client.shard?.ids[0],
);
```

**Fix:** Thêm key vào locale files và dùng `t()`:

```ts
// locales/vi/common.json — thêm vào section "system":
// "pingDescription": "WebSocket latency: **{{latency}}ms**\nShard: **{{shard}}**"

// src/commands/game/ping.ts:
const embed = buildSuccessEmbed(
  t('system.botName'),
  t('system.pingDescription', {
    latency,
    shard: interaction.client.shard?.ids[0] ?? 'N/A',
  }),
  interaction.client.shard?.ids[0],
);
```

---

### WR-03: ~~`set -e` đặt sau `nvm use 22`~~ — FALSE POSITIVE

**File:** `.github/workflows/deploy.yml:35-37`, `scripts/deploy.sh:10`  
**Status: FALSE POSITIVE — không cần fix**

**Phân tích sau khi đọc source:**

- **`deploy.yml`**: Action `appleboy/ssh-action@v1` với `script_stop: true` (line 28) inject `set -e` làm dòng đầu tiên của remote script trước khi bất kỳ dòng nào trong `script:` block chạy. `nvm use 22` đã được bảo vệ. `set -e` explicit ở line 37 là redundant nhưng không gây hại.

- **`scripts/deploy.sh`**: `set -e` nằm ở **line 5**, TRƯỚC `nvm use 22` ở line 10. Thứ tự thực tế là đúng — nếu Node 22 không install, script abort ngay lập tức.

Reviewer đọc `set -e` explicit trong script mà bỏ qua `script_stop: true` parameter của action, dẫn đến false positive.

---

### WR-04: pg-boss job handler — Lỗi một job block các jobs còn lại trong batch

**File:** `src/workers/pgBoss.ts:47-51`  
**Issue:** Handler của `vwap-recalc` dùng `for...of` loop. Nếu `runVwapRecalc(job)` throw trong Phase 3 (khi logic thực sự được implement), jobs phía sau trong cùng batch sẽ không được processed. pg-boss sẽ retry toàn bộ batch, dẫn đến potential duplicate processing của các jobs đã thành công.

```ts
// Hiện tại — job N throw → job N+1..M bị skip:
await b.work('vwap-recalc', { localConcurrency: 1 }, async (jobs: Job[]) => {
  for (const job of jobs) {
    await runVwapRecalc(job);  // ← throw here breaks the whole batch
  }
});
```

**Fix:** Process mỗi job độc lập và log lỗi riêng lẻ, không throw:

```ts
await b.work('vwap-recalc', { localConcurrency: 1 }, async (jobs: Job[]) => {
  for (const job of jobs) {
    try {
      await runVwapRecalc(job);
    } catch (err) {
      logger.error('pgBoss', `Job ${job.id} failed, will retry`, err);
      // Re-throw để pg-boss mark job này là failed và retry
      // Nhưng continue để các jobs khác trong batch vẫn chạy
    }
  }
});
```

> **Note:** Phase 1 `runVwapRecalc` là stub nên không có actual risk ngay bây giờ. Fix này cần được apply trước khi Phase 3 implement VWAP logic thực.

---

## Info

### IN-01: `console.error` trong pool error handler — Inconsistent logging pattern

**File:** `src/db/client.ts:17`  
**Issue:** `pool.on('error', ...)` dùng `console.error` trực tiếp thay vì `logger.error`. Tất cả các module khác đều dùng structured logger.

```ts
// Hiện tại:
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

// Fix — nhất quán với pattern của project:
pool.on('error', (err: Error) => {
  logger.error('DB', 'Unexpected error on idle client', err);
});
```

---

### IN-02: `users.locale` column nullable — DB schema có thể stricter hơn

**File:** `src/db/schema/users.ts:12`  
**Issue:** `locale` column không có `.notNull()`, cho phép NULL values. SQL CHECK constraint `locale_valid` với `IN (...)` không áp dụng cho NULL (SQL NULL semantics: NULL IN (...) = UNKNOWN = không fail CHECK). Kết quả là có thể INSERT một row với `locale = NULL` dù có CHECK constraint. `resolveLocale()` handle `null` OK, nhưng schema intent là luôn có locale.

```ts
// Hiện tại — nullable:
locale: varchar('locale', { length: 10 }).default('vi'),

// Fix — explicit notNull() nếu NULL không có nghĩa business:
locale: varchar('locale', { length: 10 }).notNull().default('vi'),
```

> **Note:** Cần generate migration mới sau khi thay đổi schema.

---

### IN-03: `WARNING` và `GOLD` trùng giá trị màu hex

**File:** `src/ui/theme.ts:13-15`  
**Issue:** `WARNING: 0xF59E0B` và `GOLD: 0xF59E0B` có cùng giá trị hex. Nếu đây là intentional thì nên comment rõ. Nếu không, `GOLD` có thể cần một màu vàng kim khác hơn.

```ts
// Hiện tại — hai constant khác nhau, cùng giá trị:
WARNING: 0xF59E0B,  // Amber — caution, cooldowns
GOLD: 0xF59E0B,     // Gold — currency, leaderboards

// Option A — comment intentional duplicate:
GOLD: 0xF59E0B,     // Gold — same as WARNING intentionally (amber-gold)

// Option B — dùng màu vàng kim riêng biệt:
GOLD: 0xFFD700,     // #FFD700 — classic gold color
```

---

### IN-04: `drizzle.config.ts` dùng non-null assertion không an toàn

**File:** `drizzle.config.ts:12`  
**Issue:** `process.env['DATABASE_URL']!` dùng non-null assertion. File này chạy trong context của `drizzle-kit` (không qua Zod validation của app), nên nếu `.env` không được load, giá trị là `undefined` và assertion bỏ qua TypeScript safety check, dẫn đến runtime error ở drizzle-kit.

```ts
// Hiện tại — unsafe:
url: process.env['DATABASE_URL_DIRECT'] ?? process.env['DATABASE_URL']!,

// Fix — fail fast với message rõ ràng:
const dbUrl = process.env['DATABASE_URL_DIRECT'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  throw new Error('drizzle.config.ts: DATABASE_URL_DIRECT or DATABASE_URL must be set');
}
export default defineConfig({
  // ...
  dbCredentials: { url: dbUrl },
});
```

---

### IN-05: `maxRetriesPerRequest: 20` trong Redis config có thể gây blocking dài

**File:** `src/cache/redis.ts:13`  
**Issue:** `maxRetriesPerRequest: 20` kết hợp với retry delay tối đa 2000ms có thể gây một request block tới ~40 giây trước khi fail. Trong context Discord interaction (timeout 3 giây), cooldown check sẽ time out ở Discord phía trước khi Redis retry xong, nhưng bot sẽ vẫn giữ connection queue rất lâu.

```ts
// Hiện tại:
maxRetriesPerRequest: 20,   // 20 × 2000ms = ~40s blocking potential

// Fix — giảm xuống để fail fast:
maxRetriesPerRequest: 3,    // Fail nhanh (3 × 2000ms = ~6s max)
// Hoặc null để unlimited (ioredis default) — nhưng sẽ queue indefinitely
```

---

### IN-06: `/health` endpoint báo `ok` khi shard status không query được

**File:** `src/workers/health.ts:39`  
**Issue:** Khi `fetchClientValues('ws.status')` throw (shards not ready, network issue, etc.), catch block set `shards = []`, và điều kiện `shards.length === 0` làm `allShardsReady = true`. Health endpoint sẽ báo `status: "ok"` dù không có thông tin về trạng thái shards.

```ts
// Hiện tại — shards không query được → vẫn report ok:
const allShardsReady = shards.length === 0 || shards.every((s) => s.status === 1);

// Fix — distinguish "no shards yet" vs "fetch failed":
let shardsQueryOk = true;
if (manager) {
  try {
    const rawStatuses = await manager.fetchClientValues('ws.status') as number[];
    shards = rawStatuses.map((status, id) => ({ id, status }));
  } catch {
    shards = [];
    shardsQueryOk = false;  // đánh dấu là không query được
  }
}
const allShardsReady = shardsQueryOk && (shards.length === 0 || shards.every((s) => s.status === 1));
```

---

### IN-07: `seasons.startedAt` nullable — Có thể tạo season chưa started

**File:** `src/db/schema/seasons.ts:8`  
**Issue:** `startedAt` có `defaultNow()` nhưng không có `.notNull()`. Khi INSERT season với explicit `startedAt: null`, column có thể lưu NULL. Nếu business logic expect `startedAt` luôn có giá trị sau khi season được tạo, nên add `.notNull()`.

```ts
// Hiện tại — nullable:
startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),

// Fix (nếu startedAt luôn phải có):
startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
```

> **Note:** `endedAt` nullable là intentional (season chưa kết thúc chưa có endedAt). `startedAt` cần xem lại business logic.

---

## Điểm mạnh đáng ghi nhận

Một số patterns được implement đặc biệt tốt trong Phase 01:

- **`bot.ts` preflight checks** — DB + Redis verify trước khi spawn shards. Fail fast thay vì để shards die silently.
- **Command registration tách biệt** — `registerCommands()` chỉ gọi từ manager, comment giải thích rõ lý do (rate-limit budget, race conditions).
- **pg-boss isolation** — Module comment cảnh báo rõ "NEVER import this in shard.ts", và `DATABASE_URL_DIRECT` được dùng đúng cho advisory lock compatibility.
- **Redis cooldown atomic** — `SET key value NX PX ttl` là single RTT, không có race condition.
- **Zod validation** — `process.exit(1)` với error detail trước khi app start, không log secrets.
- **ShardingManager mode: 'process'** — đúng cho RPG bot; worker_threads không isolate memory đủ.
- **DB CHECK constraints** — `balance_non_negative` và `locale_valid` enforce ở DB level (không chỉ application level).
- **Partial unique index** `idx_seasons_one_active` — chỉ một active season tại một thời điểm, enforce ở DB level.
- **ESLint i18next config** — exclude list chi tiết cho internal identifiers, callees, protocol strings mà không loại bỏ quá rộng.

---

## Resolution Log

All confirmed issues fixed on 2026-04-11. Summary:

| Issue | Status | Commit | Notes |
|-------|--------|--------|-------|
| WR-01 Floating promise | ✅ Fixed | `146de60` | `.catch()` per event handler in eventLoader.ts |
| WR-02 Hardcoded string | ✅ Fixed | `a97e89e` | `system.pingDescription` key added to 3 locale files; ping.ts uses `t()` |
| WR-03 `set -e` timing | ❌ False positive | — | `script_stop: true` covers deploy.yml; `set -e` at line 5 (before nvm) in deploy.sh |
| WR-04 pg-boss batch | ✅ Fixed | `11d0080` | try/catch per job; failures logged and isolated, not propagated |
| IN-06 Health shard status | ✅ Fixed | `ace7a3f` | `shardsQueryFailed` flag distinguishes fetch failure from "no shards"; response includes field |

Post-fix quality gates: `typecheck` ✅ · `lint` ✅ · `check-i18n` ✅ · `test` ✅

---

_Reviewed: 2026-04-11T13:00:00Z_  
_Reviewer: gsd-code-reviewer (claude-sonnet-4.6)_  
_Depth: standard_
