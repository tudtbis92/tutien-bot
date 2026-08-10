# Phase 8: Foundation, Economy Budget & Content Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 08-foundation-economy-budget-content-infrastructure
**Areas discussed:** Wallet service & balance history, Per-locale content storage, Seed scope & map nodes, Emoji registry & appId check, Economy budget doc & i18n split

---

## Wallet Service & Balance History

| Option | Description | Selected |
|--------|-------------|----------|
| Ledger ngay từ đầu | Thêm bảng `wallet_transactions` (userId, type, amount, balance_after, reason, metadata, created_at) — mọi deduct/credit ghi 1 row trong cùng transaction | ✓ |
| Service thuần, ledger sau | Chỉ extract service, không thêm bảng; history để sau | |
| Ledger tối giản | Chỉ balance_after, không type/reason/metadata | |

| Option | Description | Selected |
|--------|-------------|----------|
| Wallet quản lý tx | `wallet.deductBalance(tx, userId, amount, {reason, metadata})` — ghi ledger atomic trong cùng transaction | ✓ |
| Caller mở tx | Service chỉ chạy trên tx mở từ caller | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mọi flow qua wallet | Wallet là single source of truth cho MỌI thay đổi users.balance | ✓ |
| Chỉ 3 flow hiện tại | Chỉ refactor gather/farming/football; flow tương lai tự dùng khi viết | |

| Option | Description | Selected |
|--------|-------------|----------|
| Có trong Phase 8 | Extend buildProfileEmbed với section lịch sử ngay | |
| Ledger trước, UI sau | Ledger ghi đủ data từ Phase 8; UI history ở phase khác | ✓ |

**User's choice:** Ledger ngay từ đầu (D-01); Wallet quản lý tx (D-02); Mọi flow qua wallet (D-03); Ledger trước, UI sau (D-04)
**Notes:** User ưu tiên wallet như single choke point — enforcement structural, không convention. SC1 đạt qua refactor (no drift, no double-spend); hiển thị history không bắt buộc cho SC1.

---

## Per-Locale Content Storage

| Option | Description | Selected |
|--------|-------------|----------|
| 3 cột riêng | `name_vi`, `name_en`, `name_zh` (3 cột varchar) | ✓ |
| JSONB names | 1 cột JSONB `{vi,en,zh}` | |
| Bảng translation riêng | Bảng translations (key, locale, value) | |

| Option | Description | Selected |
|--------|-------------|----------|
| EN từ data, ZH dịch seed | EN từ `en` field; VI từ `name`; ZH-CN agent dịch tạm | |
| Chờ nguồn ZH chính thức | Phải có nguồn ZH-CN đầy đủ trước khi seed | |
| VI+EN trước, ZH sau | ZH-CN content thêm sau | |

| Option | Description | Selected |
|--------|-------------|----------|
| Content=DB, UI=i18next | Tên hero/zone/item ở DB; UI strings trong sanguo namespace | ✓ |
| Cả lore trong i18next | Hero title/detail (lore) nằm i18next | |

| Option | Description | Selected |
|--------|-------------|----------|
| Đăng ký cả 2 nơi | Thêm 'sanguo' vào cả i18n/index.ts `ns` VÀ scripts/check-i18n.ts NAMESPACES | ✓ |
| Chỉ i18n/index.ts | check-i18n cập nhật sau | |

**User's choice (free-text on ZH source):** research qua tavily để lấy kết quả chính xác
**Notes:** ZH-CN hero names được research qua Tavily web search — không agent-guess, không defer. Đây là điểm chốt D-06.

---

## Seed Scope & Map Nodes

| Option | Description | Selected |
|--------|-------------|----------|
| Cả 132 hero | Seed toàn bộ hero từ heroes-v1.json trong Phase 8 | ✓ |
| Subset trước | Seed 20-30 hero tiêu biểu, thêm sau Phase 9 research | |

| Option | Description | Selected |
|--------|-------------|----------|
| Schema đủ, seed tối thiểu | Cấu trúc map_nodes đầy đủ, seed 5-10 node placeholder; phân bố hero theo vùng là Phase 9 | ✓ |
| Seed bản đồ thật luôn | Kéo TQC-09 research vào Phase 8 | |

