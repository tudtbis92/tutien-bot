# Domain Pitfalls — TuTien Bot

**Domain:** Discord RPG bot with game economy, real-money currency, multi-shard  
**Researched:** 2026-04-11  
**Project Context:** Tu tiên (xianxia) bot — tu vi từ mọi hoạt động Discord, VWAP marketplace, season reset, monetization linh thạch

---

## Critical Pitfalls

Những lỗi này gây **rewrite hoặc mất player base hoàn toàn** nếu không được xử lý từ đầu.

---

### CRITICAL-1: Tu Vi Farming — Spam Message để Grind XP

**What goes wrong:**  
Hệ thống tích lũy tu vi qua tin nhắn không có đủ anti-exploit → player (hoặc selfbot/script) spam tin nhắn vô nghĩa, empty strings, copy-paste, hoặc dùng alt account để farm cho account chính. Cả bot Discord tự nhắn cũng vi phạm ToS nhưng vẫn tồn tại.

**Why it happens:**  
Cooldown đơn giản (1 message / 1 minute per user) không đủ. User biết cooldown, spam ngay khi cooldown reset. In-memory cooldown set bị mất khi shard restart.

**Consequences:**  
- Top leaderboard toàn bot/cheater → legitimate player chán và quit  
- Economy flooded với tu vi "free" từ farming → cảnh giới mất giá trị  
- Discord có thể suspend bot nếu phát hiện bot được dùng để tạo artificial engagement (Dev Policy §Abusive Usage)

**Prevention:**
```
Anti-farming layer (implement tất cả, không chọn 1):

1. Per-user cooldown: store last_awarded_at IN DATABASE (không in-memory)
   - Cooldown tối thiểu 60s, lý tưởng 3-5 phút
   - Reset cooldown nếu shard restart sẽ không còn là vấn đề

2. Content quality gate (minimum length + diversity check):
   - Bỏ qua message < 10 ký tự
   - Bỏ qua message = regex /^(.)\1+$/ (lặp ký tự)
   - Bỏ qua message là exact duplicate của message trước từ cùng user trong 5 phút

3. Session cap: max tu vi per user per 24h (hard ceiling)
   - Configurable per-server multiplier nếu cần, nhưng có global ceiling

4. Anomaly detection:
   - Flag users gửi > N messages/hour (N ≈ 30-60)
   - Cross-check: nếu user chưa bao giờ dùng slash command nhưng spam messages → suspicious
   - Nếu message_count > threshold trong X phút → soft ban khỏi tu vi tracking (không ban Discord)

5. Voice anti-farm:
   - Require ≥ 2 người trong voice channel mới count
   - Minimum time per "chunk" (5 phút), không cộng dồn từng giây
   - Mute/deaf không count
```

**Detection warning signs:**
- User có message count 10x trung bình nhưng tu vi theo tỷ lệ
- User có history chỉ có 1-3 ký tự mỗi message
- Sudden spike ở 1 channel vào giờ lẻ (3-5 AM timezone của bot owner)
- User tạo account Discord < 30 ngày mà tu vi rank top 10

**Phase mapping:** Core Activity Tracking phase — implement từ ngày đầu, không phải retrofit

---

### CRITICAL-2: Economy Inflation — Faucet Mạnh hơn Sink

**What goes wrong:**  
Tu vi và linh thạch được tạo ra quá nhiều (faucets: farming, drop rates, daily rewards) so với lượng bị đốt (sinks: crafting costs, marketplace fees, combat). Sau 2-3 tuần, item giá tăng 10x, newcomer không thể afford gì → quit.

**Why it happens:**  
Drop rates được set dựa trên "cảm giác" lúc dev, không dựa trên simulation. Không ai chạy economy simulation trước launch. Real-money purchase của linh thạch là **uncapped faucet cực kỳ nguy hiểm** nếu không có constraint.

