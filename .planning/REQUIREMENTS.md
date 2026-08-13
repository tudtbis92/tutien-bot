# Requirements: TuTien Bot

**Defined:** 2026-04-11
**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: Bot khởi động với ShardingManager, tự động chia shard theo quy mô guild
- [ ] **INFRA-02**: Database schema khởi tạo với Drizzle migrations (users, characters, items, orders, transactions, seasons)
- [ ] **INFRA-03**: Redis kết nối và phục vụ cooldown cache + VWAP hot cache
- [ ] **INFRA-04**: pg-boss job scheduler chạy VWAP recalculation mỗi 1 giờ
- [ ] **INFRA-05**: i18n scaffold với locale files cho VI, EN, ZH-CN; zero hardcoded strings
- [ ] **INFRA-06**: CI/CD pipeline: build, test, deploy tự động
- [ ] **INFRA-07**: Health check endpoint và monitoring cơ bản (uptime, shard status)

### Core Loop

- [ ] **CORE-01**: Mỗi tin nhắn hợp lệ (không phải bot, đủ độ dài tối thiểu) tích lũy tu vi cho user
- [ ] **CORE-02**: Mỗi phút active trong voice channel tích lũy tu vi (tối đa 60 phút/session)
- [ ] **CORE-03**: Mỗi reaction hợp lệ tích lũy tu vi nhỏ
- [ ] **CORE-04**: Anti-farming: cooldown per-channel (DB-backed, survive shard restart), daily tu vi cap
- [ ] **CORE-05**: Anti-farming: loại trừ bot messages, tin nhắn spam ngắn, anomaly detection cơ bản
- [ ] **CORE-06**: User xem được thông tin nhân vật: tu vi, cảnh giới, spiritual root, stats (`/profile`)
- [ ] **CORE-07**: Daily streak: user nhận thưởng khi hoạt động ≥1 lần/ngày liên tiếp
- [ ] **CORE-08**: User có thể bắt đầu hành trình với `/start` (tạo nhân vật, chọn spiritual root)

### Progression

- [ ] **PROG-01**: Hệ thống cảnh giới season 1 theo xianxia classic (Luyện Khí → Truyện Cơ → Kim Đan → Nguyên Anh → Hóa Thần → ...)
- [ ] **PROG-02**: Mỗi cảnh giới có nhiều tầng nhỏ; đủ tu vi → breakthrough với xác suất thất bại
- [ ] **PROG-03**: Spiritual root (ngũ linh căn) được gán khi tạo nhân vật, ảnh hưởng tốc độ tu luyện và affinity nghề nghiệp
- [ ] **PROG-04**: Leaderboard: xếp hạng tu vi trong guild và global (`/bxh`, `/top`)
- [ ] **PROG-05**: Hệ thống nghề nghiệp: user phân bổ skill points vào gathering và/hoặc crafting professions
- [ ] **PROG-06**: Gathering: user dùng command để thu thập nguyên liệu (phụ thuộc cảnh giới + skill level)
- [ ] **PROG-07**: Crafting: user kết hợp nguyên liệu theo recipe để tạo ra vật phẩm
- [ ] **PROG-08**: Profession skill tree: mỗi nghề có nhiều nhánh chuyên môn hóa (Luyện đan, Rèn vũ khí, Hái thuốc, Đào mỏ...)

### Combat

- [ ] **COMBAT-01**: PvE hunting: user dùng command tấn công yêu thú, nhận nguyên liệu/tu vi
- [ ] **COMBAT-02**: PvE boss events: boss định kỳ xuất hiện, nhiều user phối hợp tiêu diệt
- [ ] **COMBAT-03**: PvP dueling: user thách đấu nhau (opt-in), có cược linh thạch hoặc vật phẩm
- [ ] **COMBAT-04**: Combat system text-based turn-based (dice rolls + stats); thiết kế chi tiết trong phase planning

### Marketplace