| Option | Description | Selected |
|--------|-------------|----------|
| ON CONFLICT DO NOTHING | Re-run seed không duplicate, không update content cũ | |
| Upsert full | DO UPDATE — seed mới cập nhật thay đổi content | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| 1 script seed idempotent | `scripts/seed-sanguo.ts` upsert toàn bộ content, re-run được | ✓ |
| Nhiều script riêng | Tách script theo domain | |

**User's choice:** Cả 132 hero (D-09); Schema đủ, seed tối thiểu (D-10); Upsert full (D-11); 1 script seed idempotent (D-12)
**Notes:** Upsert full giúp re-run sau khi Tavily research xong điền ZH — cập nhật thay đổi mà không duplicate.

---

## Emoji Registry & AppId Check

| Option | Description | Selected |
|--------|-------------|----------|
| Build-time generate, commit file | Script đọc emojis.json từ sibling repo lúc build/dev, xuất `src/assets/sanguoEmojis.ts` đã commit | ✓ |
| Runtime generate từ file copy | Copy emojis.json vào repo và generate lúc chạy | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fail cứng khi mismatch | Startup check applicationId === CLIENT_ID → FATAL exit | ✓ |
| Warn, không block | Mismatch chỉ log warn | |

| Option | Description | Selected |
|--------|-------------|----------|
| heroEmoji() là điểm duy nhất | Bắt buộc dùng helper, ESLint chặn nhúng trực tiếp | ✓ |
| Helper ưu tiên, không bắt buộc | Cho phép nhúng trực tiếp | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chốt appId là CLIENT_ID | 1381818375633899562 là CLIENT_ID bot | ✓ |
| Chưa chốt | CLIENT_ID có thể khác | |

**User's choice:** Build-time generate + commit file (D-13); Fail cứng (D-14); heroEmoji() là điểm duy nhất (D-15); Chốt appId là CLIENT_ID (D-16)
**Notes:** Runtime KHÔNG đọc sibling repo — đúng TQC-04. Check cứng bảo vệ hiển thị emoji đúng ứng dụng.

---

## Economy Budget Doc & i18n Split

| Option | Description | Selected |
|--------|-------------|----------|
| Doc riêng, ADR-style | `docs/economy-budget.md` — artifact phê duyệt, reference từ Phase 12 | ✓ |
| Gộp vào planning docs | Chỉ section trong CONTEXT/PLAN | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chốt số trong Phase 8 | Số liệu cụ thể trước khi seed content — design-gate | ✓ |
| Số liệu điền dần | Phase 8 chỉ phác thảo model + constraints | |

| Option | Description | Selected |
|--------|-------------|----------|
| Net-sink/neutral bắt buộc | Tổng sink ≥ tổng source; starter faucet là ngoại lệ duy nhất | ✓ |
| Cho phép net-source | Game con bơm thêm linh thạch | |

| Option | Description | Selected |
|--------|-------------|----------|
| Researcher thu thập số hiện tại | Tu vi caps + VWAP bands từ codebase, feed vào doc | ✓ |
| User cung cấp số | User tự cung cấp số liệu kinh tế | |

**User's choice:** Doc riêng ADR-style (D-17); Chốt số trong Phase 8 (D-18); Net-sink/neutral bắt buộc (D-19); Researcher thu thập số (D-20)
**Notes:** Design-gate đóng trong Phase 8 chặn faucet → marketplace arbitrage. Net-sink là contract kinh tế toàn milestone.

---

## the agent's Discretion

- Exact `wallet_transactions` columns beyond core set + indexes
- `/sanguo map` scaffold implementation detail (SC3)
- Exact 5–10 placeholder map node set
- Exact `sanguoEmojis.ts` key format + `heroEmoji()` signature
- Exact upsert conflict target / natural keys
- `sanguo` namespace file organization

## Deferred Ideas

- `/profile` transaction history UI — ledger data accumulates Phase 8, visualization later
- Full map/zone structure + hero-per-zone distribution — Phase 9 research (TQC-09)
- Boss server + PvP — post-v1
- t3 evolution tiers / `tiers.json` forms — potential future expansion