**Real-world precedent:**  
- *New World* (Amazon): over-aggressive sinks + too-low faucets → severe deflation, players couldn't afford repairs, quit en masse  
- *Diablo 3* (Real Money Auction House): IAP flooded economy, items inflated → dev phải tắt hoàn toàn RMAH  
- Nhiều Discord economy bots: sau 3 tháng, top player có 1000x currency của newcomer → dead server

**Consequences:**  
- Veteran players hoard tài nguyên → newcomer can't participate  
- Market liquidity sụp đổ (không ai list item vì price expectation quá cao)  
- Mất player base hoàn toàn sau 1 season

**Prevention:**
```
Thiết kế economy với 3 principles:

1. Faucet/Sink tracking từ ngày 1:
   - Log TẤT CẢ linh thạch created và destroyed
   - Dashboard admin: money supply chart theo ngày
   - Alert nếu supply tăng > X% per day

2. Real-money purchase constraint:
   - Linh thạch mua = NON-TRADEABLE hoặc tradeable với hard cap
   - Hoặc: linh thạch purchased không thể đưa vào marketplace directly
   - Hoặc: conversion rate (tiền thật → linh thạch) giảm dần theo lượng mua
   - Lựa chọn tốt nhất cho TuTien: 2 loại linh thạch — "linh thạch trong" (earned) và "linh thạch ngoài" (purchased) — một số sink chỉ nhận "trong"

3. Hard sink đã có trong thiết kế (GIỮ NGUYÊN):
   - 10% marketplace fee → BURN (không vào treasury)
   - Instant sell: 0.7× market price, fee 10% BURN
   Cần thêm:
   - Crafting cost có component BURN (không chỉ material sink)
   - Combat: repair cost → BURN
   - Cảnh giới breakthrough: ritual cost → BURN

4. Season reset = emergency economic reset
   - Thiết kế để season chứa hyperinflation → next season fresh economy
   - Communicate rõ: "what carries over" vs "what resets"
```

**Detection warning signs:**
- VWAP của common items tăng >20% so với base_price trong 1 tuần
- Marketplace daily transaction count giảm (liquidity drought)
- Ratio newcomer/veteran daily active giảm week over week

**Phase mapping:** Economy Design phase — simulate trước launch; Economy Monitoring là ongoing

---

### CRITICAL-3: VWAP Manipulation — Wash Trading để Pump/Dump

**What goes wrong:**  
Player A có 2 tài khoản. A1 list item ở giá 10x base_price. A2 (alt account) "buy" từ A1. VWAP của item trong 1h bị skew lên 10x. Sau đó A1 bán tiếp với "instant buy" price = 1.2 × manipulated VWAP, hoặc dump lên player khác với limit buy order.

**Why it happens:**  
VWAP tính trên "transactions in last 1h" — nếu thời window ngắn và có ít transactions, 1-2 giao dịch manipulated có thể set price. Không có cross-account detection.

**Specific to TuTien:**  
VWAP window = 1h là rất ngắn và vulnerable. Limit sell cap = 2.5× market_price theo thời điểm đặt lệnh — nhưng nếu market_price đã bị pump, cap này không bảo vệ gì.

**Prevention:**
```
1. Alt-account detection:
   - Track transactions giữa accounts trong cùng 24h
   - Flag nếu Account A và B exchange value > X linh thạch tổng
   - IP/device fingerprint (nếu user cung cấp khi mua linh thạch)

2. VWAP robustness:
   - Require minimum transaction count (N ≥ 5 giao dịch) để VWAP update
   - Nếu < N giao dịch trong 1h → dùng fallback: VWAP của 24h trước hoặc giữ nguyên
   - Outlier rejection: loại bỏ giao dịch ngoài ±2σ trước khi tính VWAP
   - Volume-weighted AND time-weighted: giao dịch gần đây weight ít hơn nếu cùng account

3. Velocity limit per account:
   - Account không thể mua và bán cùng item trong 1 thời window
   - Account mới < 7 ngày có transaction limit thấp hơn

4. Anomaly flags (không cần auto-ban, cần human review):
   - Giao dịch giữa 2 account có cùng IP trong 7 ngày qua
   - Item price > 3× median VWAP của 7 ngày trước → flag for review
   - Account mua item rồi relist ngay với giá cao hơn > 50% → flag
```

