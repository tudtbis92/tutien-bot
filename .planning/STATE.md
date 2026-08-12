---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Tam Quốc Collection
current_phase: 08
current_phase_name: foundation-economy-budget-content-infrastructure
status: completed
stopped_at: Phase 9 UI-SPEC approved
last_updated: "2026-08-12T06:11:37.061Z"
last_activity: 2026-08-12
last_activity_desc: Phase 08 verification + production deploy completed (UAT 2/3 pass, emoji animated-prefix fix, /sanguo map emoji render confirmed)
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 9
  completed_plans: 4
---

# State: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-10)

**Core value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.
**Current focus:** Phase 08 — foundation-economy-budget-content-infrastructure

## Current Position

Phase: 08 (foundation-economy-budget-content-infrastructure) — ✅ COMPLETE
Plan: 4 of 4
Status: Deployed to production (2026-08-12) — UAT #1/#1b/#2 pass, emoji render confirmed live
Last activity: 2026-08-12 - Production deploy + verification: migrations 0014-0017, seed sanguo (132 heroes/7 nodes/3 items/14 factions/12 families/2 relations), emoji animated-prefix fix (`<a:name:id>`), zone markers → message content `# ` headers

Progress: [██████████] 100%

## Phase Registry (Milestone v3)

| # | Phase | Requirements | Status | Completed |
|---|-------|-------------|--------|-----------|
| 08 | Foundation, Economy Budget & Content Infrastructure | TQC-01..05 | ✅ COMPLETE | 2026-08-12 (deployed) |
| 09 | Travel & Encounters | TQC-06..09 | ░░ Not started | - |
| 10 | Battle & Capture | TQC-10..13 | ░░ Not started | - |
| 11 | Progression, Chemistry & Economy Depth | TQC-14..17 | ░░ Not started | - |
| 12 | Anti-Abuse, Monitoring & Marketplace Gating | TQC-18..21 | ░░ Not started | - |

**Total v3 requirements:** 21/21 mapped ✓

## Performance Metrics (v3)

| Metric | Value |
|--------|-------|
| Phases total | 5 |
| Phases complete | 1 |
| Requirements total | 21 |
| Requirements delivered | 5 (TQC-01..05) |
| Plans created | 4 |
| Plans complete | 4 |

## Accumulated Context (v3)

### Milestone v3 Decisions / Design Gates

