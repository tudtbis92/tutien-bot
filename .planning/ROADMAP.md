# Roadmap: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Granularity:** Coarse  
**Coverage:** 48/48 v1 requirements mapped ✓ · 13/13 v2 requirements mapped ✓ · 21/21 v3 requirements mapped ✓  
**Created:** 2026-04-11

---
## Phases (Milestone v1.0 - PAUSED)

- [x] **Phase 1: Foundation** — Infrastructure, database, Redis, CI/CD, i18n scaffold (completed 2026-04-11)
- [x] **Phase 2: Core Game Loop + Progression** — Active game: tu vi accumulation, anti-farming, character system, cảnh giới, professions (completed 2026-04-12)
- [x] **Phase 02.2: Football Prediction Event** — Event system for betting on matches (completed 2026-05-21)
- [ ] **Phase 02.1: Gather & Craft Seed Data** — ⏸️ PENDING (PAUSED for v2 transition)
- [ ] **Phase 3: Combat + Marketplace** — ⏸️ PENDING (PAUSED for v2 transition)
- [ ] **Phase 4: Season System + Admin** — ⏸️ PENDING (PAUSED for v2 transition)

---

## Milestone v2: OwO Farming Service

**Goal:** Cung cấp utility thực tế cho Linh Thạch bằng dịch vụ thuê self-bot tự động cày tiền OwO, với kiến trúc worker process an toàn và ổn định.

### Phase 5: Self-bot Infrastructure & Core Loop (Completed 2026-06-04)

**Goal:** Xây dựng hệ thống quản lý Master - Worker Pool và login self-bot an toàn bằng Discord token.  
**Requirements:** FARM-01, FARM-06
**Plans:** 4 plans

- [x] 05-01-PLAN.md — Security foundation (AES-256-GCM) + DB Schema
- [x] 05-02-PLAN.md — Self-Bot Worker implementation (Process isolation)
- [x] 05-03-PLAN.md — Master Pool Manager (DB polling + IPC)
- [x] 05-04-PLAN.md — Provisioning UX (Discord Modals + Commands)

### Phase 5.1: Proxy Pool & Admin Management (Completed 2026-06-04)

**Goal:** Quản lý danh sách Proxy tập trung và tự động gán cho User. Áp dụng giới hạn bảo mật Milestone v2 cho tất cả admin commands (chỉ Guild 1465226886018760839 hoặc User 898126643598606367).
**Requirements:** FARM-08
**Plans:** 2 plans

- [x] 05.1-01-PLAN.md — Proxy Pool Schema & ProxyService assignment logic
- [x] 05.1-02-PLAN.md — Admin Security utility & /proxy management commands

### Phase 6: Farming Logic & Captcha Handling (Completed 2026-06-04)

**Goal:** Implement các tính năng farm (hunt, battle) tự động bằng `discord.js-selfbot-v13` và hệ thống detect/alert captcha.  
**Requirements:** FARM-03, FARM-04, FARM-07
**Plans:** 4 plans

- [x] 06-01-PLAN.md — Database, Types & Master Infrastructure
- [x] 06-02-PLAN.md — Core Farming Loop & Full Command Set
- [x] 06-03-PLAN.md — Smart Logic & Response Parsing
- [x] 06-04-PLAN.md — Captcha Detection, Control Commands & Validation

### Phase 6.1: Farming Channel Management (Completed 2026-06-04)

**Goal:** Quản lý group channel farming: Tự động gán user vào channel riêng trong `auth_server` sau khi nhập token thành công. Lưu thông tin gán vào DB để self-bot farm đúng channel chỉ định. Các channel này thuộc server bảo mật đã thiết lập.
**Requirements:** FARM-09
**Plans:** 1 plan

- [x] 06.1-01-PLAN.md — Channel assignment logic & DB integration

### Phase 7: Monetization & Subscription Commands (Completed 2026-06-05)

**Goal:** User flow cho việc mua/thuê gói dịch vụ bằng Linh Thạch, nạp VIP và các slash commands để quản lý self-bot cá nhân.  
**Requirements:** FARM-02, FARM-05, FARM-07
**Plans:** 3 plans

- [x] 07-01-PLAN.md — Foundation & Core Service
- [x] 07-02-PLAN.md — Interaction & Status UI
- [x] 07-03-PLAN.md — Master Worker Integration & Testing

---

## Milestone v3: Tam Quốc Collection

**Goal:** Game sưu tầm hero Tam Quốc (kiểu Pokemon) hoạt động như một game con tách biệt — dùng chung Linh thạch (`users.balance`) làm tiền tệ, dữ liệu hero/bản đồ riêng. Encounters đến từ di chuyển trả phí: Linh thạch là sink chính + chống bot tự nhiên.

