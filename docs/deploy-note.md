# Deploy Note — TuTien Bot

> Tài liệu tham khảo cho agent/bạn chạy deploy trên production server.
> Cập nhật: 2026-08-18 — **ĐÃ DEPLOY** toàn bộ Phase 11 (progression, chemistry & economy depth) lên production.
> **Production hiện chạy `origin/main` = HEAD `10a12f9` (Phase 11 + UAT session).**

---

## 1. QUYẾT ĐỊNH QUAN TRỌNG NHẤT

**Deploy Phase 11 ĐÃ HOÀN TẤT an toàn (2026-08-18).**
- Migrations **0020/0021/0022** hoàn toàn **ADDITIVE** (5 bảng mới: sanguo_skills/user_hero_soulgems/user_legion_slots/user_legions/soulgem_transactions; ADD COLUMN trên user_heroes/sanguo_items/encounter_runs/formations; 0022 = UNIQUE index user_legion_slots) — **không DROP/TRUNCATE/DELETE** → không cần rollback DB, chỉ rollback code nếu lỗi.
- **Lưu ý node IDs** (CR-10-01 fix ở Phase 10): seed giờ chỉ xóa node stale, giữ ID → travel không bị lỗi NODE_NOT_FOUND nữa. Đã verified ổn định từ Phase 10.

---

## 2. TỔNG QUAN DEPLOY

- **Deploy script:** `scripts/deploy.sh` (thủ công — không có GitHub Actions trong repo).
- **Quy trình deploy.sh:** `git pull origin main` → `npm ci` → `npm run build` → `source /etc/tutien/.env` → `DATABASE_URL="$DATABASE_URL_DIRECT" npx drizzle-kit migrate` → `DATABASE_URL="$DATABASE_URL_DIRECT" npx tsx scripts/seed-sanguo.ts` → `pm2 restart tutien-bot` → sleep 8 → `curl /health` → grep `"status":"ok"`.
- **Node version:** `.nvmrc` = 22 (deploy.sh `nvm use 22`).
- **PM2 process name:** `tutien-bot`.

---

## 3. CẤU TRÚC CƠ SỞ DỮ LIỆU (sau Phase 8 + post-gate)

### Migrations: 0000 → 0023

| Migration | Nội dung | Đặc điểm |
|---|---|---|
| 0000–0013 | v1 + v2 (chạy production hiện tại) | — |
| 0014 | 9 sanguo tables + hero_faction/hero_role/wallet_transaction_type enums | ADDITIVE |
| 0015 | hero_class enum, hero_factions/formations/formation_slots/user_formations, hero_role → 9 giá trị, heroes.faction_id/class/family, user_heroes IV rename | ADDITIVE trên production (bảng mới rỗng) |
| 0016 | hero_families + heroes.family_id FK | ADDITIVE |
| 0017 | hero_relations (spouse) | ADDITIVE |
| 0018 | map_zones/map_edges/hero_zone_rates tables; player_travel_state +travel_seconds_remaining/encounter_active, −arrive_at/−cost; encounter_runs +encounter_type/user_status_idx | ADDITIVE + DROP 2 cột trên bảng RỖNG (an toàn 2026-08-13) |
| 0019 | capture_attempts + user_sanguo_state tables; heroes +str/agi/int/mov/lea/cha/hp/mp/rarity/tier; user_heroes +hp_current/captured_zone; sanguo_battles +encounter_id/type/seed/input/result; encounter_runs +pity_count; FK + CHECK (rarity/tier 1–5) + indexes | ADDITIVE 100% (không DROP/TRUNCATE) — deploy 2026-08-14 |
| 0020 | sanguo_skills/user_hero_soulgems/user_legion_slots/user_legions/soulgem_transactions tables; user_heroes +tier/skill_normal_id/skill_special_id; sanguo_items +price_linh/price_event/sale_state/drop_weight; encounter_runs +level/skill ids; formations +emoji; FK + indexes | ADDITIVE 100% — deploy 2026-08-18 |
| 0021 | sanguo_items +emoji | ADDITIVE |
| 0022 | UNIQUE index user_legion_slots (user_id, user_hero_id) — WR-05 | ADDITIVE |
| 0023 | hero_classes join table (hero_id FK, hero_class, unique hero_id+class) — Phase 11 multi-class | ADDITIVE — deploy 2026-08-18 |

### ⚠️ Điểm cần biết về migration

1. **`0015` có `TRUNCATE TABLE "heroes" RESTART IDENTITY CASCADE`** ở dòng 6.
   - **AN TOÀN**: đã xác nhận journal production trước deploy (2026-08-12) KHÔNG chứa 0014 → heroes chưa từng tồn tại → TRUNCATE trên bảng rỗng = vô hại. Đã deploy thành công.
   - **NGUY HIỂM nếu deploy lại lần nữa mà 0014+seed đã chạy**: TRUNCATE sẽ xóa data heroes production. → **Luôn kiểm tra journal production trước mỗi deploy** (mục 4.4).
