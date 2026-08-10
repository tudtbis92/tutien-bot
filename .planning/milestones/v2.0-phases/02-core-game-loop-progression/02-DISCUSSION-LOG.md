# Phase 2: Core Game Loop + Progression - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 02-core-game-loop-progression
**Areas discussed:** Tu vi rates & accumulation, Anti-farming pipeline, Realm structure & progression, Breakthrough mechanics, Currency, Profession & crafting model

---

## Tu Vi Rates & Accumulation

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed global values | message=10, voice=5/min, reaction=2. Daily cap=10,000. Multipliers per spiritual root. Hidden from players. | ✓ |
| Per-guild configurable | Admin can set per-guild tu vi rates via config command | |
| Hardcoded but tuneable | Constants in config file, no admin UI | |

**User's choice:** Fixed global values, hidden from players

| Option | Description | Selected |
|--------|-------------|----------|
| Low & grindy (message=10, voice=5/min, reaction=2, cap=10,000) | Long progression feel | ✓ |
| Medium (message=25, voice=10/min, reaction=5, cap=20,000) | Moderate pace | |
| High (message=50, voice=20/min, reaction=10, cap=50,000) | Fast progression | |
| Agent's discretion | Starting constants easy to tune | |

**User's choice:** Low & grindy feel — message=10, voice=5/min, reaction=2, daily cap=10,000

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden completely | Spiritual root is hidden flavor, just affects numbers | |
| Show root name, hide multiplier | Profile shows name (e.g. "Kim Cương") but no percentage | ✓ |
| Show full affinity details | Profile shows multiplier breakdown | |

**User's choice:** Show root name, hide multiplier

---

## Anti-Farming Pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Two-tier: Redis fast-path + DB-backed worker | Event → Redis check → pg-boss enqueue → return. Worker handles DB layer. | ✓ |
| DB-only, synchronous | Every event hits DB directly | |
| Redis-only | Fast but not restart-safe | |

**User's choice:** Two-tier: Redis fast-path + DB-backed worker (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| pg-boss, concurrency 1 | Serial processing, no race conditions on daily cap | ✓ |
| pg-boss, concurrency N | Higher throughput, requires careful locking | |
| No queue — direct async DB write | Simpler but blocks event processing | |

**User's choice:** pg-boss, concurrency 1

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential — all 5 layers | Redis → DB cooldown verify → quality gate → daily cap atomic → voice check | ✓ |
| Core 3 layers for v1 | Skip quality gate and anomaly detection for now | |
| Parallel checks | Promise.all, skip if all fail | |

**User's choice:** Sequential in worker — all 5 layers (Recommended)

---

## Realm Structure & Progression

| Option | Description | Selected |
|--------|-------------|----------|
| 5 major realms, 21 total tiers | Classic xianxia, manageable | |
| 6 major realms, 31 total tiers | Longer progression | |
| Custom — user defined | Full custom realm tree | ✓ |
| Agent's discretion | Agent designs | |

**User's choice:** Custom — Luyện Khí (9), Trúc Cơ, Kim Đan, Nguyên Anh, Hóa Thần, Luyện Hư, Vấn Đỉnh, Đại Thừa, Bán Tiên, Địa Tiên, Chân Tiên (3 each) = 42 total tiers

**Tier naming clarification:** Luyện Khí uses Tầng Một–Chín; all other realms use Sơ Kỳ / Trung Kỳ / Hậu Kỳ

| Option | Description | Selected |
|--------|-------------|----------|
| Agent designs threshold curve | Exponential anchored to 10,000/day cap | ✓ |
| Specify time-to-advance targets | Work backwards from targets | |
| Define thresholds manually | User provides each value | |

**User's choice:** Agent designs threshold curve

| Option | Description | Selected |
|--------|-------------|----------|
| realm_id int in characters, metadata in config | Stable integer ID, display from i18n | ✓ |
| realms table in DB | Data-driven, fully in DB | |
| realm_id as enum string | Enum stored in characters table | |

**User's choice:** realm_id int in characters, metadata in config

| Option | Description | Selected |
|--------|-------------|----------|
| Full 42-tier tree from Season 1 | No gating, upper realms are aspirational | ✓ |
| Season 1 caps at Kim Đan | 15 tiers exposed, rest locked | |
| Season 1 caps at Nguyên Anh | 18 tiers | |

**User's choice:** Full 42-tier tree from Season 1

---

## Breakthrough Mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Major realm transitions only | Tier-within-realm always safe | ✓ |
| All tiers have failure chance | Small risk on every tier | |
| Only high realms (Luyện Hư+) | Easy for new players | |

**User's choice:** Major realm transitions have failure chance