### Summary Checklist

- [x] **Phase 8: Foundation, Economy Budget & Content Infrastructure** — Shared wallet, sanguo schemas + seed, i18n namespace, emoji registry, economy design-gate (✅ completed 2026-08-12, deployed to production)
- [ ] **Phase 9: Travel & Encounters** — Real-time time-only travel (D-01), sanguoTick cron, encounter rolls theo vùng + caps
- [ ] **Phase 10: Battle & Capture** — Seeded battleEngine, captureService, IV + starter, collection view (vertical loop đầu tiên)
- [ ] **Phase 11: Progression, Chemistry & Economy Depth** — Dupe → hồn ngọc, evolution, shop + items, legion battle 3+9
- [ ] **Phase 12: Anti-Abuse, Monitoring & Marketplace Gating** — Bot detection, economy monitoring, marketplace gating, automation policy

### Phase 8: Foundation, Economy Budget & Content Infrastructure

**Goal**: Nền tảng chung cho toàn bộ milestone — shared wallet service, schemas + idempotent seed, i18n sanguo (content/UI split), emoji registry, và economy design-gate trước khi viết bất kỳ content nào.
**Depends on**: Nothing (first phase of Milestone v3)
**Requirements**: TQC-01, TQC-02, TQC-03, TQC-04, TQC-05
**Success Criteria** (what must be TRUE):

  1. User can check balance/history in `/profile` after existing money flows (gather, farming, football) are refactored onto the shared wallet service — no balance drift, no double-spend.
  2. Bot boots with all 8 `sanguo` schemas migrated and idempotently seeded — heroes + map nodes present; re-running seed does not duplicate rows.
  3. User can invoke `/sanguo map` and see a read-only map scaffold where hero emojis render from the generated registry (`heroEmoji()`), with a startup `applicationId === CLIENT_ID` check.
  4. User sees `sanguo` UI strings in their locale (VI/EN/ZH-CN) with zero hardcoded strings — i18n lint passes; content names (hero/zone/item) come from DB per-locale columns.
  5. Economy budget document is approved: expected Linh thạch/hour of the optimal loop documented and below tu vi caps; convertibility decisions recorded (net-sink/neutral constraint) — design gate passed before content authoring.

**Plans**: 4/4 plans executed ✅ (phase completed + deployed 2026-08-12)
Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Emoji registry + i18n sanguo + map_nodes schema + /sanguo map scaffold (tracer)
- [x] 08-02-PLAN.md — Wallet service + ledger + 7-site refactor + unit tests (TQC-01)
- [x] 08-03-PLAN.md — Economy budget design-gate doc (TQC-05)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-04-PLAN.md — Dev-DB env + sanguo schemas + migration 0014 (9 tables incl. map_nodes) + seed + deploy (TQC-02)

**Verification**: ✅ UAT 1/1b/2 PASS (2026-08-12) — deploy production, emoji render live (animated `<a:name:id>` fix D-21, zone markers → content `# ` headers D-22)

**UI hint**: yes

### Phase 9: Travel & Encounters

**Goal**: Người chơi di chuyển real-time trên bản đồ mốc địa danh (trả Linh thạch theo khoảng cách, atomic) và nhận encounters dọc hành trình qua `sanguoTick` cron — core loop thời gian thực của game.
**Depends on**: Phase 8
**Requirements**: TQC-06, TQC-07, TQC-08, TQC-09
**Success Criteria** (what must be TRUE):

  1. User can start travel to a map node with `/sanguo travel` — sees destination, ETA and cost; Linh thạch deducted atomically; arrival resolves at the displayed time.
  2. User can cancel a journey mid-travel via the travel-cancel component — travel state resolves safely per the resolved charge model (no stuck/ghost journeys, no refund bugs).
  3. User receives encounters along the route (rates scaled by route/zone, boss thường included) via REST notification even when the user's shard differs from the manager process.
  4. Encounter yield is capped per user (~20/hr) with cooldown enforced from day one — repeated travel cannot exceed the cap.
  5. Map/zone data research completed: node structure + 132 heroes distributed by zone/lore — consumed as seed data for travel and encounters.

**Plans**: 1/5 plans executed
Plans:
**Wave 1**

