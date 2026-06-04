# Roadmap: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Granularity:** Coarse  
**Coverage:** 48/48 v1 requirements mapped ✓  
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

### Phase 6: Farming Logic & Captcha Handling
**Goal:** Implement các tính năng farm (hunt, battle) tự động bằng `discord.js-selfbot-v13` và hệ thống detect/alert captcha.  
**Requirements:** FARM-03, FARM-04, FARM-07

### Phase 7: Monetization & Subscription Commands
**Goal:** User flow cho việc mua/thuê gói dịch vụ bằng Linh Thạch, nạp VIP và các slash commands để quản lý self-bot cá nhân.  
**Requirements:** FARM-02, FARM-05, MONET-01, MONET-04

---

## Phase Details (v1.0)

[...rest of phase details...]
