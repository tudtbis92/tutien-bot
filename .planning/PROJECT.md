# TuTien Bot

## What This Is

Discord bot RPG thể loại tu tiên (xianxia), hoạt động trên nhiều server đồng thời (multi-shard). Người chơi tích lũy tu vi thụ động thông qua mọi hoạt động Discord (chat, voice, react...), lên cảnh giới, thu thập tài nguyên, phát triển nghề nghiệp và giao dịch vật phẩm qua marketplace kinh tế động. Hỗ trợ đa ngôn ngữ từ đầu (i18n full).

## Core Value

Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

## Current Milestone: v3.0 Tam Quốc Collection

**Goal:** Xây dựng game sưu tầm Tam Quốc (kiểu Pokemon) hoạt động như một game con tách biệt — dùng chung Linh thạch (users.balance) làm tiền tệ, dữ liệu hero/bản đồ riêng.

**Target features:**
- Di chuyển trên bản đồ mốc địa danh (thời gian thực, trả Linh thạch theo khoảng cách) + encounter dọc hành trình
- Auto-battle có lịch sử lượt: solo battle (1 hero) + quân đoàn battle (3 chủ lực + 9 hero buff hệ)
- Thu phục hero sau trận theo tỉ lệ % (độ hiếm + HP + item)
- Progression kiểu Pokemon Go: IV 6 chỉ số, duplicate → hồn ngọc, level 20 → t1, level 50 → t2, t3 khóa chờ event
- Item hỗ trợ (mua menu + drop từ boss); hero hiển thị qua emoji Discord (assets sẵn có)
- Boss server + PvP để phase sau

## Requirements

### Validated

- [x] Multi-shard architecture — Validated in Phase 01: Foundation (ShardingManager entry, shard entries, auto-shard count)
- [x] Hỗ trợ đa ngôn ngữ (i18n) từ đầu — Validated in Phase 01: Foundation (i18next VI/EN/ZH-CN scaffold, ESLint i18n enforcement, zero hardcoded strings)
- [x] Infrastructure backbone (DB, Redis, CI/CD) — Validated in Phase 01: Foundation (Drizzle + pg, ioredis, pg-boss, GitHub Actions CI/CD, Fastify health check)
- [x] Bản đồ di chuyển + encounters (Tam Quốc) — Validated in Phase 09: Travel & Encounters (`/sanguo travel` time-only one-way journeys + pull-based check-in, crypto-RNG encounter rolls, boss sub-roll, ~20/hr cap, TQC-09 map data layer)
- [x] Battle + thu phục hero (Tam Quốc) — Validated in Phase 10: Battle & Capture (seeded replayable `battleEngine` with pure-rand xoroshiro128plus, `/sanguo battle` spar + encounter battles, D-20-signed capture-fee tiers 5/15/40/100/250💎, server-authoritative capture with CR-01/CR-02 anti-tamper guards, IV 6-stat capture, starter onboarding faucet, collection + companion switch, TQC-10..13) — deployed + UAT 43/43 (2026-08-14); boss redesign (random zone general + 3v1) tracked to WINDOWS.md #5
- [x] Progression + economy depth (Tam Quốc) — Validated in Phase 11: Progression, Chemistry & Economy Depth (dupe → hồn ngọc tier-scaled account-bound, evolution L20→t1/L50→t2 with t3 schema-gated, `/sanguo shop` 2-currency tabs + bag + use, boss drops items-only never money, legion battle 3+9 với position-based chemistry buffs, multi-class heroes, TQC-14..17) — deployed + UAT 3/3 (2026-08-18)

### Active

