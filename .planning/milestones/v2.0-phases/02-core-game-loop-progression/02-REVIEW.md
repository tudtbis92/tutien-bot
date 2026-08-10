---
phase: 02
reviewed: 2026-04-12T10:30:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - src/db/schema/characters.ts
  - src/db/schema/items.ts
  - src/db/schema/character_items.ts
  - src/db/schema/recipes.ts
  - src/db/schema/recipe_ingredients.ts
  - src/db/schema/guild_activity.ts
  - src/db/schema/index.ts
  - src/constants/game.ts
  - src/constants/realms.ts
  - src/constants/itemAttributes.ts
  - src/utils/realmUtils.ts
  - src/types/professions.ts
  - locales/vi/game.json
  - locales/en/game.json
  - locales/zh-cn/game.json
  - src/shard.ts
  - src/events/messageCreate.ts
  - src/events/voiceStateUpdate.ts
  - src/events/messageReactionAdd.ts
  - src/workers/activityWorker.ts
  - src/workers/voiceWorker.ts
  - src/workers/pgBoss.ts
  - src/commands/game/start.ts
  - src/commands/game/profile.ts
  - src/ui/embeds/buildProfileEmbed.ts
  - src/commands/game/dotpha.ts
  - src/services/breakthrough.ts
  - src/ui/embeds/buildBreakthroughEmbed.ts
  - src/commands/game/bxh.ts
  - src/ui/embeds/buildLeaderboardEmbed.ts
  - src/events/interactionCreate.ts
  - src/commands/game/nghenghiep.ts
  - src/ui/embeds/buildProfessionEmbed.ts
  - src/commands/game/thutap.ts
  - src/commands/game/chetao.ts
  - src/ui/embeds/buildItemEmbed.ts
status: issues_found
critical: 0
major: 2
minor: 8
advisory: 3
---

# Phase 02: Code Review — Core Game Loop & Progression

**Reviewed:** 2026-04-12T10:30:00Z  
**Depth:** standard  
**Files Reviewed:** 36  
**Status:** issues_found — 0 critical · 2 major · 8 minor · 3 advisory

---

## Tổng quan

Phase 2 triển khai core game loop tu tiên: schema database, hệ thống tu vi tích lũy (message/voice/reaction), đột phá cảnh giới, nghề nghiệp, thu thập nguyên liệu, và chế tạo. Kiến trúc tổng thể tốt — 5-layer anti-farming, SELECT FOR UPDATE để serialize per-user, atomic BigInt update pattern, và Zod validation cho JSONB đều được thực thi đúng.

Hai vấn đề MAJOR cần sửa trước khi production: silent streak loss và message privacy. Tám vấn đề MINOR là bugs nhỏ, misleading errors, và thiếu constraint. Ba advisory là cải tiến không khẩn cấp.

---

## Major Issues

### MA-01: `void updateStreak()` — Unhandled promise, streak bonus có thể mất im lặng

**File:** `src/workers/activityWorker.ts:191`

**Vấn đề:** `updateStreak()` được gọi fire-and-forget với `void` sau khi transaction commit. Nếu hàm này throw (DB lỗi, connection timeout...), error bị swallow hoàn toàn — không có log, không có retry. Streak bonus (200–3,000 tu vi tùy streak length) sẽ không được trao mà người dùng không biết. Đây là silent data loss.

```ts
// Hiện tại — lỗi bị swallow, bonus mất không ai biết
void updateStreak(char.id, data.timestamp, charForStreak);
```

**Fix:**
```ts
// Thêm .catch() để ít nhất log lỗi
updateStreak(char.id, data.timestamp, charForStreak).catch((err) =>
  logger.error('ActivityWorker', `updateStreak failed for char ${char.id}`, err),
);
```

Về dài hạn, nên move `updateStreak` vào trong transaction chính (dùng cùng `tx`) hoặc implement retry với pg-boss scheduled job riêng. Comment nói "outside tx to avoid long hold" nhưng streak update là `UPDATE WHERE lastActiveDate < today` — rất nhanh, ít rủi ro hold lâu.

---

### MA-02: `message.content` đầy đủ được persist vào pg-boss job table

**File:** `src/events/messageCreate.ts:33`

**Vấn đề:** Toàn bộ nội dung message (tối đa 4,000 ký tự) được đưa vào pg-boss job data và lưu trong PostgreSQL (`pgboss.job`). Worker chỉ dùng content để:
1. Quality gate 1: regex kiểm tra repeating chars (không cần full content, chỉ cần kiểm tra pattern)
2. Duplicate check: chỉ dùng 50 ký tự đầu normalized (`slice(0, 50)`)

