import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { userHeroSoulgems } from '../../db/schema/userHeroSoulgems.js';
import { soulgemTransactions } from '../../db/schema/soulgemTransactions.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { sanguoItems } from '../../db/schema/sanguoItems.js';
import { userSanguoItems } from '../../db/schema/userSanguoItems.js';

/**
 * Hồn ngọc progression service (Phase 11 — TQC-14/TQC-15, D-01..D-12, D-32).
 * Task 1 (TRACER): the conversion tx + the WHERE-guard deduction primitive.
 * levelUp/evolveHero/rerollSkill land in Tasks 2/3 on the same patterns.
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
 * CONVERSION GUARD (Pitfall 3): converting requires >= 2 owned copies of the
 * species, and converting the ACTIVE companion copy auto-switches the
 * companion to the earliest remaining copy inside the tx — a dangling
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
 * TQC-14: convert ONE duplicate copy into per-(user, heroId) hồn ngọc.
 *
 * ONE tx (single-writer): ownership re-gate on the pressed copy → >= 2
 * copies guard → active-companion auto-switch (Pitfall 3) → booster check
 * + atomic consumption (Pitfall 2) → DELETE the consumed copy → pool upsert
 * (+= yield) → audit ledger row. NO daily cap (D-03 amendment — the
 * flat-by-tier rarity curve is the diminishing-returns mechanism).
 *
 * @throws Error('NOT_OWNED') — forged copy id (ownership re-gate).
 * @throws Error('NOT_ENOUGH_COPIES') — fewer than 2 owned copies.
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

    // 2. Count the owned copies of the SAME species — conversion consumes a
    //    TRUE duplicate (>= 2 owned copies, earliest-captured first).
    const copies = await tx
      .select({ id: userHeroes.id, capturedAt: userHeroes.capturedAt })
      .from(userHeroes)
      .where(and(eq(userHeroes.userId, userId), eq(userHeroes.heroId, copy.heroId)))
      .orderBy(asc(userHeroes.capturedAt), asc(userHeroes.id));
    if (copies.length < 2) throw new Error('NOT_ENOUGH_COPIES');

    // 3. Lock user_sanguo_state; if the consumed copy IS the active
    //    companion, auto-switch to the earliest remaining copy (Pitfall 3 —
    //    never leave a dangling activeHeroId).
    const [state] = await tx
      .select()
      .from(userSanguoState)
      .where(eq(userSanguoState.userId, userId))
      .for('update');
    if (state && state.activeHeroId === copy.id) {
      const nextActive = copies.find((c) => c.id !== copy.id);
      if (nextActive) {
        await tx
          .update(userSanguoState)
          .set({ activeHeroId: nextActive.id, updatedAt: new Date() })
          .where(eq(userSanguoState.userId, userId));
      }
    }

    // 4. Booster ownership — FOR UPDATE lock the inventory row + consumption
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

    // 5. D-03 flat-by-tier yield (integer throughout — no float in the pool).
    const yieldAmount = TIER_VALUE[copy.tier] * (boosterUsed ? 2 : 1);

    // 6. DELETE the consumed copy.
    await tx.delete(userHeroes).where(eq(userHeroes.id, copy.id));

    // 7. Upsert the per-hero pool (amount += yield). The pool row is locked
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

    // 8. Audit ledger row (repudiation — Phase 12 TQC-19 + /profile future).
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
