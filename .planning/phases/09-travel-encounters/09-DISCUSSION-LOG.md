# Phase 9: Travel & Encounters - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 9-travel-encounters
**Areas discussed:** Charge & refund model, Travel UX & cost/time formula, Encounter roll design, Map structure & hero distribution

---

## Charge & Refund Model

| Option | Description | Selected |
|--------|-------------|----------|
| Deduct at departure | Atomic wallet deduct + state write | |
| Charge on arrival | Only charge on arrival; cancel free | |
| Split: deduct + partial refund | Refund unused portion on cancel | |
| — freeform | Trừ ngay khi nhấn khởi hành, không cho phép cancel | ✓ |

**User's choice:** Deduct at departure, no cancel — but then the whole model inverted: travel became **time-only, no Linh thạch at all** (encounter + capture are where money is spent).
**Notes:** User's core argument for removing cancel: "khi cancel thì nếu bắt đầu một hành trình mới thì điểm bắt đầu sẽ tính trên node nào khi ở giữa hành trình?" — ambiguous start node. Confirmed "Bỏ cancel (sửa SC2)".

| Option | Description | Selected |
|--------|-------------|----------|
| Phí khi roll thành công | Pay to approach a successful roll | |
| Phí mỗi lần roll | Pay to activate every roll | |
| Encounter free, tốn khi bắt | Pokemon Go style: free encounter, pay to capture | ✓ |

**User's choice:** Encounter free, capture fee per attempt.
**Notes:** "chỉ khi encounter và thực hiện bắt tướng thì mới tốn linh thạch thôi". This inverts the milestone-init "paid travel = main sink" decision → **economy budget doc needs re-sign-off (D-18)**.

| Option | Description | Selected |
|--------|-------------|----------|
| Tự heal — đến trễ | Tick resolves overdue journeys next sweep | ✓ |
| Failed sau X phút | Mark failed, free the player | |
| Không cần — resolve tự nhiên | Tick resolves whenever it scans | |

**User's choice:** Tự heal — đến trễ.
**Notes:** Time-only model → no refund path exists structurally; tick self-heals with FOR UPDATE SKIP LOCKED.

| Option | Description | Selected |
|--------|-------------|----------|
| Tỉ lệ khoảng cách | Time scales with distance, in map data | ✓ |
| Cố định mỗi chặng | Fixed per-hop time | |
| Nhanh — vài chục giây | Fast hops | |

**User's choice:** Tỉ lệ khoảng cách.

---

## Travel UX & Cost/Time Formula

| Option | Description | Selected |
|--------|-------------|----------|
| Tọa độ (x,y) | Coordinates on map_nodes | |
| nodeOrder diff | Linear map, nodeOrder arithmetic | |
| Bảng edges | map_edges (node_a, node_b, travel_seconds) | ✓ |

**User's choice:** Bảng edges — graph-based map.
**Notes:** Combined with destination selection: "không phải node nào cũng nối với nhau, research sẽ kiểm tra bản đồ thực tế" — adjacency only, routes research-defined.

| Option | Description | Selected |
|--------|-------------|----------|
| Một chặng mỗi lần | One hop A→B per travel | ✓ |
| Tuyến nhiều chặng | Multi-hop path | |
| 1 chặng + tiếp tục nhanh | Hop + quick continue | |

**User's choice:** Một chặng mỗi lần.

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ cap encounter | Cap is the only brake | |
| Cooldown khởi hành | Departure cooldown | |
| Chỉ đi từ node hiện tại | Natural adjacency constraint | |
| — freeform | Clock pauses during encounter; cannot travel until arrival | ✓ |

**User's choice:** Freeform — travel starts, clock counts distance time, **pauses on encounter**, resumes when encounter resolved; cannot start a new journey mid-flight.

| Option | Description | Selected |
|--------|-------------|----------|
| Remaining seconds | travel_seconds_remaining decrements | ✓ |
| ArriveAt + pause offset | Absolute timestamp + pause offset | |
| Không pause | Encounter runs parallel, no clock pause | |

**User's choice:** Remaining seconds.

| Option | Description | Selected |
|--------|-------------|----------|
| Embed tĩnh trạng thái | Static status embed | |
| Embed live countdown | Live countdown embed | |
| Chỉ notify sự kiện | Event notifications only | ✓ |

**User's choice:** Chỉ notify sự kiện (arrival + encounter DMs).

---

## Encounter Roll Design

| Option | Description | Selected |
|--------|-------------|----------|
| Roll định kỳ trong travel | Periodic rolls while traveling | ✓ |
| 1 roll mỗi chặng | One roll per hop | |
| Roll khi đến nơi | Roll on arrival | |

**User's choice:** Roll định kỳ trong travel.

| Option | Description | Selected |
|--------|-------------|----------|
| Xác suất mỗi tick | Probability per tick scan | ✓ |
| Cố định sau X phút | Deterministic after X counted minutes | |
| Chắc chắn 1/chặng | Guaranteed per hop | |