Lưu full message content vào DB là không cần thiết và vi phạm privacy: message chứa PII, link cá nhân, thông tin nhạy cảm. pg-boss không tự động purge jobs ngay lập tức — jobs được giữ trong bảng `pgboss.job` một khoảng thời gian trước khi expire.

```ts
// Hiện tại — gửi full content vào queue
void boss!.send('activity-queue', {
  type: 'message',
  userId: message.author.id,
  guildId: message.guildId,
  channelId: message.channelId,
  content: message.content,  // ← 4,000 ký tự lưu vào DB
  timestamp: Date.now(),
}, { expireInSeconds: 120 });
```

**Fix:** Chỉ truyền metadata cần thiết — không truyền raw content:

```ts
// Trong messageCreate.ts — chỉ gửi flags cần thiết
const normalizedContent = message.content.toLowerCase().replace(/\s+/g, ' ').trim();
void boss!.send('activity-queue', {
  type: 'message',
  userId: message.author.id,
  guildId: message.guildId,
  channelId: message.channelId,
  // Chỉ lưu metadata cần thiết — không lưu raw content
  hasRepeatPattern: /(.)\1{4,}/.test(message.content),
  contentFingerprint: normalizedContent.slice(0, 50), // cho dup check
  timestamp: Date.now(),
}, { expireInSeconds: 120 });
```

Và cập nhật `ActivityJobData` type + `isContentValid()` trong activityWorker để nhận pre-computed flags thay vì raw content.

---

## Minor Issues

### MI-01: Race condition tạo character kép trong `/start`

**File:** `src/commands/game/start.ts:47-88`

**Vấn đề:** Nếu user gọi `/start` hai lần gần như đồng thời:
1. Request A check: không có character → proceed
2. Request B check: không có character → proceed
3. Request A INSERT character → success
4. Request B INSERT character → **UNIQUE constraint violation** trên `discord_id`

`characters.discordId` có `.unique()` constraint nên sẽ throw DB error. Lỗi này bubble up qua `interactionCreate.ts` catch block và user thấy generic "Đã có lỗi xảy ra" thay vì message thân thiện.

**Fix:** Wrap toàn bộ `/start` logic trong một transaction với `ON CONFLICT DO NOTHING`:

```ts
// Option 1: Dùng ON CONFLICT DO NOTHING, check RETURNING
const [inserted] = await db
  .insert(characters)
  .values({ userId: user.id, discordId: interaction.user.id, /* ... */ })
  .onConflictDoNothing()
  .returning({ id: characters.id });

if (!inserted) {
  // Conflict = already registered
  await interaction.editReply({ embeds: [buildErrorEmbed(t('game:start.already_registered'))] });
  return;
}
```

---

### MI-02: `buildBreakthroughEmbed` — title và description giống hệt nhau

**File:** `src/ui/embeds/buildBreakthroughEmbed.ts:69-83`

**Vấn đề:** Cả `case 'fail'` và `case 'insufficient'` đều dùng cùng i18n key cho cả `setTitle()` lẫn `setDescription()`. Discord embed sẽ hiển thị nội dung trùng lặp.

```ts
// fail case — cùng key, cùng params
.setTitle(`${EMOJI.ERROR} ${t('game:breakthrough.fail', { penalty: penaltyStr })}`)
.setDescription(t('game:breakthrough.fail', { penalty: penaltyStr }));  // identical!

// insufficient case — tương tự
.setTitle(`${EMOJI.WARNING} ${t('game:breakthrough.insufficient', { required: requiredStr })}`)
.setDescription(
  t('game:breakthrough.insufficient', { required: requiredStr }) +  // same!
  `\n${t('game:profile.tu_vi')}: ${currentStr}`,
);
```

**Fix:** Thêm i18n keys riêng cho description, ví dụ `game:breakthrough.fail_desc` và `game:breakthrough.insufficient_desc`, với nội dung chi tiết hơn (lời an ủi, hướng dẫn tiếp theo).

---

### MI-03: Wrong i18n key khi validation fail trong `/nghề_nghiệp phân_bổ`

**File:** `src/commands/game/nghenghiep.ts:163-166`

**Vấn đề:** Khi profession key không hợp lệ (T-02-PROF-02 backstop check), code dùng key `game:start.not_registered` — hiển thị "Bạn chưa có nhân vật. Dùng /start..." — hoàn toàn không liên quan.

```ts
if (!PROFESSION_KEYS.includes(prof)) {
  await interaction.editReply({
    embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)],  // ← wrong key!
  });
  return;
}
```