**Detection warning signs:**
- Single item có sudden price spike không tương ứng supply/demand
- 2 accounts có giao dịch qua lại nhiều lần trong ngắn
- Item mà VWAP cao hơn 3× base_price mà không có event/quest liên quan

**Phase mapping:** Marketplace phase — implement cùng với order matching engine

---

### CRITICAL-4: Cross-Shard Race Conditions — Double Spend và Negative Balance

**What goes wrong:**  
User trên Shard 0 và Shard 1 trigger simultaneous marketplace buy. Cả 2 shard query database và thấy balance đủ. Cả 2 execute deduction. User bị trừ tiền 2 lần, hoặc tệ hơn: balance âm.

**Worse scenario:**  
User mở 2 Discord clients, thực hiện 2 purchases trong 1 giây → cả 2 shard forward request đến database, cả 2 đọc balance "50 linh thạch" → cả 2 deduct 40 → balance = -30.

**Why it happens:**  
- in-memory balance cache per shard → stale data  
- Database query không dùng `SELECT FOR UPDATE` → race condition  
- Transaction isolation level sai → phantom reads

**Prevention:**
```sql
-- ĐÚng: SELECT FOR UPDATE trong transaction
BEGIN;
SELECT balance FROM users WHERE id = $1 FOR UPDATE;
-- Check balance >= amount
UPDATE users SET balance = balance - $amount WHERE id = $1 AND balance >= $amount;
-- Check rows affected = 1, nếu 0 → rollback
COMMIT;

-- HOẶC: atomic check-and-update
UPDATE users 
SET balance = balance - $amount 
WHERE id = $1 AND balance >= $amount
RETURNING balance;
-- Nếu không return row → insufficient balance (không cần check trước)
```

```
Architectural rules:
1. TẤT CẢ balance deductions đi qua 1 database function/stored procedure
   - Không bao giờ read-then-write balance ở application layer
   - PostgreSQL: dùng advisory locks cho marketplace order matching

2. Marketplace order matching là single-threaded:
   - Dedicated worker/queue cho order matching
   - Không cho phép 2 workers match cùng order pair
   - Idempotency key cho mọi transaction

3. Shard independence for balance:
   - Character balance LUÔN đọc từ database (không cache)
   - Chấp nhận latency đổi lấy consistency
   - Chỉ cache READ-ONLY data (item descriptions, base prices)
```

**Detection warning signs:**
- Negative balance trong database (add CHECK constraint: `balance >= 0`)
- Transaction logs có 2 deductions với cùng correlation_id
- User reports không nhận item nhưng bị trừ tiền

**Phase mapping:** Database Schema phase (constraints ngay từ đầu) + Marketplace phase (lock strategy)

---

## Moderate Pitfalls

---

### MOD-1: Discord API Rate Limits Dưới Tải Cao

**What goes wrong:**  
Activity tracking event handler nhận 100 messages/second từ 50 servers. Bot reply mỗi sự kiện với một Discord API call → hit global rate limit (50 req/s). Bot bị rate limited → miss events → tu vi không được trao → player complain.

**Specific risk cho TuTien:**  
- `messageCreate` event: mỗi message trigger check + potential XP notification  
- Level-up notifications: nếu nhiều user level up cùng lúc, flood channel notifications  
- Marketplace notifications: khi order matched, cần DM buyer và seller

**Discord rate limits (confirmed, official docs 2025):**
- Global: 50 req/s per bot token  
- Per-channel message: ~5 req/5s  
- Per-DM: ~5 req/5s per user  
- Slash command responses: 3s window trước khi phải `deferReply()`

