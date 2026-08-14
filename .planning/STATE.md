---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Tam Quốc Collection
current_phase: 11
current_phase_name: progression-chemistry-economy-depth
status: executing
stopped_at: Completed 11-01-PLAN.md (economy amendment + migration 0020)
last_updated: "2026-08-14T08:10:22.747Z"
last_activity: 2026-08-14
last_activity_desc: Phase 10 complete (deployed + UAT 43/43), transitioned to Phase 11
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 24
  completed_plans: 18
---

# State: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-14)

**Core value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.
**Current focus:** Phase 11 — progression-chemistry-economy-depth

## Current Position

Phase: 11 (progression-chemistry-economy-depth) — EXECUTING
Plan: 3 of 8
Status: Ready to execute
Last activity: 2026-08-14 — Phase 11 execution started

Progress: [████████████████████] 9/9 plans ([████████░░] 75%)

## Phase Registry (Milestone v3)

| # | Phase | Requirements | Status | Completed |
|---|-------|-------------|--------|-----------|
| 08 | Foundation, Economy Budget & Content Infrastructure | TQC-01..05 | ✅ COMPLETE | 2026-08-12 (deployed) |
| 09 | Travel & Encounters | TQC-06..09 | ✅ COMPLETE | 2026-08-13 (UAT 17/18 + 6 CR fixes) |
| 10 | Battle & Capture | TQC-10..13 | ✅ COMPLETE | 2026-08-14 (deployed + UAT 43/43) |
| 11 | Progression, Chemistry & Economy Depth | TQC-14..17 | ░░ Not started | - |
| 12 | Anti-Abuse, Monitoring & Marketplace Gating | TQC-18..21 | ░░ Not started | - |

**Total v3 requirements:** 21/21 mapped ✓

## Performance Metrics (v3)

| Metric | Value |
|--------|-------|
| Phases total | 5 |
| Phases complete | 2 |
| Requirements total | 21 |
| Requirements delivered | 9 (TQC-01..09) |
| Plans created | 9 |
| Plans complete | 9 |

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
| **Travel = PULL-based check-in (D-22..D-28)** — không cron, không REST DM; kết quả (status/encounter/arrival) trả inline khi user gọi `/sanguo travel` | Thay push model (sanguoTick crons D-11 + REST DM D-12); đơn giản hơn (no pgBoss registration), bền hơn (elapsed tự heal), chống bot tốt hơn (cần chủ động gọi lệnh); SUPERSEDES D-11/D-12 | Phase 9 redesign (2026-08-12) |
| **Encounter = 1 ROLL 35%/phút, DỪNG ngay encounter đầu tiên (D-24)**; pause bằng nút ack "Tiếp tục hành trình" (D-25); đích chọn bằng StringSelectMenu + Start button (D-26). **Mỗi phút counted đều trừ remaining — kể cả phút trúng encounter (D-28 amended, F4)**; hit dừng loop ngay, không roll/count phút sau cho tới khi ack | User quyết định: journey tính từng phút counted; không batch encounter; ack gate = Phase-10-ready cho battle/capture. D-28 wording "ONLY on failed rolls" amended 2026-08-12 (F4) để khớp ack-pin `updatedAt + k·60` | Phase 9 redesign (2026-08-12) |
| **Encounter supply = f(check-in cadence) ≤ 20/hr** — không phải continuous cron supply | `docs/economy-budget.md` re-baseline: capture-fee sink (Phase 10) phải price theo pull-driven supply | Phase 9 redesign (2026-08-12) |
| **Live-Discord CR-09-01→06 (2026-08-13):** select+button tách riêng ActionRow (COMPONENT_LAYOUT_WIDTH_EXCEEDED); emoji qua `option.setEmoji` không label; `components: []` trên mọi editReply (PATCH merge giữ component cũ); ack edit sang ack-confirm embed; travel embed title theo state (confirm/started/status); bỏ duplicate deferReply | Live UAT trên production phát hiện 6 lỗi Discord-client mà unit tests không bắt được (layout width, PATCH merge semantics, emoji markup trong label, component stale). Tất cả fixed + regression-tested | Phase 9 UAT (2026-08-13) |
| **Boss GOLD encounter variant = UI-SPEC GOLD 0xF59E0B** (không phải 0x9E0B) | Live UAT test 4 xác nhận SEASON/GOLD contract; boss rate 0.07 nên variant GOLD không render được live — covered bởi automated tests | Phase 9 UAT (2026-08-13) |

