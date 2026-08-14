import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { userHeroSoulgems } from '../../db/schema/userHeroSoulgems.js';
import { soulgemTransactions } from '../../db/schema/soulgemTransactions.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { sanguoItems } from '../../db/schema/sanguoItems.js';
import { userSanguoItems } from '../../db/schema/userSanguoItems.js';
import { userLegionSlots } from '../../db/schema/userLegions.js';
import { LEVEL_COST, MAX_LEVEL, EVOLUTION_COSTS } from '../../constants/sanguoProgression.js';

/**
 * Hồn ngọc progression service (Phase 11 — TQC-14/TQC-15, D-01..D-12, D-32).
 * Task 1 (TRACER): the conversion tx + the WHERE-guard deduction primitive.
 * Task 2: levelUp + evolveHero — explicit hồn ngọc-sink actions on the same
 * single-writer pattern (one FOR UPDATE tx per action; the pool row is locked
 * by the WHERE-guard UPDATE itself, the target copy by a FOR UPDATE read).
 *
 * Every hồn ngọc mutation (convert / level / evolve / reroll) runs in ONE
 * FOR UPDATE transaction that locks the user's OWN rows (the target
 * user_heroes copy + the per-hero user_hero_soulgems pool row +
 * user_sanguo_state), re-fetches the latest rows (never trusts the press
 * payload), and performs every read/write for that interaction inside the tx
 * (RESEARCH Pattern 5 / Pitfall 1 — single-writer, no double-spend).
 *
 * PRIMITIVE: deductHonNgoc(tx, userId, heroId, amount) mirrors the
 * balance-deduction WHERE-guard pattern — `UPDATE ... WHERE amount >= cost` +
 * rowCount check, throwing Error('INSUFFICIENT_HON_NGOC') on zero rows so the
 * WHOLE transaction rolls back. It is the single anti-double-spend control
 * for ALL FOUR progression actions (Pitfall 1).
 *
 * BALANCE DISCIPLINE (D-02): hồn ngọc is a SEPARATE account-bound per-hero
 * resource — it is NEVER a users.balance flow. No deduction primitive from
 * any other module is used here; the pool is the only sink/source. There is
 * no hồn ngọc → Linh thạch path anywhere.
 *
 * BOOSTER ATOMICITY (D-12 / Pitfall 2): the booster_x2 consumable is consumed
 * (decremented / deleted at 0) in the SAME tx as the conversion it doubles —
 * a concurrent press can never clone the 2x yield.
 *
 * CONVERSION GUARDS (user amendment 2026-08-14 — supersedes the plan's
 * Pitfall 3 approach): there is NO >=-2-copies-of-the-species guard — ANY
 * owned copy is convertible as long as the user keeps at least one hero of
 * ANY kind (COLLECTION_EMPTY guard), the copy is NOT the active companion
 * (ACTIVE_COMPANION — hard block; a companion change happens ONLY via the
 * companion button, the old auto-switch is REMOVED), and the copy is NOT
 * placed in a legion slot (IN_FORMATION — 11-07 surface). A dangling
 * activeHeroId (NO_ACTIVE_HERO on the next battle entry) can never be
 * created.
 *
 * Error convention: plain throw new Error('CODE') — matched by the command
 * layer via err.message (battleCheckInService.ts:35-37).
 *
 * Identity rule: every call keys on users.id — NEVER char.id (grep-gated).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** D-03: flat-by-tier dupe conversion value (t0 1 / t1 5 / t2 10 / t3 20). */
export const TIER_VALUE: Readonly<Record<number, number>> = {
  0: 1,
  1: 5,
  2: 10,
  3: 20,
};

/** The booster_x2 item code (D-11 catalog — seed). */
export const BOOSTER_ITEM_CODE = 'booster_x2' as const;

/**
 * WHERE-guarded per-hero pool deduction (mirrors the balance-deduction
 * rowCount guard). Throws Error('INSUFFICIENT_HON_NGOC') on zero rows — the whole
 * enclosing transaction rolls back, so a failed deduction NEVER leaves a
 * half-applied mutation (level without charge, evolve without cost).
 *
 * @returns the post-deduction pool amount.
 */