**Prevention:**
```
1. KHÔNG bao giờ reply trực tiếp trong messageCreate handler:
   - messageCreate → in-memory queue → background worker → batch process
   - XP award: silent (no reply), chỉ notify khi level up

2. Level-up notifications qua queue:
   - Rate-limit outbound notifications: 1 notification/user/second
   - Batch: nếu user level up multiple times → 1 thông báo "Bạn đã đạt [cao nhất]"

3. Marketplace notifications:
   - Ephemeral replies (only visible to requester) không tốn rate limit budget bằng channel messages
   - DM queue: max 1 DM/user/30s cho non-critical, immediate cho payment-related

4. Caching để reduce API calls:
   - Guild/channel info: cache 1h
   - User display name: cache 10 phút
   - Không bao giờ fetch guild member list realtime

5. Slash command timeout handling:
   - Tất cả slow operations: `interaction.deferReply()` TRƯỚC KHI query database
   - Timeout: 15 phút sau deferReply; sau 15 phút không thể editReply
```

**Detection warning signs:**
- Log errors 429 Too Many Requests  
- `X-RateLimit-Remaining: 0` headers trong bot logs  
- User reports "bot không phản hồi" vào giờ cao điểm

**Phase mapping:** Architecture phase — queue system cần có trước khi deploy

---

### MOD-2: Season Reset Edge Cases — Pending Orders và In-Flight Transactions

**What goes wrong:**  
Season reset bắt đầu lúc midnight. Tại thời điểm reset:
- 47 limit sell orders đang pending (buyer đặt 5000 linh thạch, chờ match)
- 12 users đang trong crafting process (đã burn materials, chưa receive item)
- 3 payments đang pending processing (user đã charge credit card, chưa receive linh thạch)
- 8 combat sessions active

Reset xóa character data → orders reference non-existent characters → DB foreign key violations hoặc orphaned records.

**Consequences:**  
- Users mất linh thạch đã lock trong orders → chargeback → Discord ban bot  
- Crafting mid-session: materials burned + no item received → anger  
- Real money in-flight: user paid, không nhận linh thạch sau reset → legal issue

**Prevention:**
```
Season reset PHẢI là multi-phase process, KHÔNG phải instant:

Phase 1: Announcement (T-7 days)
  - Thông báo ngày reset, disable new limit orders > T-3 days
  - Email/DM users có pending orders > 10000 linh thạch

Phase 2: Wind-down (T-1 day → T)
  - Cancel ALL open limit orders, hoàn trả locked linh thạch
  - Disable crafting initiation
  - Process queue cho pending payments đến hết
  - Log tất cả: order_id, amount_refunded, user_id

Phase 3: Snapshot (T-0, atomic)
  BEGIN TRANSACTION;
  -- Capture what carries over (theo thiết kế)
  INSERT INTO season_N+1_starting_state ...
  -- Wipe season-specific data
  DELETE FROM orders WHERE season = N;
  DELETE FROM character_progress WHERE season = N 
    AND carry_over = false;
  COMMIT;

Phase 4: Verification (T+0 đến T+24h)
  - Monitor for orphaned records
  - Manual review queue cho disputes
  - Freeze new gameplay for first 30 minutes để verify consistency

RULE: Payments (real money) KHÔNG BAO GIỜ bị affected bởi season reset.
Linh thạch purchased phải được deliver TRƯỚC HOẶC bảo lưu qua reset.
```

**Detection warning signs:**
- Foreign key constraint violations sau reset  
- Users report missing linh thạch post-reset  
- Database orphan records (orders với null user_id)

**Phase mapping:** Season System phase — design reset process trước khi build season logic

---

### MOD-3: i18n Technical Debt — Hardcoded Strings Phát Hiện Muộn

