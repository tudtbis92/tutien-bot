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

## Chỉ số IV (đã chốt post-gate Phase 8)

6 chỉ số (0–31 mỗi cái, max tổng 186), rename từ `hp/atk/def/spd/crit/luck` → `str/agi/int/mov/lea/cha`:

| Stat | Vai trò trong battle |
|---|---|
| **STR** | sát thương + phòng thủ vật lý |
| **AGI** | chính xác + né tránh |
| **INT** | sát thương + phòng thủ phép/kỹ năng |
| **MOV** | thứ tự đánh |
| **LEA** | ↑ tỉ lệ buff, ↓ tỉ lệ debuff |
| **CHA** | ↑ gây hiệu ứng phe địch, ↓ bị hiệu ứng phe mình |

**IV% = round(sum/186 × 100)** → hạng: **100**=Hoàng Kim · **90-99**=Hồng ngọc · **80-89**=Lam cấp · **60-79**=Lục cấp · **<60**=Hôi cấp. Hiển thị grade (không phải 6 số thô), i18n keys.

## Faction / Role / Class / Family (đã chốt post-gate Phase 8)

- **Faction phẳng** (bỏ phân cấp): Hán, Ngụy, Thục, Ngô, Thập Thường Thị, Khăn Vàng, Lương Châu + Nam Man, Ô Hoàn, Sơn Việt, Tiên Ti, Hung Nô... (Ngoại Tộc cũ bị thay bởi chính các thành phần của nó). Lưu trong bảng reference `hero_factions`.
- **Role 9**: ruler, general, strategist, civil, royal, eunuch, religious, tribal, scholar.
- **Class 8** (vị trí đội hình, không phải cách tác chiến): vanguard, cavalry, archer, spellcaster, schemer, vu_co, thu_binh, cong_binh.
- **Family**: bảng reference `hero_families` (mỗi row = 1 DÒNG MÁU, không phải họ — Lưu hoàng tộc ≠ bất kỳ gia tộc Lưu nào khác). `heroes.family_id` FK. Chemistry match exact family_id → không bond giả (research xác nhận Công Tôn Toản ≠ Công Tôn Độ). 12 families: liu_hoang_toc (9), ha_ngoai_thich (3), zhang_khan_vang (3), xiahou (2), yuan (2), kuai (2), shi (2), sun/cao/ma/dong/kong (1).

## Chemistry (EA FC style, đã chốt)

3 tầng liên kết — **family** (mạnh nhất, xuyên faction — Gia Cát Lượng/Thục + Gia Cát Cẩn/Ngô vẫn bond) > **faction** (match phẳng) > **role** (yếu nhất). Chemistry chỉ active khi hero xếp **đúng vị trí theo class** trong đội hình.

**Marriage bond (spouse trực tiếp)** = tier-1, **ngang family** (user decision 2026-08-11). Bảng `hero_relations` (hero_a < hero_b, relation_type enum, chỉ `spouse`). In-law (anh/em vợ) KHÔNG tính — đối tác không có trong roster. Seed 2 cặp: Hán Linh Đế ↔ Hà Hoàng Hậu, Hán Linh Đế ↔ Vương Mỹ Nhân.

## Trận hình (đã chốt post-gate Phase 8)

- Không cố định — người chơi **mua trận hình**; mỗi trận hình phân bổ class + số lượng + vị trí slot khác nhau.
- Schema `formations` + `formation_slots` + `user_formations` được thiết kế từ bây giờ (Phase 8 post-gate); logic mua/bán + battleEngine consume ở Phase 11.

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
- 132 hero Tam Quốc (`src/data/heroes-v1.json`): mỗi hero có id/name/title/faction/weapon/detail — faction/role cũ (10 faction/5 role) được tái phân loại sang model mới (faction phẳng + 9 role) qua research (xem "Faction / Role / Class / Family" bên dưới)
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