- [x] 09-01-PLAN.md — Travel journey start (tracer): D-07 travel schema + travelService + /sanguo travel subcommand + first autocomplete + reply embed (TQC-06)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 09-02-PLAN.md — TQC-09 map data: map_zones/map_edges/hero_zone_rates schema + committed dataset + D-20 seed replace + zone-label switch (TQC-09)
- [ ] 09-03-PLAN.md — Arrival resolution: sanguoTickArrivals cron (SKIP LOCKED, pause-aware, self-heal) + REST DM notification service + arrival embed (TQC-07)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 09-04-PLAN.md — Encounter system: position-blended roll engine (crypto RNG) + sanguoTickEncounters cron + ~20/hr sliding-window cap + boss sub-roll + encounter embed (TQC-08)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 09-05-PLAN.md — Integration: [BLOCKING] migration 0018 + D-20 reseed + ROADMAP SC1/SC2/Goal amendments + economy-budget re-sign flag + phase gate (TQC-06..09)

**UI hint**: yes

### Phase 10: Battle & Capture

**Goal**: Vertical loop hoàn chỉnh đầu tiên — starter → travel → encounter → battle → capture → collection; điểm validate "game có vui không" đầu tiên.
**Depends on**: Phase 9
**Requirements**: TQC-10, TQC-11, TQC-12, TQC-13
**Success Criteria** (what must be TRUE):

  1. User can start a solo battle (player-initiated `/sanguo battle` or encounter-initiated) and see a turn-by-turn battle log that is seeded and replayable via `pure-rand`.
  2. User sees capture % before attempting; capture outcome matches displayed % (server-authoritative, crypto RNG); failed attempts are also recorded in the audit log.
  3. User captures a hero with 6 IV stats (0–31) rolled at capture — IVs persist and are visible in the collection.
  4. New user can choose 1 free starter hero during onboarding — the only faucet in the game.
  5. User can view the collection with `/sanguo heroes` — grouped by zone with emoji, tier, IV; `/sanguo map` scaffold shows current position.

**Plans**: TBD
**UI hint**: yes

### Phase 11: Progression, Chemistry & Economy Depth

**Goal**: Chiều sâu progression — dupe → hồn ngọc, evolution, shop + boss drops (items only), legion battle 3+9 với chemistry buffs; đóng vòng economy (net-sink/neutral).
**Depends on**: Phase 10
**Requirements**: TQC-14, TQC-15, TQC-16, TQC-17
**Success Criteria** (what must be TRUE):

  1. User can convert duplicate heroes to hồn ngọc (tier-scaled, diminishing returns, daily conversion cap) — hồn ngọc account-bound, never convertible to Linh thạch.
  2. User can evolve heroes at L20→t1 and L50→t2; t3 is schema-gated and unreachable in v3.
  3. User can buy support items from `/sanguo shop` and use them from the bag; boss thường drops items only, never money; every sink goes through `wallet.deductBalance`.
  4. User can field a legion of 3 mains + 9 buff heroes in legion battle; chemistry buffs (bonus-only, no penalty) apply per system/faction via `battleEngine` extension.
  5. Full collection filters (faction/zone/IV) available in `/sanguo heroes` for team building.

**Plans**: TBD
**UI hint**: yes

### Phase 12: Anti-Abuse, Monitoring & Marketplace Gating

**Goal**: Cứng hóa — bảo vệ economy khỏi automation abuse, giám sát telemetry, gating marketplace (không item nào marketable nếu chưa có conversion spec được review), và policy nhất quán.
**Depends on**: Phase 11
**Requirements**: TQC-18, TQC-19, TQC-20, TQC-21
**Success Criteria** (what must be TRUE):

  1. Bot-like patterns (velocity/exact-interval heuristics) trigger escalation captcha → soft-cap → review, reusing the existing farming-service captcha infra.
  2. Admins can run economy audit reports (Linh thạch per item per day) from Phase 2–3 telemetry — balance leaks are visible and attributable.
  3. No collection item can be listed or sold on the marketplace (instant-buy/sell bands, limit orders) without a reviewed conversion spec — gating enforced at the marketplace boundary.
  4. Automation policy is documented — stance on collection-game bots vs the paid farming service is explicit and applied consistently.

**Plans**: TBD

### Progress (Milestone v3)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Foundation, Economy Budget & Content Infrastructure | 4/4 | In Progress|  |
| 9. Travel & Encounters | 1/5 | In Progress|  |
| 10. Battle & Capture | 0/TBD | Not started | - |
| 11. Progression, Chemistry & Economy Depth | 0/TBD | Not started | - |
| 12. Anti-Abuse, Monitoring & Marketplace Gating | 0/TBD | Not started | - |

---

## Phase Details (v1.0)

[...rest of phase details...]