| Option | Description | Selected |
|--------|-------------|----------|
| ROADMAP-suggested probability table | Luyện Khí→Trúc Cơ 0%, Trúc Cơ→Kim Đan 20%, Kim Đan→Nguyên Anh 40%, Nguyên Anh→Hóa Thần 60%, Hóa Thần→Luyện Hư 70%, higher 80%+ | ✓ |
| Flat 30% for all | Simple uniform fail rate | |
| Custom probability table | User defines each | |

**User's choice:** Use ROADMAP-suggested probability table

| Option | Description | Selected |
|--------|-------------|----------|
| Lose 50% of excess tu vi on fail | Painful but not devastating | ✓ |
| Lose 10% of total tu vi | Fixed percentage | |
| No tu vi loss, retry cooldown only | Soft failure | |
| Tu vi loss + retry cooldown | Both penalties | |

**User's choice:** Lose 50% of excess tu vi on fail

| Option | Description | Selected |
|--------|-------------|----------|
| No retry cooldown | Must naturally regain tu vi | ✓ |
| 24h retry cooldown | Time-gated | |
| Agent's discretion | Agent decides | |

**User's choice:** No retry cooldown — just need to regain tu vi

---

## Currency: Single vs Two-Tier

| Option | Description | Selected |
|--------|-------------|----------|
| Single currency for v1 | Existing users.balance BIGINT, MONET stays v2 | ✓ |
| Two-tier schema now | Add earned/purchased columns now | |
| Full two-tier system in Phase 2 | Implement monetization logic now | |

**User's choice:** Single currency for v1 (Recommended)

---

## Profession & Crafting Model

| Option | Description | Selected |
|--------|-------------|----------|
| All professions available, skill points shared | No locking, any character can invest in any prof | ✓ |
| 2 professions per character | Primary + secondary | |
| One profession per character, locked at /start | Permanent specialization | |

**User's choice:** All professions available, skill points shared

**Profession list defined by user (10 professions):**
1. Luyện Đan
2. Luyện Khí
3. Trận Pháp
4. Linh Trù
5. Luyện Cổ
6. Dược Sư (trồng, chăm sóc dược điền)
7. Thuần Thú
8. Luyện Kim (tinh chế vật liệu luyện khí)
9. Khai Linh
10. Thuật Sư (đoán mệnh, bói quẻ)

| Option | Description | Selected |
|--------|-------------|----------|
| 1 point per tier advanced, no respec | Lifetime points = realm_id | ✓ |
| Profession XP separate from realm tiers | Independent leveling | |
| Agent's discretion | Agent designs economy | |

**User's choice:** 1 point per tier advanced, no respec

| Option | Description | Selected |
|--------|-------------|----------|
| items + character_items + recipes + recipe_ingredients | Normalized tables, Phase 3 ready | ✓ (plus unique items) |
| JSONB inventory on characters | Quick but hard to query | |
| Agent's discretion | Agent designs | |

**User's choice:** Normalized tables PLUS unique item system

**Unique item clarification (user-specified):**
- Players can sometimes craft unique items with random attributes
- Player can set custom name + emoji
- Shows created_by and created_at
- base_price = 0 for unique items
- Each profession produces its own item archetypes with unique attribute pools

| Option | Description | Selected |
|--------|-------------|----------|
| Extend items table with unique item columns | is_unique, creator_character_id, custom_name, custom_emoji, attributes JSONB | ✓ |
| Separate unique_items table | Separate table linked from character_items | |
| Agent's discretion | Agent designs schema | |

**User's choice:** Extend items table with unique item columns (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Chance scales with profession level, attribute pool per type | Low level = low %, scales up | ✓ |
| Fixed 5% chance, global attribute pool | Simple | |
| Agent's discretion | Agent designs mechanics | |

**User's choice:** Chance scales with profession level, attribute pool per type

| Option | Description | Selected |
|--------|-------------|----------|
| Agent designs per-profession item archetypes | Agent defines each profession's item types and attribute pools in constants | ✓ |
| Define per-profession items manually | User provides full design now | |
| Generic materials for v1 | Differentiate in v2 | |

**User's choice:** Agent designs per-profession item archetypes (Recommended)

---

## Agent's Discretion

- Tu vi threshold curve for all 42 tiers
- Exact failure probabilities for Luyện Hư→Chân Tiên range
- Per-profession unique item archetypes and attribute pools
- Unique item trigger probability curve
- Gathering yield formula
- DB structure for activity cooldowns
- `/profile` embed layout
- Daily streak bonus amount and logic
- Spiritual root assignment algorithm at `/start`

## Deferred Ideas

- Respec mechanic — noted as v2 potential paid feature
- Achievement/broadcast system — SOCIAL-02, v2 scope
- Guild/môn phái — v2, out of scope per REQUIREMENTS.md
- Per-guild tu vi rate overrides — considered, deferred to v2