2. **`0004` (dk_event_id)**: ⚠️ **Bản ghi deploy-note cũ SAI** khi nói "journal production đã ghi 0004 đã chạy".
   - THỰC TẾ (verify 2026-08-12): journal production KHÔNG có hash 0004, column `dk_event_id` chưa từng tồn tại. Migration 0004 CHƯA BAO GIỜ chạy trên production.
   - **drizzle-kit chỉ áp dụng migration SAU migration cuối đã ghi journal** — production journal kết thúc ở 0013 (sau đó là 0014-0017). Vì 0004 (idx 4) CŨ HƠN 0013 nên **KHÔNG bao giờ bị chạy lại** trên production. Hệ quả ròng tương đương fresh-DB (0004 add rồi 0006 drop → không có `dk_event_id`) → **vô hại, đã xác nhận schema production không có dk_event_id**.
3. **`0018` DROP `arrive_at`/`cost` trên `player_travel_state`**: AN TOÀN (bảng 0 rows trước deploy 2026-08-13). Nếu bảng có data journey → data mất. Drizzle-kit đã ghi journal nên **KHÔNG chạy lại lần sau**.
4. Tất cả migration 0014–0018 đều **không cần rollback DB** (0018 drop trên bảng rỗng) → chỉ rollback code nếu lỗi.

### Seed: `scripts/seed-sanguo.ts` (chạy MỖI lần deploy)

- **Idempotent** (upsert, chạy 2 lần không nhân đôi).
- Tạo: **14 factions + 12 families + 132 heroes + 73 map_nodes + 18 map_zones + 162 map_edges + 208 hero_zone_rates + 3 items + 2 spouse relations**.
- Map data (D-20) **full-replace**: xóa mapEdges/heroZoneRates/mapNodes con→cha trước, rồi upsert lại → chạy nhiều lần không tích lũy duplicates.
- **Không đụng** users/balance/characters — chỉ sanguo content.
- Yêu cầu: `DATABASE_URL_DIRECT` (đã có trong deploy.sh), file `scripts/data/heroes-v1.json` + `sanguo-classifications.json` + `sanguo-zh-names.json` + `sanguo-map-data.json` (đã commit trong repo, deploy-safe).

---

## 4. GATE BẮT BUỘC TRƯỚC KHI DEPLOY

### 4.1 — Xác nhận production `.env` (`/etc/tutien/.env`)

```bash
grep -E "CLIENT_ID|NODE_ENV|DATABASE_URL_DIRECT" /etc/tutien/.env
```

**BẮT BUỘC:**
- `CLIENT_ID=1381818375633899562` — nếu khác → **bot SẼ CHẾT khi boot** (D-14 hard-fail, không có guard).
- `NODE_ENV=production` (hoặc tối thiểu không phải `development` nếu behavior khác).
- `DATABASE_URL_DIRECT` trỏ PostgreSQL trực tiếp (port 5432, bypass PgBouncer) — deploy.sh đã dùng biến này.

> ⚠️ **Rủi ro cao nhất:** nếu production `CLIENT_ID` ≠ emoji applicationId, bot sẽ `process.exit(1)` ngay tại `src/shard.ts:33` TRƯỚC `client.login()`. Kiểm tra kỹ.

### 4.2 — UAT #1: Live boot + emoji render (TQC-04 / SC3 / D-14)