**User's choice:** Xác suất mỗi tick.

| Option | Description | Selected |
|--------|-------------|----------|
| 1 tick cho cả hai | One cron for arrivals + encounters | |
| 2 tick tách biệt | Two separate crons | ✓ |
| Roll qua trigger riêng | Trigger-based rolls, no cron | |

**User's choice:** 2 tick tách biệt (arrivals + encounters).

| Option | Description | Selected |
|--------|-------------|----------|
| DM riêng | Private DM only | |
| Kênh server | Server channel notification | |
| DM cả 2 loại | DM both encounter + arrival | ✓ |

**User's choice:** DM cả 2 loại.

| Option | Description | Selected |
|--------|-------------|----------|
| Skip encounter khi cap | Rolls skipped, travel continues | ✓ |
| Chặn cả travel | Travel blocked at cap | |
| Cap chỉ capture | Cap only limits capture | |

**User's choice:** Skip encounter khi cap.

| Option | Description | Selected |
|--------|-------------|----------|
| Roll riêng xác suất thấp | Separate low-prob roll (~5-10%) | ✓ |
| Boss ở node đặc biệt | Boss at special nodes | |
| Hoãn boss v1 | Defer boss entirely | |

**User's choice:** Roll riêng xác suất thấp.
**Notes (boss scope):** Confirmed Phase 9 only rolls + notifies + records boss encounters; battle/capture/đội hình are Phase 10-11.

---

## Map Structure & Hero Distribution

| Option | Description | Selected |
|--------|-------------|----------|
| 20-40 node | Moderate map | |
| 50+ node | Large map | ✓ |
| ~10-15 node gọn | Small start | |
| — freeform | Includes regions outside China (Korea, Cổ Việt, steppe) | ✓ |

**User's choice:** 50+ nodes covering the wider Three Kingdoms world (Triều Tiên, Cổ Việt/Giao Châu, du mục vùng), matching the 132-hero roster with foreign rulers.

| Option | Description | Selected |
|--------|-------------|----------|
| 1 zone duy nhất | Each hero in one zone | |
| Nhiều zone | Hero in multiple zones | |
| Vùng + độ hiếm | Zone + rarity tiers | |
| — freeform | Nhiều zone với tỷ lệ khác nhau | ✓ |

**User's choice:** Many-to-many hero↔zone with per-pair rates (research-set, not tier-derived).

| Option | Description | Selected |
|--------|-------------|----------|
| Theo tier/độ hiếm | Rarity-based rates | |
| Tỉ lệ research tự định | Research decides numbers | ✓ |
| Đồng đều theo vùng | Uniform per zone | |

**User's choice:** Tỉ lệ research tự định.

| Option | Description | Selected |
|--------|-------------|----------|
| Research trong Phase 9 | Researcher in this phase | ✓ |
| Sub-phase research riêng | Separate research phase | |
| Seed trước, refine sau | Seed first, refine later | |

**User's choice:** Research trong Phase 9, user reviews data before implementation.

| Option | Description | Selected |
|--------|-------------|----------|
| Mở rộng từ hiện có | Extend 7 placeholder zones | |
| Research thiết kế lại | Research redesigns zone set | ✓ |
| 13 châu Đông Hán | Fixed historical 13 châu | |

**User's choice:** Research thiết kế lại toàn bộ zone set.

| Option | Description | Selected |
|--------|-------------|----------|
| Thay thế node data | Replace 7 placeholder nodes with research data | ✓ |
| Mở rộng, giữ node cũ | Keep old nodes, add new | |
| Reseed sạch | Clean reseed | |

**User's choice:** Thay thế node data (migration + reseed; hero seed stays).

| Option | Description | Selected |
|--------|-------------|----------|
| Pool điểm đến | Roll uses destination pool | |
| Pool điểm đi | Roll uses origin pool | |
| Trộn cả 2 | Blend both | |
| — freeform | Position-adjusted blend: near A → A-heavy, near B → B-heavy | ✓ |

**User's choice:** Position-blended pool. Position = remaining-time fraction of hop (pause-exempt). **Formula locked** ("dựa trên thời gian còn lại để đến B / tổng thời gian của chặng").

---

## the agent's Discretion

- Exact tick schedules (arrivals every minute; encounter interval ~30-60s).
- ~20/hr cap window mechanics (sliding vs fixed hour).
- `encounter_runs` boss flag/type shape.
- `hero_zone_rates` schema granularity (per-node vs per-zone).
- `player_travel_state` field adaptation details for remaining-seconds.
- Position update granularity in the tick.
- DM embed content/layout.

## Deferred Ideas

- Capture fee mechanics + per-attempt pricing → Phase 10 (TQC-11); economy re-sign-off flagged (D-18).
- Boss thường data/đội hình/troop composition → Phase 10-11.
- Quân đoàn battle 3+9 chemistry → Phase 11 (TQC-17).
- Economy budget re-sign-off numbers → before Phase 10 content.
- Anti-abuse bot detection → Phase 12 (TQC-18).
