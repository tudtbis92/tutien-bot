# Deploy Note — TuTien Bot

> Tài liệu tham khảo cho agent/bạn chạy deploy trên production server.
> Cập nhật: 2026-08-11 — sau Phase 8 + post-gate (quick 260811-lld).
> **Production hiện chạy `origin/main` trước Phase 8. Có 54 commits (toàn bộ Phase 8 + post-gate) chưa push.**

---

## 1. QUYẾT ĐỊNH QUAN TRỌNG NHẤT

**PUSH code lên GitHub: AN TOÀN** — production không tự deploy (deploy.sh thủ công).
**CHẠY `deploy.sh` trên production: CHƯA NÊN** — còn 2 UAT human tests PENDING + chưa xác nhận production env.

Không deploy cho đến khi **TẤT CẢ** mục trong phần 4 "Gate bắt buộc" đạt.

---

## 2. TỔNG QUAN DEPLOY

- **Deploy script:** `scripts/deploy.sh` (thủ công — không có GitHub Actions trong repo).
- **Quy trình deploy.sh:** `git pull origin main` → `npm ci` → `npm run build` → `source /etc/tutien/.env` → `DATABASE_URL="$DATABASE_URL_DIRECT" npx drizzle-kit migrate` → `DATABASE_URL="$DATABASE_URL_DIRECT" npx tsx scripts/seed-sanguo.ts` → `pm2 restart tutien-bot` → sleep 8 → `curl /health` → grep `"status":"ok"`.
- **Node version:** `.nvmrc` = 22 (deploy.sh `nvm use 22`).
- **PM2 process name:** `tutien-bot`.

---

## 3. CẤU TRÚC CƠ SỞ DỮ LIỆU (sau Phase 8 + post-gate)

### Migrations: 0000 → 0017

| Migration | Nội dung | Đặc điểm |
|---|---|---|
| 0000–0013 | v1 + v2 (chạy production hiện tại) | — |
| 0014 | 9 sanguo tables + hero_faction/hero_role/wallet_transaction_type enums | ADDITIVE |
| 0015 | hero_class enum, hero_factions/formations/formation_slots/user_formations, hero_role → 9 giá trị, heroes.faction_id/class/family, user_heroes IV rename | ADDITIVE trên production (bảng mới rỗng) |
| 0016 | hero_families + heroes.family_id FK | ADDITIVE |
| 0017 | hero_relations (spouse) | ADDITIVE |

### ⚠️ Điểm cần biết về migration

1. **`0015` có `TRUNCATE TABLE "heroes" RESTART IDENTITY CASCADE`** ở dòng 6.
   - **An toàn cho LẦN DEPLOY ĐẦU TIÊN**: production chưa có heroes table (chưa chạy 0014) → 0014 tạo bảng rỗng → 0015 TRUNCATE trên bảng rỗng = vô hại.
   - **NGUY HIỂM nếu production đã chạy 0014 + seed từ trước**: TRUNCATE sẽ xóa toàn bộ data heroes production. → **Tuyệt đối kiểm tra journal production trước khi deploy** (xem phần 4.4).
2. **`0004` được restore** (thêm `dk_event_id` cho football_matches). Journal production đã ghi 0004 đã chạy → drizzle-kit KHÔNG chạy lại → vô hại. Chỉ ảnh hưởng fresh-DB.
3. Tất cả migration 0014–0017 đều **additive** trên production → không cần rollback migration nếu có lỗi (chỉ rollback code).

### Seed: `scripts/seed-sanguo.ts` (chạy MỖI lần deploy)

- **Idempotent** (upsert, chạy 2 lần không nhân đôi).
- Tạo: **14 factions + 12 families + 132 heroes + 7 map_nodes + 3 items + 2 spouse relations**.
- **Không đụng** users/balance/characters — chỉ sanguo content.
- Yêu cầu: `DATABASE_URL_DIRECT` (đã có trong deploy.sh), file `scripts/data/heroes-v1.json` + `sanguo-classifications.json` + `sanguo-zh-names.json` (đã commit trong repo, deploy-safe).

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
# Đảm bảo production chưa chạy 0014 (nếu đã chạy → TRUNCATE heroes nguy hiểm)
psql "$DATABASE_URL_DIRECT" -c "SELECT tag FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5;"
# Nếu thấy 0014_next_chimera → DỪNG, báo cáo người quản lý trước khi deploy
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

## 8. TRẠNG THÁI HIỆN TẠI (2026-08-11)

| Hạng mục | Trạng thái |
|---|---|
| Code quality gates (build/test/lint/typecheck) | ✅ xanh |
| Migrations additive trên production | ✅ |
| Push lên origin/main | ⏸️ chưa (54 commits chờ) |
| Production env (CLIENT_ID) | ❓ chưa xác nhận |
| UAT #1 (live boot + emoji) | ⏳ PENDING |
| UAT #2 (fresh DB chain) | ⏳ PENDING |
| Backup production DB | ❓ chưa chạy |

**Kết luận: CHƯA deploy.** Sau khi hoàn thành mục 4.1–4.5, có thể deploy theo mục 7.