Trên **staging/test server** (KHÔNG production trực tiếp):
```bash
# Boot với đúng CLIENT_ID
CLIENT_ID=1381818375633899562 npm run dev   # hoặc build + node dist/bot.js
# Kỳ vọng: bot boot bình thường
# Chạy /sanguo map trong test server → 7 zone markers render EM OJI (không phải text)
# Test ngược: boot với CLIENT_ID sai → phải log lỗi + exit 1
```
**Đánh dấu pass** trong `.planning/phases/08-foundation-economy-budget-content-infrastructure/08-UAT.md` (test #1).

### 4.3 — UAT #2: Fresh-DB migrate + seed chain (SC2 / TQC-02)

Trên staging DB trống:
```bash
export DATABASE_URL_DIRECT="postgresql://...@localhost:5432/..."
npx drizzle-kit migrate          # toàn bộ 0000→0017, phải exit 0
npx tsx scripts/seed-sanguo.ts   # lần 1
npx tsx scripts/seed-sanguo.ts   # lần 2 (counts không đổi)
# SELECT count(*) heroes=132, map_nodes=7, sanguo_items=3, name_zh NOT NULL = 132
# SELECT count(*) hero_factions=14, hero_families=12, hero_relations=2
```
**Đánh dấu pass** trong `08-UAT.md` (test #2).

### 4.4 — Kiểm tra journal migration production

```bash
# Đảm bảo 0014 CHƯA chạy (nếu đã chạy → TRUNCATE heroes trong 0015 SẼ XÓA DATA khi deploy lại)
psql "$DATABASE_URL_DIRECT" -c "SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id;"
# Đã deploy 2026-08-13: journal có 18 rows (0000-0013 cũ + 0014..0018).
# Nếu deploy KẾ TIẾP thấy 18 rows → 0015/0018 đã chạy → KHÔNG còn TRUNCATE heroes; 0018 drop arrive_at/cost đã ghi journal (không chạy lại).
# Lưu ý: drizzle-kit không chạy lại 0004 (cũ hơn journal cuối) — xem mục 3.2.
```

### 4.5 — Backup production DB

```bash
pg_dump "$DATABASE_URL_DIRECT" > /root/backups/tutien_$(date +%Y%m%d_%H%M).sql
```

### 4.6 — Health check sau deploy (theo dõi ≥ 5 phút)

```bash
pm2 logs tutien-bot --lines 50    # tìm lỗi boot (đặc biệt D-14 appId)
curl -s localhost:3000/health     # kỳ vọng status ok + shards ready
```
> ⚠️ **Hạn chế health check:** `src/workers/health.ts:41` coi `shards.length === 0` (chưa spawn) là healthy. Nếu D-14 làm toàn bộ shard crash ngay khi boot, health có thể vẫn báo ok. → **Phải đọc `pm2 logs`**, không chỉ tin `/health`.

---

## 5. WALLET — SAFETY NET TIỀN (Phase 8)

- Mọi thay đổi `users.balance` giờ đi qua `src/services/wallet.ts` (deductBalance/creditBalance) — **không còn chỗ nào ghi `users.balance` trực tiếp** (grep-proven).
- Mỗi giao dịch ghi **1 row `wallet_transactions`** (userId, type, amount, balance_after, reason, metadata) trong CÙNG transaction → có thể đối soát tuyệt đối.
- **Nếu nghi ngờ bug tiền:** query ledger để đối chiếu:
  ```sql
  SELECT user_id, type, amount, balance_after, reason, created_at
  FROM wallet_transactions WHERE created_at > now() - interval '24 hours' ORDER BY created_at;
  ```
- Ledger không có UI hiển thị cho user (defer) — chỉ dùng audit.

---

## 6. ROLLBACK PLAN (nếu deploy xảy ra lỗi)

1. **Bot crash khi boot (D-14 appId / lỗi khác):**
   ```bash
   pm2 restart tutien-bot     # kiểm tra logs
   # Nếu vẫn crash → rollback code:
   git log --oneline origin/main..HEAD | wc -l   # = 54
   git reset --hard <last_good_commit>           # VD: origin/main (trước Phase 8)
   npm ci && npm run build && pm2 restart tutien-bot
   ```
   - Migrations 0014–0017 đã additive, **không cần rollback DB** — code cũ chạy được với DB mới (thêm bảng/cột không phá schema cũ).

2. **Bug wallet (tiền sai):**
   - Code rollback KHÔNG tự sửa data đã ghi sai.
   - Dùng `wallet_transactions` ledger để xác định giao dịch lỗi → sửa thủ công qua SQL/script (có `balance_after` để tính toán).
   - Báo cáo người quản lý — không tự ý `UPDATE users SET balance` một mình (phải khớp ledger).

3. **Data heroes bị TRUNCATE (chỉ xảy ra nếu 4.4 bị bỏ qua):** chạy lại seed `npx tsx scripts/seed-sanguo.ts` (idempotent, phục hồi 132 heroes).

---

## 7. QUY TRÌNH DEPLOY CHUẨN (khi đã sẵn sàng)

```bash
# Trên máy dev (thực hiện trước, an toàn):
git push origin main

# Trên production server:
cd /path/to/tutien-bot
# 1. Xác nhận .env (mục 4.1)
# 2. Backup DB (mục 4.5)
# 3. Chạy deploy (deploy.sh tự làm pull/build/migrate/seed/restart/health)
./scripts/deploy.sh
# 4. Theo dõi logs + health (mục 4.6)
# 5. Verify giao dịch wallet 24h (mục 5)
```

---

## 8. TRẠNG THÁI HIỆN TẠI (2026-08-18 — ĐÃ DEPLOY PHASE 11)

| Hạng mục | Trạng thái |
|---|---|
| Code quality gates (build/test/lint/typecheck/i18n) | ✅ xanh (449 tests / 43 files) |
| Migrations trên production | ✅ (0014–0022 đã apply, journal 22 rows) |
| Push lên origin/main | ✅ HEAD `10a12f9` (Phase 11) |
| Production env (CLIENT_ID) | ✅ xác nhận = 1381818375633899562 |
| Backup production DB | ✅ `/root/backups/tutien_20260818_0436.sql` (33M) |
| Deploy production | ✅ hoàn tất — bot Shard 0 ready, /health ok, /sanguo subcommands: map/travel/battle/heroes/hero/shop/bag/legion registered, journal 22 rows, skills=41/items=2 purchasable/formations emoji=3 |
| UAT (Phase 11) | 🔄 test 1-2 PASS (shop + legion/chemistry, CR-11-01→10 fixes + position-based chemistry redesign), test 3 pending — boss encounter rate low (0.07/zone), waiting for a natural spawn |

**Kết luận: ĐÃ DEPLOY Phase 11 + position-based chemistry thành công.** UAT test 3 (boss drop+capture) pending live boss trigger. Lần deploy kế tiếp lặp lại gate 4.4–4.6.