- [ ] Hệ thống thuê dịch vụ cày cấp OwO tự động (self-bot) trả phí bằng Linh Thạch
- [ ] Quản lý Worker Pool process cho hàng ngàn user tokens
- [ ] Tích hợp hệ thống alert khi có captcha
- [ ] Tích lũy tu vi tự động qua hoạt động Discord (chat, voice, react)
- [ ] Hệ thống cảnh giới theo season với hard reset
- [ ] Hệ thống nghề nghiệp (gathering + crafting) với skill point tree
- [ ] Marketplace toàn cầu với dynamic pricing (VWAP) và order matching
- [ ] PvE và PvP combat
- [ ] Hỗ trợ đa ngôn ngữ (i18n) từ đầu
- [ ] Multi-shard architecture
- [ ] Hệ thống nạp/mua linh thạch (monetization)
- [ ] Game sưu tầm Tam Quốc (bản đồ di chuyển + encounter + battle + thu phục hero + progression)

### Out of Scope

- Hệ thống môn phái/guild — v2, phụ thuộc vào tăng trưởng cộng đồng
- Web dashboard admin — slash commands đủ cho v1
- Mobile app — Discord là nền tảng duy nhất
- Real-time chat riêng — dùng Discord native

## Context

- **Runtime**: Node.js 22 LTS + discord.js 14.26.2 + TypeScript 5.8.x
- **Database**: PostgreSQL 16+ với Drizzle ORM 0.45.2
- **Stack**: ioredis 5.10.1 (cache/cooldowns), pg-boss 12.15.0 (jobs/cron), i18next 26.0.4 (i18n), Zod 4.3.6 (validation), Fastify 5.8.4 (payment webhook)
- **Deployment**: Oracle Cloud VM — Public IP `168.138.8.160`; SSH key tại `.ssh/oracle-vm.key` (gitignored)
- **Git repo**: https://github.com/genZVN2021/tutien-bot.git
- **Sharding**: discord.js built-in ShardingManager từ ngày đầu; migrate sang discord-hybrid-sharding 3.0.1 tại ~25K guilds
- **Season system**: Cảnh giới reset mỗi season, đổi tên gọi; season đầu dùng xianxia classic (Luyện Khí → Truyện Cơ → Kim Đan → Nguyên Anh → Hóa Thần...); một số thuộc tính/item được giữ lại qua reset (thiết kế chi tiết sau)
- **Monetization**: Người chơi có thể nạp tiền mua linh thạch (currency chính của game)

## Current State