- [ ] **MKT-01**: Mỗi item có `base_price` (giá sàn cố định) và `market_price` (VWAP, update 1h)
- [ ] **MKT-02**: Instant buy: user mua item trực tiếp với giá `1.2 × market_price`
- [ ] **MKT-03**: Instant sell: user bán item trực tiếp với giá `0.7 × market_price`
- [ ] **MKT-04**: Limit sell order: giá không vượt `2.5 × market_price` tại thời điểm đặt lệnh; GTC
- [ ] **MKT-05**: Limit buy order: không giới hạn giá; GTC
- [ ] **MKT-06**: Real-time order matching: buy_price ≥ sell_price → khớp tự động ngay lập tức
- [ ] **MKT-07**: Phí giao dịch 10% seller chịu (min 1 linh thạch), toàn bộ burn
- [ ] **MKT-08**: VWAP recalculation mỗi 1h; không có giao dịch → giữ nguyên giá
- [ ] **MKT-09**: Global marketplace: tất cả users trên mọi server dùng chung một market pool
- [ ] **MKT-10**: User xem wallet: số dư linh thạch, lịch sử giao dịch, open orders
- [ ] **MKT-11**: User xem giá item: market_price hiện tại, lịch sử VWAP
- [ ] **MKT-12**: Anti-manipulation: minimum transaction count trước khi VWAP update; outlier rejection

### Season

- [ ] **SEASON-01**: Hard reset tu vi và tài nguyên về 0 khi kết thúc season
- [ ] **SEASON-02**: Một số attributes/items được đánh dấu "legacy" và giữ qua reset (thiết kế chi tiết trong phase)
- [ ] **SEASON-03**: Season-end: leaderboard chụp lại, phần thưởng trao cho top players
- [ ] **SEASON-04**: Hall of fame: lưu trữ vĩnh viễn top players mỗi season
- [ ] **SEASON-05**: Quy trình reset multi-phase: thông báo T-7 ngày → khóa marketplace → flush pending orders → reset → mở season mới

### Football Prediction Event System

- [ ] **PRED-01**: Bot fetches upcoming football fixtures from API-Football every 60 minutes
- [ ] **PRED-02**: Bot polls live scores for in-progress fixtures every 15 minutes
- [ ] **PRED-03**: Bot resolves matches 2 hours after kickoff, pays out winning bets
- [ ] **PRED-04**: Odds refresh every 15 minutes for kickoff-removed future (current odds stay for live)
- [ ] **PRED-05**: Register + rotate API-Football keys in Redis; handle rate limits
- [ ] **PRED-06**: Odds engine uses BIGINT-safe arithmetic (lossless, no floating-point drift)
- [x] **PRED-07**: Prediction embed displays match info, pick buttons, confirm button, timer
- [ ] **PRED-08**: Message component interaction (button clicks) drives the betting flow
- [x] **PRED-09**: 3 prediction types: home/draw/away result, correct score, and double chance
- [x] **PRED-10**: Per-channel prediction config (on/off toggle, per-league toggle)
- [x] **PRED-11**: Full i18n coverage for all prediction strings (VI/EN/ZH-CN)
- [x] **PRED-12**: /predictions command + /config predictions admin command
- [x] **PRED-13**: API-Football keys documented in .env.example with ToS warning

### i18n & Admin

- [ ] **I18N-01**: Bot phản hồi theo ngôn ngữ của user (VI mặc định): user override → Discord locale → default VI
- [ ] **I18N-02**: Locale files đầy đủ cho VI, EN, ZH-CN; CLI tool để detect missing keys
- [ ] **I18N-03**: ESLint rule + pre-commit hook: cảnh báo/block hardcoded user-facing strings
- [ ] **ADMIN-01**: Admin abuse reporting: user report hành vi bất thường; admin xem queue và xử lý

## v2 Requirements

### Monetization

- **MONET-01**: Nạp linh thạch qua Discord native SKU (Monetization API)
- **MONET-02**: Phân biệt linh thạch kiếm được vs. linh thạch mua (hai tier)
- **MONET-03**: Bảo vệ giao dịch thanh toán trong quá trình season reset
- **MONET-04**: Lịch sử nạp và số dư hiển thị trong `/profile`

### Social

- **SOCIAL-01**: Hệ thống môn phái/guild
- **SOCIAL-02**: Thành tích broadcast (achievement lên cảnh giới mới thông báo server)
- **SOCIAL-03**: Leaderboard server-specific (optional per-guild toggle)

### Admin

