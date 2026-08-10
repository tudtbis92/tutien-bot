---
title: Tam Quốc Collection — Game Design (Milestone v3.0)
date: 2026-08-10
context: Milestone v3.0 new-milestone workflow (discussion captured during explore)
---

# Tam Quốc Collection — Game Design

Game phụ kiểu Pokemon cho bot, dùng chung Linh thạch (`users.balance`) làm tiền tệ, dữ liệu hero/bản đồ riêng.

## Core Loop

1. **Bản đồ**: mốc địa danh (nodes) — di chuyển chọn đích, thời gian thực, trả Linh thạch theo khoảng cách
2. **Encounter dọc đường**: roll RNG — hero theo vùng (solo) + boss thường
3. **Battle**: auto-battle có lịch sử lượt
   - Solo battle: 1 hero đồng hành
   - Quân đoàn battle: 3 chủ lực đánh + 9 hero buff hệ (kiểu EA FC chemistry)
4. **Thu phục**: nút bấm sau trận, tỉ lệ % theo độ hiếm + HP còn lại + item

## Progression (kiểu Pokemon Go)

- Hero tiến hóa **t0 → t1 → t2 → t3** (spritesheet 4 bậc có sẵn)
- **t3 bị khóa** — mở khi có event hoặc sở hữu item đặc biệt
- **IV 6 chỉ số** ngẫu nhiên khi bắt
- **Duplicate → hồn ngọc** → dùng nâng level hero
- **Level 20 → tiến hóa t1, level 50 → tiến hóa t2**

## Khởi đầu & Kinh tế

- Chọn 1 trong vài **starter hero miễn phí**
- **Sink bắt buộc**: Linh thạch = năng lượng di chuyển
- **Sink tùy chọn**: item hỗ trợ (bùa tăng tỉ lệ bắt, hồi máu...) — mua menu + drop từ boss battle
- Item mua trực tiếp + rơi từ battle boss

## Liên kết 2 game

- **Chung balance** (`users.balance`), **dữ liệu riêng** (schema mới)
- Không giao thoa progression với tu tiên chính

## Assets (đã có sẵn)

- `E:\Saeth\sanguo_assets` — repo asset riêng
- 132 hero Tam Quốc (`src/data/heroes-v1.json`): 9 factions, 5 roles, mỗi hero có id/name/title/faction/weapon/detail
- Mỗi hero 4 tier spritesheet (t0→t3) + bản `_star`
- `assets/emojis.json`: **1056 emoji đã upload** cho application `1381818375633899562` — mapping `{hero_id}_{t0..t3}[_star]`
- `tiers.json`: visual 4 bậc, forms (mecha/god/sexy) — tiềm năng mở rộng sau

## Phạm vi v1

- Core loop + quân đoàn battle
- Boss server + PvP → để phase sau
- Bản đồ node + phân bố 132 hero theo vùng/lore → **phase research riêng** (data chưa chốt)

## Encounter

- 2 tầng: roll dọc hành trình (hero theo vùng) + boss sự kiện toàn server
- Điều chỉnh: v1 chỉ có **boss thường** (encounter như hero solo); **boss server thiết kế sau**

## Kế thừa hạ tầng

- `users.balance` bigint + `balance_non_negative` check
- Football betting pattern: DB transaction + SELECT FOR UPDATE chống race
- Redis cooldown, i18n VI/EN/ZH-CN (zero hardcoded string)
- `@napi-rs/canvas` có sẵn (nếu cần render)