### Pending Todos / Blockers

- [x] Resolve charge-on-arrival vs deduct-at-departure conflict (research gap) — ✅ RESOLVED 2026-08-12 (Phase 9 D-01): travel is TIME-ONLY — no charge model exists (no cost, no deduct-at-departure, no charge-on-arrival); no cancel/refund path (D-03/D-04).
- [x] Emoji rendering deployment smoke-test (application-owned emoji) — ✅ DONE 2026-08-12: `<a:name:id>` animated-prefix fix, /sanguo map render confirmed live
- [ ] **Phase 10 capture-fee re-sign (D-18)** — `docs/economy-budget.md` flags: capture fee (D-02) MUST be priced + re-signed assuming pull-driven encounter supply (≤20/hr) before Phase 10 content ships
- [ ] Economy budget numbers cần tu vi caps + VWAP band values hiện tại — Phase 8
- [ ] Research-phase khả năng cao: Phase 12 (bot detection vs farming captcha infra), Phase 11 (pacing balance + chemistry values)

## Session Continuity

**Resume file:** None

Last session: 2026-08-14T07:47:29.896Z
Stopped at: Completed 11-01-PLAN.md (economy amendment + migration 0020)
Resume: `/gsd-plan-phase 11` (next: Progression, Chemistry & Economy Depth)

---

*State updated for v3: 2026-08-10*

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 08-foundation-economy-budget-content-infrastructure P1 | 32min | 3 tasks | 20 files |
| Phase 08-foundation-economy-budget-content-infrastructure P2 | 18min | 3 tasks | 10 files |
| Phase 08-foundation-economy-budget-content-infrastructure P3 | 18min | 2 tasks | 1 files |
| Phase 08 P4 | 82min | 6 tasks | 16 files |
| Phase 10-battle-capture P01 | 20min | 2 tasks | 4 files |
| Phase 10-battle-capture P02 | 18min | 2 tasks | 10 files |
| Phase 10-battle-capture P03 | 6 | 3 tasks | 3 files |
| Phase 10-battle-capture P04 | 21 min | 2 tasks | 2 files |
| Phase 10-battle-capture P05 | 22min | 3 tasks | 5 files |
| Phase 10-battle-capture P06 | 25min | 2 tasks | 13 files |
| Phase 10-battle-capture P07 | 41min | 3 tasks | 15 files |
| Phase 11-progression-chemistry-economy-depth P11-01 | 26min | 2 tasks | 13 files |

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260811-lld | Post-gate Phase 8 schema redesign — IV rename, flat factions, role/class/family (bloodline table), spouse relations, formations schema, Tavily classifications, reseed | 2026-08-11 | 0a069c7 | [260811-lld](./quick/260811-lld-post-gate-phase-8-schema-redesign-locked/) |
| 260812-j7r | Phase 9 pull-based travel check-in redesign (D-22..D-28): rewrite CONTEXT/UI-SPEC/RESEARCH/PATTERNS + plans 01/03/04, fix 02/05 — no cron, no REST DM, select menu + ack button | 2026-08-12 | 9fe8f31 | [260812-j7r](./quick/260812-j7r-phase-9-pull-based-travel-check-in-redes/) |
| 260812-k9m | Phase 9 plan fixes F1..F8 (context7/tavily-verified review): F1 Start-button destination in customId, F2 encounterPending payload + encounter_runs index, F3 startTravel FOR UPDATE, F4 D-28 hit-minute wording, F5 sub-minute remainder assumption, F6 zero-adjacent no_route, F7 cap-key TTL, F8 Number(rate) | 2026-08-12 | d775caa | [260812-k9m](./quick/260812-k9m-phase-9-plan-fixes/) |
| 260813-p10 | Phase 10 plan fixes F1..F9 (sequential-thinking + context7/tavily review): F1/F2 starter heroIds truong_giac/dong_trac (not zhang_jue/dong_zhuo), F3 seed bigint mode 'number', F4 abandoned-capture → capture-view routing on encounterPending, F5 crypto.randomInt(2**48), F6 10-05 depends_on 10-04, F7 lock user_sanguo_state FOR UPDATE, F8 economy re-sign effective chances + gross bound, F9 /sanguo hero duplicate disambiguation | 2026-08-13 | - | [260813-p10](./quick/260813-p10-phase-10-plan-fixes/) |