| Decision | Rationale | Phase |
|----------|-----------|-------|
| Encounters từ paid travel, không từ chat activity | Linh thạch là sink chính + chống bot tự nhiên (khác Pokétwo/Mudae) | Milestone Init |
| `crypto.randomInt()` cho mọi roll player-facing; pure-rand chỉ cho battle replay/test | Predictable PRNG phá vỡ fairness + economy | Milestone Init |
| Economy design-gate trước content (TQC-05) | Chặn faucet → marketplace arbitrage (Linh thạch printing press) | Phase 8 |
| Soul gems account-bound, không convert Linh thạch | Ngăn dupe loop sụp economy | Phase 11 |
| Boss drops items, never money | Faucet an toàn không chạm `users.balance` | Phase 11 |
| Chemistry 3 tầng: family > faction > role | EA FC-style: family = bond mạnh nhất (xuyên faction), faction = medium, role = weak | Phase 8 post-gate |
| Faction phẳng (bỏ phân cấp): Hán/Ngụy/Thục/Ngô + Thập Thường Thị/Khăn Vàng/Lương Châu + Nam Man/Ô Hoàn/Sơn Việt/Tiên Ti/Hung Nô... | Ngoại Tộc cũ bị thay bằng các thành phần top-level; chemistry faction = match phẳng | Phase 8 post-gate |
| IV 6 chỉ số đổi sang STR/AGI/INT/MOV/LEA/CHA | STR=vật lý atk+def, AGI=chính xác+né, INT=phép atk+def, MOV=thứ tự đánh, LEA=↑buff/↓debuff, CHA=↑hiệu ứng phe địch/↓bị hiệu ứng phe mình | Phase 8 post-gate |
| IV hạng theo % (sum/186): 100=Hoàng Kim, 90-99=Hồng ngọc, 80-89=Lam cấp, 60-79=Lục cấp, <60=Hôi cấp | Grade summary thay vì 6 số thô (PITFALLS.md:284); i18n keys | Phase 8 post-gate |
| `heroes.class` = vị trí đội hình, 8 class: vanguard/cavalry/archer/spellcaster/schemer/vu_co/thu_binh/cong_binh | Class định vị slot; chemistry do faction/role/family quyết định | Phase 8 post-gate |
| Trận hình mua được, không cố định; schema `formations`+`formation_slots`+`user_formations` thiết kế từ bây giờ | Mỗi trận hình phân bổ class/số lượng/vị trí khác nhau; logic mua/bán ở Phase 11 | Phase 8 post-gate |
| Role 9 loại: ruler/general/strategist/civil/royal/eunuch/religious/tribal/scholar | Thay 5 role cũ (royal/eunuch/military/civil/religious) | Phase 8 post-gate |
| `heroes.family` varchar NULL (~8-12 gia tộc: tôn/tào/hạ_hầu/viên/gia_cát/tư_mã/công_tôn/mã...) | Family = chemistry tier mạnh nhất, xuyên faction (Gia Cát Lượng Thục + Gia Cát Cẩn Ngô) | Phase 8 post-gate |
| Family = bảng reference `hero_families` theo DÒNG MÁU, không theo họ | Lưu là họ phổ biến thứ 4 (~70M), bị ban cho Hung Nô/du mục → nhiều gia tộc Lưu khác nhau; chemistry match exact family_id tránh bond giả (VD: Công Tôn Toản ≠ Công Tôn Độ — research xác nhận không họ hàng) | Phase 8 post-gate |
| Hoàng tộc Hán = `liu_hoang_toc` (9: 3 vua + Lưu Bị/Biểu/Yên/Diêu/Đại/Ngu); Hà thị = `ha_ngoai_thich` (3: Hà Tiến/Hà Hoàng Hậu/Hà Miêu); Trương Khăn Vàng = `zhang_khan_vang` (3 anh em) | Hai dòng máu khác nhau nối qua hôn nhân — KHÔNG gộp chung vua + ngoại thích | Phase 8 post-gate |
| Marriage bond = `hero_relations` (chỉ spouse trực tiếp, tier-1 ngang family); bỏ in_law | Chỉ vợ chồng trực tiếp có mặt trong roster (Hán Linh Đế ↔ Hà Hoàng Hậu/Vương Mỹ Nhân); in_law không seed vì đối tác (Mi phu nhân/Thái phu nhân) không trong roster | Phase 8 post-gate |
| Sanguo emoji đều animated → markup `<a:name:id>` | Verify live app: 1056/1056 GIF. `<:name:id>` render literal `:dtr_t0:` (user xác nhận lỗi). `heroEmoji()` + generator emit `a:` prefix (D-21) | Phase 8 verification |
| Zone markers → message CONTENT với `# ` (H1) header | Discord heading chỉ render trong content, KHÔNG trong embed field/description (discord-api-docs#7167). `# ` = H1 lớn nhất → emoji render to (D-22) | Phase 8 verification |

### Pending Todos / Blockers

- [ ] Resolve charge-on-arrival vs deduct-at-departure conflict (research gap) — Phase 9 planning; verification cần cancel/arrive/fail matrix test
- [x] Emoji rendering deployment smoke-test (application-owned emoji) — ✅ DONE 2026-08-12: `<a:name:id>` animated-prefix fix, /sanguo map render confirmed live
- [ ] Economy budget numbers cần tu vi caps + VWAP band values hiện tại — Phase 8
- [ ] Research-phase khả năng cao: Phase 12 (bot detection vs farming captcha infra), Phase 11 (pacing balance + chemistry values)

## Session Continuity

**Resume file:** E:\Saeth\tutien-bot\.planning\phases\09-travel-encounters\09-UI-SPEC.md

Last session: 2026-08-12T04:05:03.306Z
Stopped at: Phase 9 UI-SPEC approved
Resume: `/gsd-plan-phase 9` (next: Travel & Encounters)

---

*State updated for v3: 2026-08-10*

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 08-foundation-economy-budget-content-infrastructure P1 | 32min | 3 tasks | 20 files |
| Phase 08-foundation-economy-budget-content-infrastructure P2 | 18min | 3 tasks | 10 files |
| Phase 08-foundation-economy-budget-content-infrastructure P3 | 18min | 2 tasks | 1 files |
| Phase 08 P4 | 82min | 6 tasks | 16 files |

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260811-lld | Post-gate Phase 8 schema redesign — IV rename, flat factions, role/class/family (bloodline table), spouse relations, formations schema, Tavily classifications, reseed | 2026-08-11 | 0a069c7 | [260811-lld](./quick/260811-lld-post-gate-phase-8-schema-redesign-locked/) |

## Decisions

- [Phase ?]: ESLint emoji rule uses ESLintUtils.RuleCreator (v8.66.0 actual API) scoped to src/commands + src/ui (emoji-rendering surface, D-15) — createRule does not exist in installed version; blanket src/** scope would flag pre-existing OWO_BOT_ID
- [Phase ?]: heroId optional in SanguoMapEmbedData.zones - null representative_hero_id renders label-only zone entry (D-07) — Plan interface said heroId: string but must-have truth requires label-only rendering for null zone markers
- [Phase 08]: Tx type derived as Parameters<Parameters<typeof db.transaction>[0]>[0] - plan literal PgTransaction<typeof schema, 'basic'> misorders drizzle 0.45.2 generics (TQueryResult first) — Derived type is exactly what the transaction callback receives; compiles on installed drizzle version
- [Phase 08]: Edit wager flow writes two ledger rows (bet_refund + bet_wager) - ledger stays reconcilable on edits per SC1 — Research option chosen over single net row; matches plan action text
- [Phase 08]: Economy design gate PASSED (2026-08-11): D-19 net-sink/neutral is a hard constraint, expected net linh thach/hour of optimal sanguo loop <= 0 (trivially below DAILY_CAP 10_000 tu-vi cap SC5), convertibility matrix accepted — gates Phases 9-11 content (TQC-05/D-18) — SC5 design-sanity check; any future rebalancing requires a new sign-off (D-18 one-way gate)
- [Phase 08]: Migration 0004 (empty since 'fix migration missing 0004') restored to ADD COLUMN dk_event_id varchar(20) — proven from 0004 snapshot diff (0003->0004 added only that column); 0006 drops it, so a fresh-DB chain was un-appliable until restored (Rule 3) — Fresh local dev DB needed the full 0000-0014 chain; without 0004 the chain failed at 0006 with column does not exist
- [Phase 08]: ZH-CN hero names researched via Tavily (kongming.net hanzi index primary + targeted corrections): 109 from kongming simplified column, 23 corrected mis-picks (sun_jian 孙坚, liu_yao 刘繇, liu_yan 刘焉, ly_ung 李膺, zhang_miao 张邈, gongsun_du 公孙度...), 23 non-kongming figures researched individually (foreign chiefs, emperors, Korean kings) — D-06 names never agent-guessed — Kongming first-match mis-picks variant-spelling figures; accuracy spot-check (10-hero sample) zero unresolved mismatches after correction
