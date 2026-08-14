import { asc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sanguoItems } from '../../db/schema/sanguoItems.js';
import { userSanguoItems } from '../../db/schema/userSanguoItems.js';
import { cryptoUniform } from './encounterService.js';

/**
 * Boss item drop service (Phase 11 — TQC-16, D-14).
 *
 * Guaranteed boss drop: every boss-win branch calls rollBossDrop and ALWAYS
 * gets exactly ONE item (D-14 — the function never returns undefined; the
 * 11-06 boss-win branch wires the call). The drop pool is the SAME
 * sanguo_items catalog as the shop, filtered by `drop_weight > 0` — the
 * seeded weights (heal 70% / booster 25% / key4 4.9% / key5 0.1% — adopt-a5,
 * 11-01 checkpoint-confirmed) live in the DB columns, NEVER hardcoded here
 * (Pitfall 8 — single source).
 *
 * CRYPTO MANDATE (milestone / ASVS V6): the default rng is cryptoUniform
 * (crypto.randomInt-based) — a player-facing roll. The rng parameter is
 * injectable for deterministic boundary tests only; pure-rand NEVER appears
 * here (it exists only inside the seeded battle replay, D-06).
 *
 * HALF-OPEN BOUNDARY (the boundary tests depend on it): the cumulative walk
 * uses `roll < cumulative` — an exact-boundary roll falls to the NEXT-higher
 * item: 0.0 → heal_pill, 0.70 → booster_x2, 0.95 → capture_tier4_key,
 * 0.999 → capture_tier5_key. Implemented in INTEGER math (drop_weight scale-2
 * ×100 → w, roll ×1e6) so exact boundaries are bit-exact — the
 * encounterService.ts `(roll -= w) <= 0` operator is NOT copied (that assigns
 * exact-boundary rolls to the PRECEDING item and fails 2 of the 4 boundary
 * tests).
 *
 * WALLET DISCIPLINE (D-19): drops NEVER mint money — this module makes ZERO
 * wallet calls (grep-gated); the only payout surface is the user_sanguo_items
 * upsert. Drop weights read from the DB columns (Number()-converted — drizzle
 * numeric columns return STRINGS, the encounterService.ts:133 F8 precedent).
 *
 * Error convention: plain throw new Error('CODE'). Identity: users.id keys.
 */
export interface BossDropResult {
  itemCode: string;
  quantity: number;
}

/**
 * D-14: roll ONE guaranteed item drop — ONE tx: read the drop-eligible pool
 * (drop_weight > 0, catalog order), weighted-pick via the half-open
 * cumulative walk, upsert the inventory row (quantity +1).
 *
 * @throws Error('EMPTY_DROP_POOL') — no catalog rows with drop_weight > 0
 *   (defensive; the 11-02 seed always provides the 4-item pool).
 */
export async function rollBossDrop(
  userId: number,
  rng: () => number = cryptoUniform,
): Promise<BossDropResult> {
  return db.transaction(async (tx) => {
    // 1. The drop-eligible pool — weights from the DB, never hardcoded
    //    (Pitfall 8 / T-11-04-05: single source = the 11-02 seed).
    const items = await tx
      .select()
      .from(sanguoItems)
      .where(sql`${sanguoItems.dropWeight} > 0`)
      .orderBy(asc(sanguoItems.id));
    if (items.length === 0) throw new Error('EMPTY_DROP_POOL');

    // 2. Number()-convert the numeric-string weights (F8 precedent) and scale
    //    to integers (drop_weight has scale 2 → ×100). Zero-weight rows are
    //    filtered so the walk can never select them.
    const entries = items
      .map((it) => ({ item: it, w: Math.round(Number(it.dropWeight) * 100) }))
      .filter((e) => e.w > 0);
    if (entries.length === 0) throw new Error('EMPTY_DROP_POOL');
    const total = entries.reduce((acc, e) => acc + e.w, 0);
    if (total <= 0) throw new Error('EMPTY_DROP_POOL');

    // 3. HALF-OPEN walk in integer space: roll ∈ [0, 999999] =
    //    floor(rng() × 1_000_000); each entry's band is scaledW = w × 100
    //    (w = Number(dropWeight) × 100), so the 70/25/4.9/0.1 pool maps to
    //    bands [0,700000) / [700000,950000) / [950000,999000) /
    //    [999000,1000000) — total 1_000_000. An exact boundary (e.g. roll
    //    700000 = rng 0.70) falls PAST heal's band and onto booster — the
    //    NEXT-higher item (0.95 → key4, 0.999 → key5). Bit-exact: no float
    //    accumulation, no `(roll -= w) <= 0` operator.
    const roll = Math.floor(rng() * 1_000_000);
    let remaining = roll;
    let picked = entries.at(-1)!.item;
    for (const e of entries) {
      const scaledW = e.w * 100;
      if (remaining < scaledW) {
        picked = e.item;
        break;
      }
      remaining -= scaledW;
    }

    // 4. The ONLY payout surface — an inventory upsert (quantity_positive
    //    check; onConflictDoUpdate adds). Never users.balance (D-19).
    await tx
      .insert(userSanguoItems)
      .values({ userId, itemId: picked.id, quantity: 1 })
      .onConflictDoUpdate({
        target: [userSanguoItems.userId, userSanguoItems.itemId],
        set: { quantity: sql`${userSanguoItems.quantity} + 1` },
      });

    return { itemCode: picked.code, quantity: 1 };
  });
}
