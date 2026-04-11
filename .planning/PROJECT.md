# TuTien Bot

## What This Is

Discord bot RPG thể loại tu tiên (xianxia), hoạt động trên nhiều server đồng thời (multi-shard). Người chơi tích lũy tu vi thụ động thông qua mọi hoạt động Discord (chat, voice, react...), lên cảnh giới, thu thập tài nguyên, phát triển nghề nghiệp và giao dịch vật phẩm qua marketplace kinh tế động. Hỗ trợ đa ngôn ngữ từ đầu (i18n full).

## Core Value

Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

## Requirements

### Validated

(None yet — ship to validate)

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

- **Runtime**: Node.js + discord.js (latest stable)
- **Database**: PostgreSQL + ORM (Prisma hoặc TypeORM — quyết định khi research)
- **Deployment**: Multi-shard; cần research Discord bot verification requirements trước khi xác định shard strategy
- **Season system**: Cảnh giới reset mỗi season, đổi tên gọi; season đầu dùng xianxia classic (Luyện Khí → Truyện Cơ → Kim Đan → Nguyên Anh → Hóa Thần...); một số thuộc tính/item được giữ lại qua reset (thiết kế chi tiết sau)
- **Monetization**: Người chơi có thể nạp tiền mua linh thạch (currency chính của game)

## Market Mechanics (chi tiết)

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
- **Sharding**: Phải tuân thủ Discord's gateway sharding requirements (research needed)
- **Currency**: Linh thạch là currency duy nhất; có thể nạp bằng tiền thật
- **Language**: i18n từ ngày đầu — không hardcode string nào

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + discord.js | Ecosystem phong phú nhất cho Discord bot | — Pending |
| PostgreSQL | Cần ACID transactions cho market matching | — Pending |
| Global marketplace | Tạo kinh tế thống nhất, liquidity tốt hơn per-server | — Pending |
| Tu vi là global character | Khuyến khích người chơi join nhiều server | — Pending |
| VWAP cho price discovery | Phản ánh thực tế giao dịch, chống pump-and-dump 1 giao dịch | — Pending |
| 10% seller fee burn | Tạo deflation sink cho linh thạch economy | — Pending |
| Hard season reset | Giữ game fresh, ngăn veteran dominance vĩnh viễn | — Pending |

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
*Last updated: 2026-04-11 after initialization*