**Fix:**
```ts
embeds: [buildErrorEmbed(t('errors.invalidInput'), shardId)],
// Hoặc thêm key mới: t('game:profession.invalid_profession')
```

---

### MI-04: Unsafe non-null assertion `inserted[0]!` sau concurrent insert

**File:** `src/commands/game/start.ts:73`

**Vấn đề:** `inserted[0]!` assume INSERT luôn trả về row. Nếu xảy ra concurrent insert (race trên `users.discordId`), `inserted` có thể là array rỗng và `inserted[0]!` là `undefined`, dẫn đến `user = undefined`, sau đó `user.id` throws TypeError.

```ts
const inserted = await db
  .insert(users)
  .values({ discordId: interaction.user.id })
  .returning();
user = inserted[0]!;  // ← crash nếu concurrent insert
```

**Fix:**
```ts
const inserted = await db
  .insert(users)
  .values({ discordId: interaction.user.id })
  .onConflictDoNothing()
  .returning();

if (inserted[0]) {
  user = inserted[0];
} else {
  // Fetch existing user (inserted by concurrent request)
  user = await db.select().from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1)
    .then(rows => rows[0]);
  if (!user) throw new Error('User insert/fetch inconsistency');
}
```

---

### MI-05: `INCR` và `EXPIRE` không atomic trong `incrementAnomalyCounter`

**File:** `src/workers/activityWorker.ts:206-209`

**Vấn đề:** `redis.incr(key)` và `redis.expire(key, ttl)` là hai operations riêng biệt. Nếu bot crash sau INCR nhưng trước EXPIRE (khi `count === 1`), key sẽ tồn tại không có TTL — tồn tại mãi mãi và không bao giờ reset. Character bị stick ở `anomaly_flag = true` vĩnh viễn từ một key không bao giờ expire.

```ts
const count = await redis.incr(key);
if (count === 1) {
  await redis.expire(key, 25 * 60 * 60);  // ← không atomic với INCR
}
```

**Fix:** Dùng `SET NX EX` + Lua script, hoặc đơn giản hơn: dùng `redis.set()` với `KEEPTTL` pattern không có, nhưng có thể dùng pipeline:

```ts
// Option 1: SET NX (first time) + INCR cho lần sau
// Option 2: Dùng pipeline để atomic
const pipeline = redis.pipeline();
pipeline.incr(key);
pipeline.expire(key, 25 * 60 * 60); // luôn set TTL (safe to extend)
const [count] = await pipeline.exec() as [number, number];
```

Hoặc đơn giản nhất: luôn gọi `expire` sau mỗi `incr` (không chỉ khi count === 1). TTL sẽ được reset nhưng với 25h window, đây là acceptable.

---

### MI-06: `recipe_ingredients.quantity` thiếu CHECK constraint

**File:** `src/db/schema/recipe_ingredients.ts:14`

**Vấn đề:** `quantity: integer('quantity').notNull()` không có DB-level CHECK constraint `quantity > 0`. Recipe với `quantity = 0` hoặc âm sẽ được insert thành công. Crafting logic `inventoryRow.quantity < ingredient.quantity` sẽ pass với `quantity = 0` → recipe "consumes" 0 materials → free crafting.

```ts
quantity: integer('quantity').notNull(),  // ← thiếu > 0 check
```

**Fix:**
```ts
import { check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const recipeIngredients = pgTable('recipe_ingredients', {
  /* ... */
  quantity: integer('quantity').notNull(),
}, (table) => [
  check('ingredient_quantity_positive', sql`${table.quantity} > 0`),
]);
```

---

### MI-07: `customEmoji` field không validate — cho phép arbitrary text vào embed

**File:** `src/commands/game/chetao.ts:118-128` và `src/ui/embeds/buildItemEmbed.ts:77`

**Vấn đề:** `customEmoji` option nhận bất kỳ chuỗi nào tới 100 ký tự. Không có validation rằng đây phải là emoji hợp lệ. User có thể nhập text tùy ý — dẫn đến embed title hiển thị sai format.

```ts
const emojiPrefix = data.customEmoji ? `${data.customEmoji} ` : '✨ ';
const title = `${emojiPrefix}${t('game:craft.unique_success', { name: displayName })}`;
// title = "My fake text  🌟 Kỳ tích! ..."
```

**Fix:** Validate `customEmojiInput` là Unicode emoji hoặc Discord custom emoji format `<:name:id>` hoặc `<a:name:id>`:

```ts
const EMOJI_REGEX = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|<a?:\w{2,32}:\d{17,19}>)$/u;
const customEmojiInput = interaction.options.getString('emoji') ?? '';
const validatedEmoji = EMOJI_REGEX.test(customEmojiInput) ? customEmojiInput : '';
```

