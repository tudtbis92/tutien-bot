# TuTien Bot

## What This Is

Discord bot RPG thể loại tu tiên (xianxia), hoạt động trên nhiều server đồng thời (multi-shard). Người chơi tích lũy tu vi thụ động thông qua mọi hoạt động Discord (chat, voice, react...), lên cảnh giới, thu thập tài nguyên, phát triển nghề nghiệp và giao dịch vật phẩm qua marketplace kinh tế động. Hỗ trợ đa ngôn ngữ từ đầu (i18n full).

## Core Value

Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

## Requirements

### Validated

- [x] Multi-shard architecture — Validated in Phase 01: Foundation (ShardingManager entry, shard entries, auto-shard count)
- [x] Hỗ trợ đa ngôn ngữ (i18n) từ đầu — Validated in Phase 01: Foundation (i18next VI/EN/ZH-CN scaffold, ESLint i18n enforcement, zero hardcoded strings)
- [x] Infrastructure backbone (DB, Redis, CI/CD) — Validated in Phase 01: Foundation (Drizzle + pg, ioredis, pg-boss, GitHub Actions CI/CD, Fastify health check)

### Active

- [ ] Tích lũy tu vi tự động qua hoạt động Discord (chat, voice, react)
- [ ] Hệ thống cảnh giới theo season với hard reset
- [ ] Hệ thống nghề nghiệp (gathering + crafting) với skill point tree
- [ ] Marketplace toàn cầu với dynamic pricing (VWAP) và order matching
- [ ] PvE và PvP combat
- [ ] Hỗ trợ đa ngôn ngữ (i18n) từ đầu
- [ ] Multi-shard architecture
- [ ] Nạp/mua linh thạch (monetization)

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

Phase 01 (Foundation) complete — full infrastructure backbone deployed: ShardingManager, PostgreSQL/Drizzle, Redis, pg-boss, i18n, CI/CD, health check. Bot can launch and pass CI. Ready for Phase 02 (Core Game Loop + Progression).



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
*Last updated: 2026-04-11 after Phase 01 (Foundation) complete*