export async function deductHonNgoc(
  tx: Tx,
  userId: number,
  heroId: number,
  amount: number,
): Promise<number> {
  const rows = await tx
    .update(userHeroSoulgems)
    .set({ amount: sql`${userHeroSoulgems.amount} - ${amount}`, updatedAt: new Date() })
    .where(and(
      eq(userHeroSoulgems.userId, userId),
      eq(userHeroSoulgems.heroId, heroId),
      sql`${userHeroSoulgems.amount} >= ${amount}`,
    ))
    .returning({ amount: userHeroSoulgems.amount });
  if (rows.length === 0) throw new Error('INSUFFICIENT_HON_NGOC');
  return rows[0]!.amount;
}

/**
 * TQC-14: convert ONE copy into per-(user, heroId) hồn ngọc.
 *
 * ONE tx (single-writer): ownership re-gate on the pressed copy → total-
 * collection non-empty guard (user amendment — any copy is convertible as
 * long as at least one hero of ANY kind remains) → active-companion HARD
 * block (no auto-switch — companion changes only via the companion button) →
 * legion-slot guard (a placed copy is never convertible) → booster check +
 * atomic consumption (Pitfall 2) → DELETE the consumed copy → pool upsert
 * (+= yield) → audit ledger row. NO daily cap (D-03 amendment — the
 * flat-by-tier rarity curve is the diminishing-returns mechanism).
 *
 * @throws Error('NOT_OWNED') — forged copy id (ownership re-gate).
 * @throws Error('COLLECTION_EMPTY') — the user's total collection is <= 1
 *   copy (converting this one would empty the collection).
 * @throws Error('ACTIVE_COMPANION') — the copy is the active companion
 *   (NEVER convertible; user amendment supersedes the auto-switch).
 * @throws Error('IN_FORMATION') — the copy is referenced in user_legion_slots.
 */
export async function convertDuplicate(
  userId: number,
  userHeroId: number,
): Promise<{ yield: number; boosterUsed: boolean }> {
  return db.transaction(async (tx) => {
    // 1. FOR UPDATE lock the target copy — ownership re-gate inside the tx
    //    (the pressed userHeroId is NEVER trusted on its own).
    const [copy] = await tx
      .select()
      .from(userHeroes)
      .where(and(eq(userHeroes.id, userHeroId), eq(userHeroes.userId, userId)))
      .for('update');
    if (!copy) throw new Error('NOT_OWNED');

    // 2. Total-collection non-empty guard (user amendment): converting this
    //    copy must leave >= 1 hero of ANY kind — the >=-2-copies-of-the-same-
    //    species guard is DELETED. Count ALL user_heroes rows for the user.
    const collectionRows = await tx
      .select({ id: userHeroes.id })
      .from(userHeroes)
      .where(eq(userHeroes.userId, userId));
    if (collectionRows.length <= 1) throw new Error('COLLECTION_EMPTY');

    // 3. Lock user_sanguo_state; the ACTIVE companion is NEVER convertible
    //    (user amendment — the old auto-switch-to-earliest-remaining-copy
    //    behavior is REMOVED; a companion change happens ONLY via the
    //    companion button).
    const [state] = await tx
      .select()
      .from(userSanguoState)
      .where(eq(userSanguoState.userId, userId))
      .for('update');
    if (state && state.activeHeroId === copy.id) throw new Error('ACTIVE_COMPANION');

    // 4. Legion-formation guard (user amendment): a copy placed in a
    //    user_legion_slots row is never convertible while placed (the 11-07
    //    surface must remove it from the legion first).
    const [placedSlot] = await tx
      .select({ id: userLegionSlots.id })
      .from(userLegionSlots)
      .where(and(eq(userLegionSlots.userId, userId), eq(userLegionSlots.userHeroId, copy.id)))
      .limit(1);
    if (placedSlot) throw new Error('IN_FORMATION');

    // 5. Booster ownership — FOR UPDATE lock the inventory row + consumption
    //    in the SAME tx as the yield computation (Pitfall 2 anti-clone).
    let boosterUsed = false;
    const [boosterItem] = await tx
      .select()
      .from(sanguoItems)
      .where(eq(sanguoItems.code, BOOSTER_ITEM_CODE))
      .limit(1);
    if (boosterItem) {
      const [ownedBooster] = await tx
        .select()
        .from(userSanguoItems)
        .where(and(
          eq(userSanguoItems.userId, userId),
          eq(userSanguoItems.itemId, boosterItem.id),
        ))
        .for('update');
      if (ownedBooster && ownedBooster.quantity >= 1) {
        boosterUsed = true;
        if (ownedBooster.quantity === 1) {
          // quantity_positive check: a row at 0 is deleted, never persisted.
          await tx.delete(userSanguoItems).where(eq(userSanguoItems.id, ownedBooster.id));
        } else {
          await tx
            .update(userSanguoItems)
            .set({ quantity: ownedBooster.quantity - 1 })
            .where(eq(userSanguoItems.id, ownedBooster.id));
        }
      }
    }

    // 6. D-03 flat-by-tier yield (integer throughout — no float in the pool).
    const yieldAmount = TIER_VALUE[copy.tier] * (boosterUsed ? 2 : 1);

    // 7. DELETE the consumed copy.
    await tx.delete(userHeroes).where(eq(userHeroes.id, copy.id));

    // 8. Upsert the per-hero pool (amount += yield). The pool row is locked
    //    FOR UPDATE; a missing row falls back to the upsert (IN-06 first-row
    //    race — onConflictDoUpdate makes the loser add instead of crash).
    const [pool] = await tx
      .select()
      .from(userHeroSoulgems)
      .where(and(eq(userHeroSoulgems.userId, userId), eq(userHeroSoulgems.heroId, copy.heroId)))
      .for('update');
    const current = pool?.amount ?? 0;
    const balanceAfter = current + yieldAmount;
    if (pool) {
      await tx
        .update(userHeroSoulgems)
        .set({ amount: balanceAfter, updatedAt: new Date() })
        .where(eq(userHeroSoulgems.id, pool.id));
    } else {
      await tx
        .insert(userHeroSoulgems)
        .values({ userId, heroId: copy.heroId, amount: balanceAfter })
        .onConflictDoUpdate({
          target: [userHeroSoulgems.userId, userHeroSoulgems.heroId],
          set: { amount: balanceAfter, updatedAt: new Date() },
        });
    }

    // 9. Audit ledger row (repudiation — Phase 12 TQC-19 + /profile future).
    await tx.insert(soulgemTransactions).values({
      userId,
      heroId: copy.heroId,
      type: 'convert',
      amount: yieldAmount,
      balanceAfter,
    });

    return { yield: yieldAmount, boosterUsed };
  });
}