- **ADMIN-02**: Admin slash commands per-guild: config language, toggle features, set bonus channels
- **ADMIN-03**: Web dashboard (v3+)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-server character (local tu vi) | Global character là core design, per-server would fragment player base |
| Web dashboard | Slash commands sufficient for v1; significant FE scope |
| Mobile app | Discord is the platform |
| OAuth / Patreon integration | Deferred to post-monetization design |
| Real-time chat feature | Discord native handles this |
| Guild/môn phái system | v2 — depends on community growth |
| Animated/media responses | Scope creep; text-based v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1: Foundation | ✅ Complete |
| INFRA-02 | Phase 1: Foundation | ✅ Complete |
| INFRA-03 | Phase 1: Foundation | ✅ Complete |
| INFRA-04 | Phase 1: Foundation | ✅ Complete |
| INFRA-05 | Phase 1: Foundation | ✅ Complete |
| INFRA-06 | Phase 1: Foundation | ✅ Complete |
| INFRA-07 | Phase 1: Foundation | ✅ Complete |
| I18N-01 | Phase 1: Foundation | ✅ Complete |
| I18N-02 | Phase 1: Foundation | ✅ Complete |
| I18N-03 | Phase 1: Foundation | ✅ Complete |
| CORE-01 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| CORE-02 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| CORE-03 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| CORE-04 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| CORE-05 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| CORE-06 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| CORE-07 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| CORE-08 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| PROG-01 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| PROG-02 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| PROG-03 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| PROG-04 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| PROG-05 | Phase 2: Core Game Loop + Progression | ✅ Complete |
| PROG-06 | Phase 2: Core Game Loop + Progression | ⏸️ Pending (v1) |
| PROG-07 | Phase 2: Core Game Loop + Progression | ⏸️ Pending (v1) |
| PROG-08 | Phase 2: Core Game Loop + Progression | ⏸️ Pending (v1) |
| PRED-01 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-02 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-03 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-04 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-05 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-06 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-07 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-08 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-09 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-10 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-11 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-12 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| PRED-13 | Phase 02.2: Football Prediction Event System | ✅ Complete |
| COMBAT-01 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| COMBAT-02 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| COMBAT-03 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| COMBAT-04 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-01 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-02 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-03 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-04 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-05 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-06 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-07 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-08 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-09 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-10 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-11 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| MKT-12 | Phase 3: Combat + Marketplace | ⏸️ Pending (v1) |
| SEASON-01 | Phase 4: Season System + Admin | ⏸️ Pending (v1) |
| SEASON-02 | Phase 4: Season System + Admin | ⏸️ Pending (v1) |
| SEASON-03 | Phase 4: Season System + Admin | ⏸️ Pending (v1) |
| SEASON-04 | Phase 4: Season System + Admin | ⏸️ Pending (v1) |
| SEASON-05 | Phase 4: Season System + Admin | ⏸️ Pending (v1) |
| ADMIN-01 | Phase 4: Season System + Admin | ⏸️ Pending (v1) |

## v2 Requirements (OwO Farming Service)

**Current focus:** Xây dựng kênh sử dụng Linh Thạch thông qua dịch vụ cung cấp Self-bot tự động farm OwO.

### Farming Service (OwO)

- [ ] **FARM-01**: User có thể cung cấp Discord Token để sử dụng dịch vụ self-bot. Token phải được mã hóa an toàn khi lưu trữ.
- [ ] **FARM-02**: Mua các gói dịch vụ (tuần/tháng) bằng Linh Thạch. Gói tự động hết hạn và ngừng bot.
- [ ] **FARM-03**: Hệ thống tự động farm tiền OwO (auto-hunt, auto-battle, auto-cf, auto-pray/curse) bằng thư viện `discord.js-selfbot-v13`.
- [ ] **FARM-04**: Hệ thống tự động phát hiện captcha từ bot OwO, tạm dừng farm và DM/Ping user để giải quyết.
- [ ] **FARM-05**: User có slash commands để kiểm tra trạng thái bot (đang chạy, lỗi, chờ captcha, hạn gói).
- [ ] **FARM-06**: Hệ thống Batched Worker Pool (Master - Worker) để quản lý hàng trăm process tự động một cách tối ưu trên server 4 CPU/24GB RAM. Mở rộng tự động khi lượng user tăng.
- [ ] **FARM-07**: Hỗ trợ config chiến thuật riêng: tự động chuyển tiền về account chính, cấu hình delay, hoặc chỉ auto một số lệnh nhất định.
- [ ] **FARM-08**: Hệ thống quản lý Proxy Pool (Admin commands & Auto-assignment) để tránh Discord gắn cờ.
- [ ] **FARM-09**: Quản lý Group Channel Farming. Tự động gán user vào channel riêng trong `auth_server` sau khi nhập token thành công. Lưu thông tin gán vào DB để self-bot farm đúng channel chỉ định.

### Monetization

