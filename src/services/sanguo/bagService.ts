import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { userSanguoItems } from '../../db/schema/userSanguoItems.js';
import { sanguoItems } from '../../db/schema/sanguoItems.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { heroes } from '../../db/schema/heroes.js';

/**
 * Bag service (Phase 11 — TQC-16, D-13/D-04 soft-lock recovery).
 *
 * listBag: the owned inventory (user_sanguo_items join sanguo_items) ordered
 * by item id asc — the ≤3-item catalog-bound list (D-11). The command renders
 * bag.empty when it returns [].
 *
 * useHeal: the D-04 recovery path — ONE FOR UPDATE tx that locks the user's
 * OWN rows: the inventory row (joined to the item catalog by code) + the
 * target copy (user_heroes). The heal restores the copy to FULL base HP
 * (simplest D-04 recovery; the copy-selector flow from hero.ts re-renders
 * after). The item is consumed (decrement, delete-at-0 — the
 * quantity_positive check at userSanguoItems.ts:20) in the SAME tx as the HP
 * write — a concurrent press can never clone the heal (T-11-04-04).
 *
 * FULL-HP GUARD (flagged assumption, TQC-16 adjacency): a copy at
 * hp_current >= base HP is NOT a valid target — NO_TARGET is thrown BEFORE any
 * consumption, so the item is never burned on a full-HP hero (the whole tx
 * rolls back). Same for a missing active companion / missing explicit target.
 *
 * WALLET DISCIPLINE (D-19): bag use is NOT a money flow — this module makes
 * ZERO wallet calls (grep-gated). Healing restores a stat, it never mints or
 * sinks Linh thạch.
 *
 * Error convention: plain throw new Error('CODE') — matched by the command
 * layer via err.message. Identity rule: every call keys on users.id.
 */

export interface BagRow {
  itemCode: string;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
  emoji: string | null;
  quantity: number;
}

/** The healing item code (D-11 catalog — the ONLY heal item in v3). */
export const HEAL_ITEM_CODE = 'heal_pill' as const;

/** D-13: the owned inventory, ordered by item id asc (catalog order). */
export async function listBag(userId: number): Promise<BagRow[]> {
  return db
    .select({
      itemCode: sanguoItems.code,
      nameVi: sanguoItems.nameVi,
      nameEn: sanguoItems.nameEn,
      nameZh: sanguoItems.nameZh,
      emoji: sanguoItems.emoji,
      quantity: userSanguoItems.quantity,
    })
    .from(userSanguoItems)
    .innerJoin(sanguoItems, eq(userSanguoItems.itemId, sanguoItems.id))
    .where(eq(userSanguoItems.userId, userId))
    .orderBy(asc(sanguoItems.id));
}

export interface UseHealResult {
  healedHeroId: number;
  hpAfter: number;
}

/**
 * D-13: heal ONE copy to full base HP, consuming one heal_pill.
 *
 * ONE tx (single-writer, T-11-04-04): FOR UPDATE lock the inventory row (join
 * by item code — quantity >= 1 else ITEM_NOT_OWNED) → resolve the target —
 * the explicit targetUserHeroId (ownership re-gate) or the active companion
 * from user_sanguo_state → FOR UPDATE lock the target copy → read the base HP
 * from the heroes catalog → full-HP guard (NO_TARGET, item NOT consumed) →
 * UPDATE user_heroes SET hp_current = base hp → decrement the inventory
 * (delete at 0) → return { healedHeroId, hpAfter }.
 *
 * @throws Error('ITEM_NOT_OWNED') — the user owns no row for this item code.
 * @throws Error('NO_TARGET') — no explicit target AND no active companion,
 *   or the target copy is not owned / does not exist, or the copy is at full
 *   HP (hp_current >= base hp — item NOT consumed).
 */
export async function useHeal(
  userId: number,
  itemCode: string,
  targetUserHeroId: number | null,
): Promise<UseHealResult> {
  return db.transaction(async (tx) => {
    // 1. FOR UPDATE lock the inventory row (joined to the catalog by code) —
    //    quantity >= 1 by the quantity_positive check; a missing row means
    //    the item is not owned.
    const [inv] = await tx
      .select({
        id: userSanguoItems.id,
        quantity: userSanguoItems.quantity,
        itemCode: sanguoItems.code,
      })
      .from(userSanguoItems)
      .innerJoin(sanguoItems, eq(userSanguoItems.itemId, sanguoItems.id))
      .where(and(eq(userSanguoItems.userId, userId), eq(sanguoItems.code, itemCode)))
      .for('update');
    if (!inv) throw new Error('ITEM_NOT_OWNED');
    // Defensive: the command only routes the heal item here; a crafted code
    // for a non-heal item must never run the heal path (D-13 booster hint /
    // capture_key gate are command-layer surfaces).
    if (itemCode !== HEAL_ITEM_CODE) throw new Error('ITEM_NOT_USEABLE');

    // 2. Resolve the target — the explicit copy (ownership re-gate) or the
    //    active companion from user_sanguo_state.
    let targetId = targetUserHeroId;
    if (targetId == null) {
      const [state] = await tx
        .select()
        .from(userSanguoState)
        .where(eq(userSanguoState.userId, userId))
        .limit(1);
      targetId = state?.activeHeroId ?? null;
    }
    if (targetId == null) throw new Error('NO_TARGET');

    const [target] = await tx
      .select()
      .from(userHeroes)
      .where(and(eq(userHeroes.id, targetId), eq(userHeroes.userId, userId)))
      .for('update');
    if (!target) throw new Error('NO_TARGET');

    // 3. Base HP from the catalog — the heal ceiling (D-04 recovery).
    const [catalogHero] = await tx
      .select({ hp: heroes.hp })
      .from(heroes)
      .where(eq(heroes.id, target.heroId))
      .limit(1);
    if (!catalogHero) throw new Error('NO_TARGET');

    // 4. Full-HP guard — NO consumption on a full-HP copy (flagged assumption;
    //    the whole tx rolls back, the item is NOT burned).
    if (target.hpCurrent >= catalogHero.hp) throw new Error('NO_TARGET');

    // 5. Heal to FULL base HP + consume in the SAME tx (anti-clone).
    await tx
      .update(userHeroes)
      .set({ hpCurrent: catalogHero.hp })
      .where(eq(userHeroes.id, target.id));

    if (inv.quantity === 1) {
      // quantity_positive check: a row at 0 is deleted, never persisted.
      await tx.delete(userSanguoItems).where(eq(userSanguoItems.id, inv.id));
    } else {
      await tx
        .update(userSanguoItems)
        .set({ quantity: inv.quantity - 1 })
        .where(eq(userSanguoItems.id, inv.id));
    }

    return { healedHeroId: target.id, hpAfter: catalogHero.hp };
  });
}