/**
 * D-05/D-01: level ONE copy by one — an EXPLICIT hồn ngọc action (never
 * passive), charged from the per-hero pool via the WHERE-guard primitive.
 *
 * ONE tx (single-writer): FOR UPDATE lock the copy (ownership re-gate) →
 * LEVEL_MAX guard (hard cap 100) → cost = LEVEL_COST(current level) →
 * deductHonNgoc (pool row locked by the conditional UPDATE; zero rows →
 * INSUFFICIENT_HON_NGOC → whole tx rolls back) → level+1 write on the copy →
 * ledger row { type: 'level', amount: −cost, balanceAfter }.
 *
 * Level is PER-COPY (each copy has its own level column — D-34); the cost
 * curve is identical across tiers (D-05 — evolution never inflates leveling).
 * IVs are NEVER re-rolled by leveling (D-02 Phase 10 / D-07).
 *
 * @throws Error('NOT_OWNED') — forged copy id.
 * @throws Error('LEVEL_MAX') — the copy is already at MAX_LEVEL (100).
 * @throws Error('INSUFFICIENT_HON_NGOC') — pool < LEVEL_COST(level).
 */
export async function levelUp(
  userId: number,
  userHeroId: number,
): Promise<{ newLevel: number; cost: number }> {
  return db.transaction(async (tx) => {
    // 1. FOR UPDATE lock the copy — ownership re-gate inside the tx.
    const [copy] = await tx
      .select()
      .from(userHeroes)
      .where(and(eq(userHeroes.id, userHeroId), eq(userHeroes.userId, userId)))
      .for('update');
    if (!copy) throw new Error('NOT_OWNED');

    // 2. Hard level cap (D-01) — checked BEFORE any charge.
    if (copy.level >= MAX_LEVEL) throw new Error('LEVEL_MAX');

    // 3. Accelerating cost from the hidden balance contract (D-05) — resolved
    //    server-side, NEVER from the press payload (anti-tamper).
    const cost = LEVEL_COST(copy.level);

    // 4. WHERE-guard deduction — the single anti-double-spend control; a
    //    failed deduction throws INSUFFICIENT_HON_NGOC and rolls back the
    //    whole tx, so the level write below can never run uncharged.
    const balanceAfter = await deductHonNgoc(tx, userId, copy.heroId, cost);

    // 5. Level write — per-copy column, in the SAME tx as the charge.
    await tx
      .update(userHeroes)
      .set({ level: copy.level + 1 })
      .where(eq(userHeroes.id, copy.id));

    // 6. Audit ledger row (repudiation — Phase 12 TQC-19).
    await tx.insert(soulgemTransactions).values({
      userId,
      heroId: copy.heroId,
      type: 'level',
      amount: -cost,
      balanceAfter,
    });

    return { newLevel: copy.level + 1, cost };
  });
}