---

### MI-08: `sql.raw()` với computed value trong `clearOrphanedVoiceSessions`

**File:** `src/workers/voiceWorker.ts:107`

**Vấn đề:** `sql.raw(String(maxAge))` được dùng để inject giá trị số vào INTERVAL expression. Hiện tại `maxAge` là integer constant (120) nên safe. Nhưng đây là anti-pattern — nếu `GAME_CONFIG.VOICE_MAX_MINUTES` thay đổi thành non-integer hoặc bị override, `sql.raw()` sẽ inject giá trị chưa được sanitize vào SQL.

```ts
sql`${characters.voiceSessionStartedAt} < now() - interval '${sql.raw(String(maxAge))} minutes'`
```

**Fix:** Dùng PostgreSQL arithmetic với bind parameter:

```ts
sql`${characters.voiceSessionStartedAt} < now() - (${maxAge} * interval '1 minute')`
```

Drizzle sẽ bind `maxAge` là parameter `$1`, tránh cần `sql.raw()`.

---

## Advisory

### AD-01: `/bxh` button scope không được validate format

**File:** `src/events/interactionCreate.ts:43`

`scope = parts.slice(3).join('_')` không validate rằng scope là Discord snowflake (`/^\d{17,20}$/`) hoặc literal `'global'`. Drizzle parameterized query bảo vệ khỏi SQL injection, nhưng malformed scope sẽ dẫn đến query không trả về kết quả thay vì lỗi rõ ràng.

**Fix:**
```ts
const scope = parts.slice(3).join('_');
if (scope !== 'global' && !/^\d{17,20}$/.test(scope)) {
  await interaction.deferUpdate();
  return;
}
```

---

### AD-02: Pagination count và page query không atomic trong `/bxh`

**File:** `src/commands/game/bxh.ts:132-135`

```ts
const [rows, total] = await Promise.all([fetchPage(scope, safePage), countEntries(scope)]);
```

Hai queries chạy song song nhưng không trong cùng transaction. Nếu có INSERT/DELETE giữa hai queries, `totalPages` có thể stale → nút ▶ enable/disable không chính xác. Đây là acceptable pagination trade-off nhưng có thể gây UX odd nếu leaderboard thay đổi nhanh.

**Suggestion:** Wrap trong `db.transaction()` để đảm bảo consistent snapshot, hoặc chấp nhận eventual consistency với comment rõ ràng hơn.

---

### AD-03: Extra DB query sau transaction trong `/chế_tạo` insufficient_level path

**File:** `src/commands/game/chetao.ts:351-358`

Sau khi transaction return `{ success: false, reason: 'insufficient_level' }`, code fetch lại recipe từ DB chỉ để lấy `minProfessionLevel` cho error message. Đây là query không cần thiết.

**Suggestion:** Include `minProfessionLevel` trong `CraftResult`:

```ts
type CraftResult =
  | { success: false; reason: 'insufficient_level'; requiredLevel: number }
  | /* ... */

// Trong transaction:
return { success: false, reason: 'insufficient_level', requiredLevel: recipe.minProfessionLevel };
```

Loại bỏ extra DB round-trip và đơn giản hóa code.

---

## Điểm tích cực đáng ghi nhận

Code phase 2 có nhiều điểm thiết kế tốt:

- **5-layer anti-farming**: Redis NX → DB cooldown → content quality gate → atomic daily cap UPDATE WHERE → anomaly counter. Pattern đúng và đủ.
- **SELECT FOR UPDATE serialization**: `activityWorker.ts` dùng `FOR UPDATE` row lock đúng cách — per-user serialization không global bottleneck.
- **Atomic BigInt cap**: UPDATE WHERE `dailyTuvi + amount <= DAILY_CAP` RETURNING pattern tránh read-then-write race.
- **Voice mark-as-paid**: `voiceSessionStartedAt + interval '1 minute'` advance pattern ngăn double-award dù job chạy muộn.
- **Zod JSONB validation**: `ProfessionPointsSchema.safeParse()` trên mỗi read — đúng approach cho JSONB.
- **GREATEST guard**: `GREATEST(tu_vi - penalty, 0)` trong `applyBreakthroughFailure` — defense-in-depth tốt.
- **i18n full coverage**: 3 locales (vi/en/zh-cn) đầy đủ, không có missing key.
- **DB CHECK constraints**: realm_id range, daily_tuvi non-negative, tu_vi non-negative, quantity_positive đều được thực thi ở DB level.

---

_Reviewed: 2026-04-12T10:30:00Z_  
_Reviewer: gsd-code-reviewer_  
_Depth: standard_