- [ ] **MONET-01**: Nạp linh thạch qua chuyển khoản ngân hàng (manual hoặc auto API) / Discord native SKU.
- [ ] **MONET-02**: Phân biệt linh thạch kiếm được vs. linh thạch mua (hai tier) - [Deferred].
- [ ] **MONET-03**: Bảo vệ giao dịch thanh toán trong quá trình season reset.
- [ ] **MONET-04**: Lịch sử nạp và số dư hiển thị trong `/profile`.

### Social

- [ ] **SOCIAL-01**: Hệ thống môn phái/guild
- [ ] **SOCIAL-02**: Thành tích broadcast (achievement lên cảnh giới mới thông báo server)
- [ ] **SOCIAL-03**: Leaderboard server-specific (optional per-guild toggle)

### Admin

- [ ] **ADMIN-02**: Admin slash commands per-guild: config language, toggle features, set bonus channels
- [ ] **ADMIN-03**: Web dashboard (v3+)

---

## v3 Requirements (Tam Quốc Collection)

**Current focus:** Game sưu tầm hero Tam Quốc (kiểu Pokemon) tách biệt dữ liệu nhưng dùng chung `users.balance` (Linh thạch) làm tiền tệ. Encounter đến từ di chuyển trả phí — Linh thạch là sink chính + chống bot tự nhiên.

### Foundation & Economy Budget

- [x] **TQC-01**: Extract shared wallet service (`services/wallet.ts`): `deductBalance` (WHERE guard + rowCount) + `creditBalance`; refactor các call site hiện có (gather, farming, football) qua wallet.
- [x] **TQC-02**: Schemas mới: `heroes`, `user_heroes` (IV 6 chỉ số), `map_nodes`, `player_travel_state`, `sanguo_battles`, `sanguo_items`, `user_sanguo_items`, `encounter_runs` + migration + idempotent seed.
- [x] **TQC-03**: i18n `sanguo` namespace (VI/EN/ZH-CN từ ngày đầu); content data (tên hero/vùng/item) ở DB per-locale columns; chỉ UI strings trong i18next.
- [x] **TQC-04**: Emoji registry generator từ `emojis.json` (1056 emoji) → `assets/sanguoEmojis.ts` + `heroEmoji()` helper + startup `applicationId === CLIENT_ID` check; không đọc sibling repo lúc runtime.
- [x] **TQC-05**: Economy budget document: expected Linh thạch/hour của optimal loop (dưới tu vi caps), convertibility decisions, net-sink/neutral constraint — design-gate trước khi viết content.

### Travel & Encounters

- [ ] **TQC-06**: Pure `travelService`: ETA/transitions; `/sanguo travel` (time-only — travel costs never touch Linh thạch, D-01; atomic state row write; destination picked via select menu + Start button, D-26; NO travel-cancel component — one-way commitment, D-03; pull check-in on subsequent invocations, D-22). *(Old "atomic wallet deduct + travel-cancel component" wording INVALIDATED by D-01/D-03.)*
- [ ] **TQC-07**: Pull-based travel check-in on `/sanguo travel` — elapsed → arrival/encounter results inline (D-22/D-23); no sanguoTick cron, no REST DM; FOR UPDATE on the user's own travel row. *(Old "sanguoTick pg-boss cron + REST notifications" wording INVALIDATED by D-22/D-23.)*
- [ ] **TQC-08**: Encounter system: roll dọc hành trình theo vùng + boss thường; route-scaled encounter rates; per-user caps (~20/hr) + cooldown từ ngày đầu.
- [ ] **TQC-09**: Map/zone data research — node structure + phân bố 132 hero theo vùng/lore (phase research riêng, thảo luận data sau).

### Battle & Capture

- [ ] **TQC-10**: Pure `battleEngine` (seeded, replayable với `pure-rand`); `sanguo_battles` records + jsonb round logs; solo battle (player-initiated + encounter-initiated).
- [ ] **TQC-11**: `captureService`: `captureChance(rarity × HP% × item)` clamped [0,1]; crypto RNG; % hiển thị trước khi bắt; pity counter; audit log đầy đủ kể cả failed attempts.
- [ ] **TQC-12**: IV 6 chỉ số (0–31) roll khi bắt; starter onboarding chọn 1 hero miễn phí (faucet duy nhất).
- [ ] **TQC-13**: Collection view: `/sanguo heroes` (collection/pokedex theo zone, emoji + tier + IV); `/sanguo map` scaffold.

### Progression, Chemistry & Economy Depth

