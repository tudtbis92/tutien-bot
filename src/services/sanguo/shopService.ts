import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sanguoItems } from '../../db/schema/sanguoItems.js';
import { userSanguoItems } from '../../db/schema/userSanguoItems.js';
import { formations, userFormations } from '../../db/schema/formations.js';
import { deductBalance } from '../wallet.js';

/**
 * Shop service (Phase 11 — TQC-16, D-16/D-21).
 *
 * Every purchase is a WALLET-SINK transaction (D-19): the Linh thạch price is
 * charged through `wallet.deductBalance` — the WHERE-guarded UPDATE + ledger
 * INSERT in the SAME tx as the item/formation grant. A failed deduction
 * (INSUFFICIENT_BALANCE) rolls the whole tx back: no item, no ownership row,
 * no half-applied grant.
 *
 * ANTI-TAMPER (T-11-04-01 / UI-SPEC / Pitfall 3 Phase 10 carry): the customId
 * `sanguo:shop:buy:{code}` carries ONLY the item/formation code. The PRICE is
 * NEVER in the payload — it resolves server-side from sanguo_items.price_linh
 * / formations.base_price INSIDE this tx. A crafted customId with a fabricated
 * price is ignored because the price read is unconditional.
 *
 * D-15 saleState gate (T-11-04-02): capture keys are `locked` — buyItem
 * throws ITEM_NOT_FOR_SALE before any wallet touch, so capture_key can never
 * be bought for Linh thạch (one-way: selling later needs an economy re-sign).
 *
 * LEDGER (SC1): every successful deduction writes exactly one
 * wallet_transactions row with the reason prefix 'sanguo_shop_' —
 * 'sanguo_shop_{code}' for items, 'sanguo_shop_formation_{code}' for
 * formations — keeping the audit trail reconcilable (Phase 12 TQC-19).
 *
 * BUYFORMATION TOCTOU CLOSE (P0-1): user_formations has a unique
 * (userId, formationId) index. The friendly pre-check SELECT surfaces the
 * common already-owned case, and the INSERT rides onConflictDoNothing +
 * returning — a concurrent buy that slips past the pre-check hits the unique
 * violation, matches zero rows, and throws ALREADY_OWNED (defense-in-depth,
 * no duplicate ownership possible).
 *
 * Error convention: plain throw new Error('CODE') — matched by the command
 * layer via err.message. Identity rule: every call keys on users.id.
 */

export interface BuyItemResult {
  itemCode: string;
  /** nameVi — canonical; per-locale names ride alongside for the UI pick. */
  name: string;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
  emoji: string | null;
  qty: number;
  price: bigint;
}

/**
 * TQC-16 / D-16: buy ONE item with Linh thạch — ONE wallet-sink tx.
 *
 * @throws Error('ITEM_NOT_FOR_SALE') — unknown code OR saleState !== 'sold'
 *   (capture_key stays locked, D-15).
 * @throws Error('INSUFFICIENT_BALANCE') — balance < priceLinh (whole tx rolls
 *   back; no inventory change).
 */
export async function buyItem(userId: number, itemCode: string): Promise<BuyItemResult> {
  return db.transaction(async (tx) => {
    // 1. Price + saleState resolve SERVER-SIDE from the catalog — never the
    //    customId (anti-tamper, T-11-04-01).
    const [item] = await tx
      .select()
      .from(sanguoItems)
      .where(eq(sanguoItems.code, itemCode))
      .limit(1);
    if (!item || item.saleState !== 'sold') throw new Error('ITEM_NOT_FOR_SALE');

    const price = item.priceLinh;

    // 2. The wallet sink — WHERE-guarded UPDATE + ledger row in this tx
    //    (D-03/SC1). INSUFFICIENT_BALANCE → the whole tx rolls back.
    await deductBalance(tx, userId, price, {
      reason: 'sanguo_shop_' + itemCode,
      metadata: { itemId: item.id },
    });

    // 3. Inventory grant — unique (userId, itemId) upsert (quantity_positive
    //    check at userSanguoItems.ts:20; onConflictDoUpdate adds, never dups).
    await tx
      .insert(userSanguoItems)
      .values({ userId, itemId: item.id, quantity: 1 })
      .onConflictDoUpdate({
        target: [userSanguoItems.userId, userSanguoItems.itemId],
        set: { quantity: sql`${userSanguoItems.quantity} + 1` },
      });

    return {
      itemCode: item.code,
      name: item.nameVi,
      nameVi: item.nameVi,
      nameEn: item.nameEn,
      nameZh: item.nameZh,
      emoji: item.emoji,
      qty: 1,
      price,
    };
  });
}

export interface BuyFormationResult {
  formationCode: string;
  name: string;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
  emoji: string | null;
  price: bigint;
}

/**
 * D-21: buy ONE formation with Linh thạch — ONE wallet-sink tx.
 * v3 delivers shop purchase ONLY (formation SELL and the 'formations via boss
 * drops' sourcing channel are deferred — flagged assumption, not silent).
 *
 * @throws Error('FORMATION_NOT_FOUND') — unknown formation code.
 * @throws Error('ALREADY_OWNED') — the user owns the formation already (the
 *   pre-check fast path AND the unique-constraint TOCTOU close, P0-1).
 * @throws Error('INSUFFICIENT_BALANCE') — balance < basePrice.
 */
export async function buyFormation(
  userId: number,
  formationCode: string,
): Promise<BuyFormationResult> {
  return db.transaction(async (tx) => {
    // 1. Price resolves SERVER-SIDE from formations.base_price (anti-tamper).
    const [formation] = await tx
      .select()
      .from(formations)
      .where(eq(formations.code, formationCode))
      .limit(1);
    if (!formation) throw new Error('FORMATION_NOT_FOUND');

    // 2. Already-owned fast path (the common case; the unique constraint
    //    below is the TOCTOU defense-in-depth, P0-1).
    const [owned] = await tx
      .select({ id: userFormations.id })
      .from(userFormations)
      .where(and(eq(userFormations.userId, userId), eq(userFormations.formationId, formation.id)))
      .limit(1);
    if (owned) throw new Error('ALREADY_OWNED');

    // 3. The wallet sink — WHERE-guarded UPDATE + ledger row (SC1).
    await deductBalance(tx, userId, formation.basePrice, {
      reason: 'sanguo_shop_formation_' + formation.code,
      metadata: { formationId: formation.id },
    });

    // 4. Ownership row — onConflictDoNothing + returning: a concurrent buy
    //    that raced past the pre-check hits the unique (userId, formationId)
    //    violation, matches zero rows, and throws ALREADY_OWNED — the whole
    //    tx (incl. the deduction) rolls back.
    const inserted = await tx
      .insert(userFormations)
      .values({ userId, formationId: formation.id })
      .onConflictDoNothing()
      .returning({ id: userFormations.id });
    if (inserted.length === 0) throw new Error('ALREADY_OWNED');

    return {
      formationCode: formation.code,
      name: formation.nameVi,
      nameVi: formation.nameVi,
      nameEn: formation.nameEn,
      nameZh: formation.nameZh,
      emoji: formation.emoji,
      price: formation.basePrice,
    };
  });
}