**What goes wrong:**  
Dev đang gấp, hardcode một số string: `await interaction.reply("Bạn đã đạt cảnh giới Luyện Khí!")`. 3 tháng sau, 200 strings hardcoded. I18n retrofit mất 2-3 tuần và introduce regression bugs (missed strings, wrong format codes).

**Why it happens:**  
- Hardcoding 1 string tiết kiệm 30 giây → habit hình thành  
- Bot chạy 1 ngôn ngữ lúc đầu nên không ai bắt  
- "Chúng ta sẽ refactor sau" — không bao giờ xảy ra

**Specific risk cho TuTien:**  
PROJECT.md explicitly states "i18n từ ngày đầu — không hardcode string nào". Đây là constraint cứng. Vi phạm = vi phạm project constraint.

**Prevention:**
```typescript
// WRONG — NEVER DO THIS:
await interaction.reply("Bạn đã đạt cảnh giới Luyện Khí!");

// CORRECT:
await interaction.reply(t(interaction, "cultivation.realm_reached", { 
  realm: t(interaction, `realms.${realm_key}`) 
}));

// Enforcement tooling:
// 1. ESLint rule: no-template-literal nếu có Vietnamese/hardcoded game text
// 2. Pre-commit hook: grep cho hardcoded realm names
// 3. Code review checklist: "Có string nào hardcoded không?"
```

```
Structure cần thiết từ ngày 1:
/locales
  /vi
    cultivation.json
    market.json
    combat.json
    errors.json
  /en
    cultivation.json
    ...

Conventions:
- Tất cả keys = snake_case, hierarchical
- Variables = {variable_name} không phải %s hoặc {0}
- Pluralization: dùng library (i18next) không tự handle
- Số thứ tự, ngày tháng: Intl.NumberFormat / Intl.DateTimeFormat
```

**Detection warning signs:**
- PR chứa Vietnamese text ngoài locale files  
- Game term names (Luyện Khí, linh thạch) xuất hiện trong source code ngoài constants/locales  
- String test fails khi switch locale

**Phase mapping:** Phase 1 (Foundation) — CI/CD lint rule từ commit đầu tiên

---

### MOD-4: Player Retention — Newcomer Bị Overwhelm Bởi Veterans

**What goes wrong:**  
Season reset tốt nhưng không đủ. Veteran biết cách farm hiệu quả → đạt top canh giới trong 2 ngày đầu season. Newcomer join ngày 3, thấy gap quá lớn, không thể participate PvP, marketplace prices set bởi veterans → quit sau ngày đầu.

**Why it happens:**  
Early game experience thiếu "early game goals", chỉ có "long-term goals". Không có content locked behind RECENT-START chứ không phải high-level.

**Prevention:**
```
1. Newcomer protection zone:
   - 7 ngày đầu sau season start (hoặc sau join): double tu vi rate
   - "Novice" status: protected from PvP initiation
   - Separate leaderboard: "This Week's Rising Stars" (tu vi gained in last 7 days)

2. Meaningful early game content:
   - Cảnh giới đầu (Luyện Khí, Trúc Cơ) phải có meaningful activities
   - Không chỉ là "grind to skip to good part"
   - Exclusive items only available at low canh giới (đặc sản cho newcomer)

3. Season pacing design:
   - First 2 weeks: higher drop rates, "beginner's luck" buff
   - No player-vs-player forced until Trúc Cơ or higher
   - Veteran mentorship incentive: veteran giúp newcomer → nhận bonus

4. Accessibility của marketplace:
   - Giữ common materials ở low price relative to new player income
   - "Newcomer shop" với base_price items (không theo VWAP)
```

**Detection warning signs:**
- D7 retention rate < 20% (thấp hơn là có vấn đề)  
- Majority of players quit before reaching tier 3 realm  
- Newcomer-to-veteran marketplace transaction ratio thấp (newcomer không đủ tiền mua)

**Phase mapping:** Season Design và Balancing phase