- [ ] **TQC-14**: Duplicate → hồn ngọc: tier-scaled, diminishing returns, daily conversion cap, account-bound (không convert Linh thạch).
- [ ] **TQC-15**: Evolution L20→t1 / L50→t2; t3 schema-gated (chờ event/item đặc biệt).
- [ ] **TQC-16**: `/sanguo shop` + bag; boss thường drop items (never money); mọi sink qua `wallet.deductBalance`.
- [ ] **TQC-17**: Legion battle 3+9 chemistry (buff hệ kiểu EA FC, bonus-only không penalty) mở rộng `battleEngine`; chemistry data model thiết kế từ Phase 1.

### Anti-Abuse, Monitoring & Marketplace Gating

- [ ] **TQC-18**: Bot detection: velocity/exact-interval heuristics + captcha escalation (reuse farming captcha infra) + soft-cap + review.
- [ ] **TQC-19**: Economy monitoring: audit reports (Linh thạch per item per day), telemetry từ Phases 2–3 feed balance pass.
- [ ] **TQC-20**: Marketplace convertibility gating — không collection item nào marketable nếu chưa có reviewed conversion spec.
- [ ] **TQC-21**: Automation policy documentation — collection-game bots vs paid farming service, stance nhất quán.

---

## Traceability (v3)

| Requirement | Phase | Status |
|-------------|-------|--------|
| TQC-01 | Phase 8: Foundation, Economy Budget & Content Infrastructure | Pending |
| TQC-02 | Phase 8: Foundation, Economy Budget & Content Infrastructure | Complete |
| TQC-03 | Phase 8: Foundation, Economy Budget & Content Infrastructure | Pending |
| TQC-04 | Phase 8: Foundation, Economy Budget & Content Infrastructure | Pending |
| TQC-05 | Phase 8: Foundation, Economy Budget & Content Infrastructure | Pending |
| TQC-06 | Phase 9: Travel & Encounters | Pending |
| TQC-07 | Phase 9: Travel & Encounters | Pending |
| TQC-08 | Phase 9: Travel & Encounters | Pending |
| TQC-09 | Phase 9: Travel & Encounters | Pending |
| TQC-10 | Phase 10: Battle & Capture | Pending |
| TQC-11 | Phase 10: Battle & Capture | Pending |
| TQC-12 | Phase 10: Battle & Capture | Pending |
| TQC-13 | Phase 10: Battle & Capture | Pending |
| TQC-14 | Phase 11: Progression, Chemistry & Economy Depth | Pending |
| TQC-15 | Phase 11: Progression, Chemistry & Economy Depth | Pending |
| TQC-16 | Phase 11: Progression, Chemistry & Economy Depth | Pending |
| TQC-17 | Phase 11: Progression, Chemistry & Economy Depth | Pending |
| TQC-18 | Phase 12: Anti-Abuse, Monitoring & Marketplace Gating | Pending |
| TQC-19 | Phase 12: Anti-Abuse, Monitoring & Marketplace Gating | Pending |
| TQC-20 | Phase 12: Anti-Abuse, Monitoring & Marketplace Gating | Pending |
| TQC-21 | Phase 12: Anti-Abuse, Monitoring & Marketplace Gating | Pending |

**Coverage:**

- v3 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---

## Traceability (v2)

| Requirement | Phase | Status |
|-------------|-------|--------|
| FARM-01 | Phase 5: Self-bot Infrastructure | ✅ Complete |
| FARM-06 | Phase 5: Self-bot Infrastructure | ✅ Complete |
| FARM-08 | Phase 5.1: Proxy Pool & Admin Management | ✅ Complete |
| FARM-09 | Phase 6.1: Farming Channel Management | ✅ Complete |
| FARM-03 | Phase 6: Farming Logic & Captcha Handling | ✅ Complete |
| FARM-04 | Phase 6: Farming Logic & Captcha Handling | ✅ Complete |
| FARM-07 | Phase 6: Farming Logic & Captcha Handling | ✅ Complete |
| FARM-02 | Phase 7: Monetization & Subscription Commands | ✅ Complete |
| FARM-05 | Phase 7: Monetization & Subscription Commands | ✅ Complete |
| MONET-01 | — | ⏸️ Deferred (out of Phase 7 scope) |
| MONET-04 | — | ⏸️ Deferred (out of Phase 7 scope) |

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-08-10 — Milestone v3.0 Tam Quốc Collection requirements defined (TQC-01 → TQC-21)*