/**
 * D-06/D-07/D-09: evolve ONE copy to the next tier — EXPLICIT (never
 * automatic at the threshold), gated by level + hồn ngọc cost.
 *
 * ONE tx (single-writer): FOR UPDATE lock the copy (ownership re-gate) →
 * T3_GATED guard (t2→t3 needs L80+ AND an event item — unreachable in v3) →
 * level gate (L20 for t0→t1, L50 for t1→t2 — inclusive) → cost from
 * EVOLUTION_COSTS → deductHonNgoc → tier+1 write on the copy → ledger row
 * { type: 'evolve', amount: −cost, balanceAfter }.
 *
 * Evolution does NOT block leveling and NEVER re-rolls IVs (D-06/D-07 —
 * IVs stay capture-locked). The emoji swap to the t1/t2 spritesheet variant
 * (heroEmoji(heroId, newTier)) happens at the COMMAND layer (D-07).
 *
 * @throws Error('NOT_OWNED') — forged copy id.
 * @throws Error('T3_GATED') — tier >= 2 (t3 needs L80+ AND an event item).
 * @throws Error('LEVEL_REQUIRED') — below the tier's level gate (L20/L50).
 * @throws Error('INSUFFICIENT_HON_NGOC') — pool < EVOLUTION_COSTS[newTier].
 */
export async function evolveHero(
  userId: number,
  userHeroId: number,
): Promise<{ newTier: number; cost: number }> {
  return db.transaction(async (tx) => {
    // 1. FOR UPDATE lock the copy — ownership re-gate inside the tx.
    const [copy] = await tx
      .select()
      .from(userHeroes)
      .where(and(eq(userHeroes.id, userHeroId), eq(userHeroes.userId, userId)))
      .for('update');
    if (!copy) throw new Error('NOT_OWNED');

    // 2. D-09: t2 → t3 is schema-gated — L80+ AND an event item, unreachable
    //    in v3 by design (the evolve button renders disabled with
    //    evolve.t3_gated at the command layer).
    if (copy.tier >= 2) throw new Error('T3_GATED');

    // 3. Level gate (D-06) — INCLUSIVE thresholds: exactly L20 may evolve to
    //    t1, exactly L50 to t2 (flagged assumption, 11-03).
    const targetTier = copy.tier + 1;
    const levelRequired = targetTier === 1 ? 20 : 50;
    if (copy.level < levelRequired) throw new Error('LEVEL_REQUIRED');

    // 4. Cost from the hidden balance contract (D-06/D-09) — server-side.
    const cost = EVOLUTION_COSTS[targetTier];

    // 5. WHERE-guard deduction — rollback on insufficient pool.
    const balanceAfter = await deductHonNgoc(tx, userId, copy.heroId, cost);

    // 6. Tier write — in the SAME tx as the charge (D-10: user_heroes.tier is
    //    the single source of truth for both player evolution AND the
    //    captured boss's tier).
    await tx
      .update(userHeroes)
      .set({ tier: targetTier })
      .where(eq(userHeroes.id, copy.id));

    // 7. Audit ledger row (repudiation — Phase 12 TQC-19).
    await tx.insert(soulgemTransactions).values({
      userId,
      heroId: copy.heroId,
      type: 'evolve',
      amount: -cost,
      balanceAfter,
    });

    return { newTier: targetTier, cost };
  });
}