---

### MOD-5: Payment Processing Compliance — Real Money cho Virtual Currency

**What goes wrong:**  
Bot bán linh thạch qua Discord native monetization, Stripe, hoặc PayPal. Không xử lý:
- Chargeback: user mua 10k linh thạch, spend hết, rồi chargeback → bot mất tiền + Discord có thể suspend
- Refund policy không rõ ràng → complaint, potential legal
- Tax reporting không đủ → legal risk nếu revenue cao
- Discord ToS về virtual currency không được đọc kỹ → violation

**Discord-specific rules (HIGH confidence, official docs):**  
- Virtual currency purchased là "final and not refundable" — nhưng Discord có thể override  
- Bot developer responsible for chargeback fees  
- Discord Platform Fee: 10% (Growth Tier), 30% (Standard Tier, after $1M)  
- Discord không cho phép "purchase, sell, or exchange Virtual Currency OUTSIDE the Service"  
- Nếu dùng Discord native monetization SKUs: cannot process payments independently

**Prevention:**
```
1. Sử dụng Discord native monetization (SKU/Entitlements):
   - Discord xử lý payment, chargeback risk, refunds
   - Đổi lại: Discord lấy 10-30% fee
   - Compliance tốt hơn nhiều so với tự build payment

2. Nếu tự build (Stripe, etc.):
   - Refund policy: rõ ràng trên web page/Discord server
   - "Linh thạch đã sử dụng không thể hoàn tiền" — phải hiển thị TRƯỚC khi purchase
   - Chargeback protection: disable tài khoản ngay khi nhận chargeback signal
   - Minimum purchase (tránh micropayment fee overhead)
   - KYC: nếu revenue > threshold, cần identity verification per jurisdiction

3. Fraud prevention:
   - Rate limit: 1 purchase per account per 24h (hoặc per card)
   - New account (<7 ngày Discord) không thể purchase cao
   - VPN/proxy detection cho purchases
   - Giữ purchase log 7 năm (tax requirement nhiều jurisdiction)

4. Discord ToS boundary:
   - Linh thạch KHÔNG được trade ngoài Discord (gifting between users là grey area)
   - Không được promise "investment return" cho linh thạch
   - Không được NFT-ify linh thạch (ownership claim ngoài game)
```

**Detection warning signs:**
- Chargeback rate > 1% → payment processor warning  
- Same card used trên nhiều Discord accounts  
- Sudden large purchase từ new account (fraud signal)

**Phase mapping:** Monetization phase — legal review TRƯỚC KHI launch payment; Discord SKU setup ưu tiên hơn custom payment

---

## Minor Pitfalls

---

### MIN-1: In-Memory State Lost on Shard Restart

**What goes wrong:**  
Cooldown Set, active voice sessions, combat state, pending crafting timers stored in JavaScript memory. Shard crash/restart → tất cả mất → tu vi farming cooldown reset → exploit window; combat mid-session corrupted.

**Prevention:**
- TẤT CẢ persistent state → database (PostgreSQL)  
- In-memory cache chỉ cho READ-ONLY hoặc REPRODUCIBLE data  
- Voice session: heartbeat every 30s vào DB, recover on restart  
- Combat session: state machine stored in DB, resumable

**Phase mapping:** Foundation phase — architecture decision trước khi write any feature

---

### MIN-2: Discord Gateway Event Ordering và Out-of-Order Processing

**What goes wrong:**  
Multi-shard bot nhận events không đúng thứ tự. Voice state update (user join) đến sau voice state update (user leave) → record âm thời gian → negative tu vi hoặc crash.

**Prevention:**
- Event timestamps từ Discord, không dùng `Date.now()` của shard  
- Idempotent event processing: xử lý event đã seen → no-op, không error  
- Voice tracking: calculate tu vi khi user LEAVE (diff join_at to leave_at), không accumulate per-second

