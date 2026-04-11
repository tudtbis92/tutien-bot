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
| INFRA-01 | Phase 1: Foundation | Pending |
| INFRA-02 | Phase 1: Foundation | Pending |
| INFRA-03 | Phase 1: Foundation | Pending |
| INFRA-04 | Phase 1: Foundation | Pending |
| INFRA-05 | Phase 1: Foundation | Pending |
| INFRA-06 | Phase 1: Foundation | Pending |
| INFRA-07 | Phase 1: Foundation | Pending |
| I18N-01 | Phase 1: Foundation | Pending |
| I18N-02 | Phase 1: Foundation | Pending |
| I18N-03 | Phase 1: Foundation | Pending |
| CORE-01 | Phase 2: Core Game Loop + Progression | Pending |
| CORE-02 | Phase 2: Core Game Loop + Progression | Pending |
| CORE-03 | Phase 2: Core Game Loop + Progression | Pending |
| CORE-04 | Phase 2: Core Game Loop + Progression | Pending |
| CORE-05 | Phase 2: Core Game Loop + Progression | Pending |
| CORE-06 | Phase 2: Core Game Loop + Progression | Pending |
| CORE-07 | Phase 2: Core Game Loop + Progression | Pending |
| CORE-08 | Phase 2: Core Game Loop + Progression | Pending |
| PROG-01 | Phase 2: Core Game Loop + Progression | Pending |
| PROG-02 | Phase 2: Core Game Loop + Progression | Pending |
| PROG-03 | Phase 2: Core Game Loop + Progression | Pending |
| PROG-04 | Phase 2: Core Game Loop + Progression | Pending |
| PROG-05 | Phase 2: Core Game Loop + Progression | Pending |
| PROG-06 | Phase 2: Core Game Loop + Progression | Pending |
| PROG-07 | Phase 2: Core Game Loop + Progression | Pending |
| PROG-08 | Phase 2: Core Game Loop + Progression | Pending |
| COMBAT-01 | Phase 3: Combat + Marketplace | Pending |
| COMBAT-02 | Phase 3: Combat + Marketplace | Pending |
| COMBAT-03 | Phase 3: Combat + Marketplace | Pending |
| COMBAT-04 | Phase 3: Combat + Marketplace | Pending |
| MKT-01 | Phase 3: Combat + Marketplace | Pending |
| MKT-02 | Phase 3: Combat + Marketplace | Pending |
| MKT-03 | Phase 3: Combat + Marketplace | Pending |
| MKT-04 | Phase 3: Combat + Marketplace | Pending |
| MKT-05 | Phase 3: Combat + Marketplace | Pending |
| MKT-06 | Phase 3: Combat + Marketplace | Pending |
| MKT-07 | Phase 3: Combat + Marketplace | Pending |
| MKT-08 | Phase 3: Combat + Marketplace | Pending |
| MKT-09 | Phase 3: Combat + Marketplace | Pending |
| MKT-10 | Phase 3: Combat + Marketplace | Pending |
| MKT-11 | Phase 3: Combat + Marketplace | Pending |
| MKT-12 | Phase 3: Combat + Marketplace | Pending |
| SEASON-01 | Phase 4: Season System + Admin | Pending |
| SEASON-02 | Phase 4: Season System + Admin | Pending |
| SEASON-03 | Phase 4: Season System + Admin | Pending |
| SEASON-04 | Phase 4: Season System + Admin | Pending |
| SEASON-05 | Phase 4: Season System + Admin | Pending |
| ADMIN-01 | Phase 4: Season System + Admin | Pending |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after initial definition*