## Decisions

- [Phase ?]: ESLint emoji rule uses ESLintUtils.RuleCreator (v8.66.0 actual API) scoped to src/commands + src/ui (emoji-rendering surface, D-15) — createRule does not exist in installed version; blanket src/** scope would flag pre-existing OWO_BOT_ID
- [Phase ?]: heroId optional in SanguoMapEmbedData.zones - null representative_hero_id renders label-only zone entry (D-07) — Plan interface said heroId: string but must-have truth requires label-only rendering for null zone markers
- [Phase 08]: Tx type derived as Parameters<Parameters<typeof db.transaction>[0]>[0] - plan literal PgTransaction<typeof schema, 'basic'> misorders drizzle 0.45.2 generics (TQueryResult first) — Derived type is exactly what the transaction callback receives; compiles on installed drizzle version
- [Phase 08]: Edit wager flow writes two ledger rows (bet_refund + bet_wager) - ledger stays reconcilable on edits per SC1 — Research option chosen over single net row; matches plan action text
- [Phase 08]: Economy design gate PASSED (2026-08-11): D-19 net-sink/neutral is a hard constraint, expected net linh thach/hour of optimal sanguo loop <= 0 (trivially below DAILY_CAP 10_000 tu-vi cap SC5), convertibility matrix accepted — gates Phases 9-11 content (TQC-05/D-18) — SC5 design-sanity check; any future rebalancing requires a new sign-off (D-18 one-way gate)
- [Phase 08]: Migration 0004 (empty since 'fix migration missing 0004') restored to ADD COLUMN dk_event_id varchar(20) — proven from 0004 snapshot diff (0003->0004 added only that column); 0006 drops it, so a fresh-DB chain was un-appliable until restored (Rule 3) — Fresh local dev DB needed the full 0000-0014 chain; without 0004 the chain failed at 0006 with column does not exist
- [Phase 08]: ZH-CN hero names researched via Tavily (kongming.net hanzi index primary + targeted corrections): 109 from kongming simplified column, 23 corrected mis-picks (sun_jian 孙坚, liu_yao 刘繇, liu_yan 刘焉, ly_ung 李膺, zhang_miao 张邈, gongsun_du 公孙度...), 23 non-kongming figures researched individually (foreign chiefs, emperors, Korean kings) — D-06 names never agent-guessed — Kongming first-match mis-picks variant-spelling figures; accuracy spot-check (10-hero sample) zero unresolved mismatches after correction
- [Phase 10-battle-capture]: Seeded replayable battle engine: runBattle(seed, input) is a pure synchronous function (D-06); ONE mutable xoroshiro128plus rng threaded via uniformFloat64; full D-05 formula locked by tests
- [Phase 10-battle-capture]: BATTLE_CONFIG A9 drafts exported (ROUND_CAP 20, HIT_BASE 0.85/AGI_FACTOR 0.003, CRIT_BASE 0.05/AGI_FACTOR 0.001) for the 10-04 balance pass to re-sanitize against the seeded AGI spread
- [Phase 10-battle-capture]: ﻿capture_attempts.fee uses bigint { mode: 'bigint' } — drizzle 0.45.2 rejects mode-less bigint at typecheck; mode 'bigint' matches users.balance currency discipline
- [Phase 10-battle-capture]: ﻿Migration 0019 verified with an information_schema probe spanning ALL tables, not just heroes — the plan's literal one-liner only queried heroes columns + table names, so it could never see cross-table columns (hp_current, captured_zone, seed, input, result, pity_count); the corrected probe confirms every artifact live
- [Phase 10-battle-capture]: D-20 capture-fee contract signed (user adopt-a1, F8-adjusted): CAPTURE_TIERS 5/15/40/100/250 bigint x multipliers 1.0/1.5/2.0/3.0/5.0, tiers 4-5 item-gated; rebalancing needs a new sign-off (D-18 one-way gate)
- [Phase 10-battle-capture]: F8 gross-bound adjustment: A1 draft fees (10/30/80/200/500) breached ~416/hr at realistic cadence under effective chances (~788/hr at 10 encounters/hr) — fees halved to 5/15/40/100/250, all ratios/multipliers/rates preserved
- [Phase 10-battle-capture]: E[net/hour] priced with effective chances (attempts = 1/(base x hpFactor x tierMult), incl. flee): E[inflow]=0 -> E[net] < 0 satisfies D-19 at all cadences; gross 75-394/hr at realistic 5-10/hr < ~416/hr; theoretical 20/hr corner documented as supply-ceiling non-issue
- [Phase 10-battle-capture]: A2 template generation adopted: per-class stat templates + prominence (rarity) modifiers + deterministic FNV-1a hash jitter; no per-hero research round (RESEARCH OQ2 default)
- [Phase 10-battle-capture]: Rarity binned to signed D-20 distribution at exactly 79/33/13/5/2 for 132 (per-bin deviation <=0.7, within +/-2 tolerance)
- [Phase 10-battle-capture]: Public tier = rarity + hash jitter (-1/0/+1) clamped 1-5 — independent of hidden rarity, never derived at render time (D-12)
- [Phase 10-battle-capture]: captureChance pity term is pity x PITY_INCREMENT (5pp per failure), not the raw count - the plan's literal '+ pity' would add +1.0 per failure; Task-3 contract (chance2 - chance1 === PITY_INCREMENT) pins the D-11 scaling — Rule 1 fix cc8fe40 - the D-11 bad-luck protection is +5pp per failed attempt, scaled by the failure count
- [Phase 10-battle-capture]: Boss capture guarded with BOSS_CAPTURE_UNAVAILABLE pre-fee: encounter_runs.hero_id NULL for bosses (A3) + user_heroes.hero_id NOT NULL -> no heroes row for a captured boss; the literal insert would crash mid-tx. D-13 boss-capture mapping deferred (WINDOWS.md #5) — Rule 1 fix in 3b70abe - correctness: fail cleanly before charging
- [Phase 10-battle-capture]: Capture-view % = tier-1 chance at render (captureChance, multiplier 1); the attempt recomputes the exact chance inside its tx — small render/press drift possible (flagged assumption, Pitfall 2)
- [Phase 10-battle-capture]: Battle log renders the LAST <=20 turn entries (engine emits up to 40 actions) — honors D-07 '<=20 lines <= ~1,700 chars' budget while keeping the decisive ending
- [Phase 10-battle-capture]: SanguoBattleLogEmbedData adds optional playerHeroId/enemyHeroId so round-log heroId strings map to per-locale names (pinned interface lacked the ids; enemy id = distinct non-player id in roundLogs)
- [Phase 10-battle-capture]: renderCaptureView lives in the command layer (plan sanctioned either location; captureService.ts outside plan scope) — shared by handleCaptureOpen/retry + travel.ts F4 abandoned-capture routing
- [Phase 10-battle-capture]: The starter grant is FREE and the ONLY faucet (D-19): handleStarterPick contains no wallet import/call (grep == 0 + wallet-mock assertion); zero deductBalance across the collection/starter/hero surfaces — D-19 one-way gate; free faucet locked
- [Phase 10-battle-capture]: Collection stars come from the PUBLIC heroes.tier and grade from iv_grade.* keys; embed data interfaces carry gradeKey + stars ONLY — D-12 never-render enforced structurally (no IV/rarity field can reach the render path) — D-12 hard rule held by construction, not convention
- [Phase 10-battle-capture]: heroes.empty_filtered + hero.field_stars/field_grade/field_hp_mp added as i18n keys (all 3 locales, check-i18n parity): the flagged filtered-empty assumption needs an empty-hint line (never the starter picker) and the fixed-field detail embed needs field NAMES — neither was in the pinned UI-SPEC set — Additive keys required by the plan's own flagged assumptions
- [Phase ?]: adopt-a5 (user checkpoint decision 2026-08-14): research prices/drop-weights adopted as-is — heal_pill 50, booster_x2 100, formations 200/300/500; boss drops 70/25/4.9/0.1; superseded 'Linh thach -> evolution' row replaced by 'Linh thach -> hon ngoc: only via booster (bounded, one-way)'