**Phase mapping:** Activity Tracking phase

---

### MIN-3: VWAP Window Edge Case — Item Chưa Có Giao Dịch

**What goes wrong:**  
Item mới crafted lần đầu đặt lên market. `market_price = null` → division by zero hoặc wrong price. Instant buy/sell tính trên null → NaN → incorrect transaction.

**Prevention:**
```
RULE (đã trong PROJECT.md, cần enforce trong code):
IF no_transactions_in_window:
  market_price = fallback_price
WHERE fallback_price = last_known_vwap OR base_price (nếu chưa có history)

Database: market_price NOT NULL, DEFAULT = base_price
Code: mọi VWAP calculation function phải return base_price nếu sample_count < minimum_threshold
```

**Phase mapping:** Marketplace phase — unit test this edge case explicitly

---

### MIN-4: Slash Command Timeout — 3-Second Response Requirement

**What goes wrong:**  
`/market buy` trigger database lookup + order matching + notification → takes 500ms. Discord timeout = 3 seconds từ interaction receive. Nếu bất cứ lúc nào có DB slowdown → missed 3s window → "This interaction failed" error với user.

**Prevention:**
- Tất cả commands có DB operations: `await interaction.deferReply()` là DÒNG ĐẦU TIÊN  
- `deferReply({ ephemeral: true })` cho commands nhạy cảm (balance, purchase)  
- Sau deferReply: có 15 phút để `editReply()`  
- Monitor P95 latency của commands; alert nếu > 1s

**Phase mapping:** Commands implementation phase — code pattern phải được established từ đầu

---

### MIN-5: Seasonal Realm Name Conflicts — Database Migration Nightmare

**What goes wrong:**  
Season 1 dùng realm keys: `luyen_khi`, `truc_co`, `kim_dan`... Season 2 muốn đổi tên display nhưng database dùng tên display làm foreign key. Hoặc: các item drop tied đến realm names hardcoded trong config → mỗi season đổi tên phải update N chỗ.

**Prevention:**
```
RULE: Realm identifiers trong database là STABLE IDs (integers hoặc semantic slugs không đổi)
- DB: realm_id = 1, 2, 3... 
- Display name → i18n lookup theo realm_id
- Season config: map realm_id → season-specific display_name trong locale files
- Drop tables, crafting recipes: reference realm_id, KHÔNG reference display name
```

**Phase mapping:** Database Schema phase — design realm table với stable IDs trước khi build any feature

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Activity Tracking | Tu vi farming via spam | Implement DB-backed cooldown + content gate + daily cap từ ngày đầu |
| Economy Design | Inflation từ generous drops | Simulate faucet/sink ratio; start conservative, buff later |
| Marketplace | VWAP wash trading | Minimum transaction count + outlier rejection cho VWAP |
| Marketplace | Race condition double-spend | `SELECT FOR UPDATE` hoặc atomic update, không read-then-write |
| Season System | Pending orders at reset | Multi-phase reset: cancel orders → snapshot → wipe |
| Season System | Real money in-flight at reset | Payments queue flush TRƯỚC season cutover |
| Multi-Shard | State loss on restart | Không store persistent state in-memory |
| Multi-Shard | Cross-shard stale balance | Always DB-read balance; advisory locks cho order matching |
| Monetization | Chargeback fraud | Prefer Discord native SKU; rate-limit purchases; disable on chargeback |
| i18n | Hardcoded strings | ESLint rule + pre-commit hook + code review checklist từ commit 1 |
| Commands | Slash command timeout | `deferReply()` as first line pattern |
| Player Retention | Veteran dominance | Newcomer protection zone + early-game exclusive content |

---

## Economy-Specific Deep Dive: The Faucet-Sink Balance for TuTien

Dựa trên case studies từ New World, Diablo 3, và general game economy research:

### Faucets trong TuTien (mọi nguồn tạo ra currency/value)
| Faucet | Type | Risk Level |
|--------|------|-----------|
| Tu vi từ messages | Active, capped | MEDIUM — cần anti-farm |
| Tu vi từ voice | Passive, limited | LOW nếu có 2-person requirement |
| Tu vi từ reactions | Active, low yield | LOW |
| Item drops từ gathering | Active | MEDIUM — drop rate thiết kế quan trọng |
| Crafting output value | Active | HIGH nếu craftable items > mat cost |
| Mua linh thạch (real money) | Uncapped faucet | **CRITICAL** — phải constrain |
| Daily/event rewards | Passive | MEDIUM — accumulate với offline players |

### Sinks trong TuTien (mọi nơi currency/value bị destroy)
| Sink | Effectiveness | Notes |
|------|--------------|-------|
| 10% marketplace fee (BURN) | GOOD | Đã thiết kế — giữ nguyên |
| Instant sell discount (0.7×) | GOOD | Punishes impatience |
| Crafting material cost | MEDIUM | Chỉ redistribute, không burn |
| Cảnh giới breakthrough cost | GOOD NẾU có BURN component | Cần thêm burn |
| Combat repair | TBD | Cần thiết kế |
| Hard season reset | EXCELLENT | Nuclear sink — nhưng mất goodwill nếu không managed well |

**Cảnh báo:**  
Nếu chỉ có marketplace fees là sink, và real-money purchases là uncapped faucet, economy sẽ inflate theo rate mua linh thạch của player cao nhất. **Cần ít nhất 3 meaningful sinks** hoạt động song song với real-money faucet.

---

## Sources

| Source | Confidence | URL |
|--------|-----------|-----|
| Discord Rate Limits docs | HIGH | https://docs.discord.com/developers/topics/rate-limits |
| Discord Dev ToS | HIGH | https://support-dev.discord.com/hc/en-us/articles/8562894815383 |
| Discord Monetization Terms | HIGH | https://support.discord.com/hc/en-us/articles/5330075836311 |
| Discord Community Guidelines (self-bot policy) | HIGH | https://discord.com/guidelines |
| Discord Monetization API docs | HIGH | https://docs.discord.com/developers/monetization/overview |
| Machinations.io — Game Economy Inflation | MEDIUM | https://machinations.io/articles/what-is-game-economy-inflation-how-to-foresee-it-and-how-to-overcome-it-in-your-game-design |
| Medium — Designing Game Economies (New World case) | MEDIUM | https://medium.com/@msahinn21/designing-game-economies-inflation-resource-management-and-balance-fa1e6c894670 |
| PostgreSQL Explicit Locking docs | HIGH | https://www.postgresql.org/docs/current/explicit-locking.html |
| PostgreSQL Advisory Locks tutorial | MEDIUM | https://dteather.com/blogs/postgres-advisory-locks/ |
| Discord.js Sharding Guide | HIGH | https://discordjs.guide/legacy/sharding |
| SkynetBot scaling article (Redis IPC) | MEDIUM | https://skynetbot.net/blog/5667a59a7431713aca0a204a/scale-your-discord-bot-understanding-sharding-performance |
| Stack Overflow — XP spam prevention | MEDIUM | https://stackoverflow.com/questions/65023013/prevent-spam-in-xp-system |
| Chainalysis Wash Trading 2025 | MEDIUM | https://www.chainalysis.com/blog/crypto-market-manipulation-wash-trading-pump-and-dump-2025/ |
| Discord Rate Limiting support article | HIGH | https://support-dev.discord.com/hc/en-us/articles/6223003921559 |
| Game Retention Strategies | MEDIUM | https://www.juegostudio.com/blog/how-to-increase-user-retention-and-increase-your-games-lifetime |
| Destiny 2 Chore Model — veteran/newcomer tension | MEDIUM | https://gamers-haven.org/articles/destiny-2-and-the-chore-model-how-bungie-lost-player-trust/ |
