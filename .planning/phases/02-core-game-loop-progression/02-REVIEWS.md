---
phase: 2
reviewers: [gemini]
reviewed_at: 2026-04-12T09:06:15Z
plans_reviewed:
  - 02-01-PLAN.md
  - 02-02-PLAN.md
  - 02-03-PLAN.md
  - 02-04-PLAN.md
  - 02-05-PLAN.md
  - 02-06-PLAN.md
  - 02-07-PLAN.md
notes: >
  claude CLI not logged in (run `claude /login` to enable).
  codex CLI timed out during repo exploration phase before producing review.
  Review reflects Gemini's analysis only.
---

# Cross-AI Plan Review — Phase 2

## Gemini Review

### Summary

The implementation plans are exceptionally well-structured, demonstrating a "security-first" and "performance-first" mindset. The decision to ship anti-farming logic within the primary activity pipeline (Plan 02-02) is a critical success factor for a bot of this genre. The architecture leverages a modern stack (pg-boss for async processing, Redis for hot-path throttling, and Drizzle for type-safe persistence) to create a scalable foundation. The progression mechanics (realms, spiritual roots, and professions) are deeply integrated into the data model rather than being bolted on as afterthoughts.

### Strengths

- **Robust Anti-Farming:** The 5-layer guard (Redis → DB → Quality → Atomic Cap → Anomaly) is industry-standard for Discord-based economies.
- **Asynchronous Event Pipeline:** Using `pg-boss` to decouple Discord events from game logic ensures the bot remains responsive even during high-traffic spikes.
- **Atomic State Management:** Use of atomic SQL updates for `DAILY_CAP` and `db.transaction` for crafting prevents common race conditions and inventory duplication bugs.
- **Scalable Progression:** Tying profession points to `realmId` (lifetime tiers) provides a clean, non-grindy progression path that rewards overall advancement.
- **Hidden Multipliers:** Keeping exact multipliers out of `/profile` (Plan 02-03) preserves the "xianxia mystery" and reduces "optimal-play" toxicity.

### Concerns

| Severity | Concern | Description |
|:---------|:--------|:------------|
| **HIGH** | `ActivityWorker` Bottleneck | `localConcurrency: 1` on the `ActivityWorker` prevents race conditions on daily caps but creates a global sequential bottleneck. On a large bot with hundreds of messages per second, this will cause significant `pg-boss` queue lag. |
| **MEDIUM** | Item Table Bloat | Plan 02-07 creates a new `items` row for every "unique" craft. With a ~15% unique chance, this table will grow linearly and indefinitely. There is no mention of "Base Items" vs. "Item Instances." |
| **MEDIUM** | `guild_activity` Scaling | Using a composite PK `characterId + guildId` for every activity interaction means multi-guild users will generate significant row counts. Lack of a cleanup/pruning strategy for inactive guilds could lead to DB bloat. |
| **LOW** | Breakthrough "Click-Spam" | Plan 02-04 explicitly states "No retry cooldown." This allows players to macro the `/đột_phá` command until success if they have surplus Tu Vi, removing the "weight" of the failure penalty. |
| **LOW** | No Respec Policy | Plan 02-06 allows no respec for profession points. While thematic, it is highly punishing for new players who make "wrong" choices early in a season. |

### Suggestions

- **Concurrency Optimization:** Instead of `localConcurrency: 1`, use a higher concurrency and leverage PostgreSQL **Row-Level Locking** (`SELECT ... FOR UPDATE`) or **Atomic Increments** with `WHERE` clauses (as already planned for the daily cap). This allows multiple workers to process activities for *different* users simultaneously.
- **Item Normalization:** Split the items into `item_templates` (static data) and `items` (unique instances). Only create a new row in the `items` table if the item actually has unique attributes. If it's a "standard" sword, it should just be a reference to a template.
- **Activity Sharding:** Consider sharding the `ActivityWorker` by `characterId` (using pg-boss channels or hash-based routing) to ensure that one user's messages are processed in order while allowing parallel processing across the user base.
- **Breakthrough UX:** Add a small "meditation" cooldown (e.g., 5–10 minutes) after a **failure** to make the penalty feel more impactful and prevent spamming.
- **Schema Check:** Ensure `guild_activity` has an index on `guildId` specifically for the guild leaderboard, as the composite `(characterId, guildId)` might not be optimal for "Top 10 in this Guild" queries depending on column order.

### Risk Assessment: MEDIUM

The overall risk is **MEDIUM**, primarily due to potential scaling issues with the activity worker and the long-term storage of unique items.

**Justification:** The architectural logic is sound and the code quality (Zod validation, TDD, atomic transactions) is high. However, the "fire-and-forget" pipeline, while great for the Discord UI, shifts the burden entirely to the `pg-boss` workers. If the worker concurrency is too low, the game state will lag behind real-time activity; if it's too high without sharding, you risk deadlocks on the `characters` table. These are solvable "success problems," but they require monitoring from day one of Phase 2.

**Verdict:** The plans are **APPROVED** for implementation, provided the concurrency/bottleneck concerns in Plan 02-02 are addressed during the "Act" phase.

---

## Consensus Summary

Only one external reviewer (Gemini) completed the review. Claude CLI was not authenticated (`claude /login` required). Codex CLI timed out during its codebase exploration phase.

### Key Findings (Gemini)

**Agreed Strengths**
- Fire-and-forget async pipeline is correct architecture for Discord bots at scale
- 5-layer anti-farming guard is comprehensive and ships with the core loop (not after)
- Atomic SQL patterns (daily cap, crafting transaction) are race-condition free
- Zod JSONB validation on every read is the right defensive pattern

**Priority Concerns**

1. **[HIGH] ActivityWorker `localConcurrency: 1` bottleneck** — Sequential processing of the activity queue will not scale to hundreds of messages/second. The atomic `UPDATE WHERE` pattern already prevents double-counting; concurrency can be raised safely with per-user processing semantics.

2. **[MEDIUM] Items table grows unbounded** — Every unique craft creates a permanent `items` row. Consider `item_templates` + instances model, or accept the growth with a periodic archival job (can be Phase 3 concern).

3. **[MEDIUM] guild_activity index gap** — Composite PK `(characterId, guildId)` may not serve the guild leaderboard query (`WHERE guildId ORDER BY tuVi`) efficiently. A secondary index on `guildId` should be added to Plan 02-01.

4. **[LOW] Breakthrough spam** — No retry cooldown after failure allows instant re-attempt loops. A 5–10 min post-failure cooldown adds meaningful gameplay tension.

5. **[LOW] No respec policy** — First-season players may regret early profession point choices. Consider a one-time respec per season as a quality-of-life option.

### Recommended Actions Before Execution

| Priority | Action | Plan |
|----------|--------|------|
| HIGH | Raise ActivityWorker concurrency; add per-user SELECT FOR UPDATE or rely on existing atomic WHERE | 02-02 |
| MEDIUM | Add `idx_guild_activity_guild_id` secondary index on `guild_activity.guildId` | 02-01 |
| LOW | Add 5-min retry cooldown after breakthrough failure | 02-04 |
| LOW | Note no-respec as intentional design decision (document in CONTEXT.md) | 02-06 |

---

To incorporate feedback into planning:
```
/gsd-plan-phase 2 --reviews
```