Phase 11 (Progression, Chemistry & Economy Depth) complete + deployed + verified (2026-08-18). Dupe → hồn ngọc conversion (tier-scaled, account-bound, never → Linh thạch), evolution L20→t1/L50→t2 (t3 schema-gated), `/sanguo shop` (2 currency tabs: Linh thạch + Sự kiện; capture_key locked) + bag + use, boss drops items-only never money, legion battle 3+9 with **position-based chemistry** (EA FC-style: `formation_chemistry_links` topology + family/spouse 3 > faction 2 > role 1, level 0-3 additive STR/AGI/INT buffs), multi-class heroes (`hero_classes` join). Live UAT found + fixed 10 CR issues (handler name mismatch, empty menu crash, copy-id vs catalog-id, re-pick move, chemistry display-only bug...) — 11 design decisions DD-11-01..10 (multi-class, position-based chemistry, class-empty, boss redesign to WINDOWS.md #5). 8/8 plans, 449 tests green, deployed to production. Ready for Phase 12 (Anti-Abuse, Monitoring & Marketplace Gating).



Đây là cơ chế phức tạp — ghi lại để downstream phases không đoán mò:

- **base_price**: Giá sàn cố định của từng item
- **market_price**: Tính theo VWAP của các giao dịch trong 1h trước; nếu không có giao dịch → giữ nguyên; khi market chưa có listing → `market_price = base_price`
- **Instant buy**: `1.2 × market_price` (mua từ "hệ thống")
- **Instant sell**: `0.7 × market_price` (bán về "hệ thống"), phí 10% seller chịu, min 1 linh thạch, burn hoàn toàn
- **Limit sell order**: Giá không vượt `2.5 × market_price` lúc đặt lệnh; phí 10% khi khớp, burn
- **Limit buy order**: Không giới hạn giá
- **Order matching**: Real-time, khi buy_price ≥ sell_price → khớp tự động
- **Order lifetime**: GTC (Good Till Cancel)
- **Scope**: Global — mọi server dùng chung một market

## Constraints

- **Platform**: Discord API — mọi interaction qua slash commands và message components
- **Runtime**: Node.js 22 LTS — discord.js 14.26.2 yêu cầu Node.js ≥22.12.0
- **Sharding**: ShardingManager từ ngày đầu; migrate sang discord-hybrid-sharding tại ~25K guilds
- **Currency**: Linh thạch là currency duy nhất; có thể nạp bằng tiền thật
- **Language**: i18n từ ngày đầu — không hardcode string nào; VI mặc định, EN + ZH-CN cùng lúc
- **TypeScript**: 5.8.x (không nâng TS 6.x cho đến khi ecosystem sẵn sàng)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| discord.js 14.26.2 (không phải v15) | v15 vẫn pre-release; v14 stable, ecosystem đầy đủ | ✓ Confirmed |
| Node.js 22 LTS (không phải v20) | discord.js 14.26.2 docs yêu cầu ≥22.12.0; v22 Active LTS đến 2027 | ✓ Confirmed |
| TypeScript 5.8.x (không phải 6.x) | TS 6.0 breaking changes (strict default, no ES5); ecosystem chưa migrate | ✓ Confirmed |
| Drizzle ORM (không phải Prisma/TypeORM) | `.for('update', {skipLocked: true})` native; low overhead cho high-frequency writes | ✓ Confirmed |
| pg-boss (không phải BullMQ) | PostgreSQL-native, ACID jobs; VWAP low-frequency không cần Redis throughput | ✓ Confirmed |
| ioredis (client compatible Redis + Valkey) | Vast Discord bot community code samples; Valkey server viable alternative | ✓ Confirmed |
| PostgreSQL | Cần ACID transactions cho order matching, currency burns | ✓ Confirmed |
| Global marketplace | Tạo kinh tế thống nhất, liquidity tốt hơn per-server | ✓ Confirmed |
| Tu vi là global character | Khuyến khích người chơi join nhiều server | ✓ Confirmed |
| VWAP cho price discovery | Phản ánh thực tế giao dịch, chống pump-and-dump 1 giao dịch | ✓ Confirmed |
| 10% seller fee burn | Tạo deflation sink cho linh thạch economy | ✓ Confirmed |
| Hard season reset | Giữ game fresh, ngăn veteran dominance vĩnh viễn | ✓ Confirmed |
| Fastify 5.x cho payment webhook | Fastest Node.js HTTP framework, TS-first, isolated service | ✓ Confirmed |
| Travel = PULL-based check-in (D-22..D-28), không cron/REST DM | Đơn giản, elapsed tự heal, chống bot (cần chủ động gọi lệnh); SUPERSEDES D-11/D-12 | ✓ Confirmed |
| Travel time-only (D-01): không cost, không cancel (D-03) | Travel chỉ tốn thời gian; travel-as-sink bị bỏ — capture fee là sink (Phase 10, D-18 re-sign) | ✓ Confirmed |
| Encounter supply = f(check-in cadence) ≤ 20/hr | Re-baseline theo pull model; capture fee (Phase 10) phải price theo supply này | ✓ Confirmed |
| Multi-class heroes (`hero_classes` join, migration 0023) | Hero thuộc nhiều class; `heroes.class` = primary (battle/skill), membership quyết định legion slot | ✓ Confirmed (Phase 11, DD-11-01) |
| Position-based chemistry EA FC-style (migration 0024, level 0-3 additive buff) | Gate vị trí qua `formation_chemistry_links` + pair points family/spouse 3 > faction 2 > role 1; thay hệ multiplicative cũ; chemistry áp thực trong battle | ✓ Confirmed (Phase 11, DD-11-02/03/04) |
| Boss drops items only, never money; capture phí qua wallet.deductBalance | Faucet an toàn không chạm `users.balance`; mọi sink đi qua wallet | ✓ Confirmed (Phase 11) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-18 after Phase 11 (Progression, Chemistry & Economy Depth)*
