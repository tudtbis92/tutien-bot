import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { formations, formationSlots, userFormations } from '../../db/schema/formations.js';
import { userLegions, userLegionSlots } from '../../db/schema/userLegions.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { heroes } from '../../db/schema/heroes.js';

/**
 * Sanguo legion service (Phase 11 — TQC-17 assembly half, D-20/D-22, A9).
 *
 * The team-building surface the boss routing (11-06) consumes: an owned
 * formation (free starter at first use + purchased ones from 11-04, D-21) with
 * 3 mains + 9 support slots (0-11), each assignment STRICT class-matched
 * (D-20), ownership-gated (V4) and persisted to user_legions +
 * user_legion_slots.
 *
 * OWNERSHIP + CLASS-MATCH (V4 / D-20): every pressed `userHeroId` is
 * re-validated server-side inside the tx BEFORE any write — a crafted id for
 * another user's hero → NOT_OWNED; a hero whose class does not match the
 * slot's formation_slots.class → legion.class_mismatch; no state change in
 * either case (the security-critical piece).
 *
 * ONE-COPY-ONE-SLOT (D-17): a hero cannot occupy two slots of the same legion
 * — HERO_ALREADY_ASSIGNED. WR-05 (Phase 11 review): this is now STRUCTURAL —
 * the DB unique index `user_legion_slots_unique_user_hero (userId, userHeroId)`
 * (migration 0022) rejects a concurrent assign that slips past the pre-SELECT
 * check, and that DB conflict is surfaced as HERO_ALREADY_ASSIGNED (not a raw
 * 23505 error / duplicate-row state).
 *
 * FREE-ASSEMBLY (D-19): NO currency deduction anywhere — formation PURCHASE is
 * the 11-04 shop sink; assigning/saving is free (grep-gated).
 *
 * FIRST-USE STARTER (D-21 flagged assumption): the free (basePrice 0) starter
 * formation is granted via an onConflictDoNothing upsert on user_formations on
 * the FIRST legion use — rides the PLAN-FIX P0-1
 * `user_formations_unique_user_formation` index, so a concurrent first use is
 * safe (no duplicate ownership).
 *
 * Error convention: plain throw new Error('CODE') — matched by the command
 * layer via err.message. Identity rule: every call keys on users.id.
 */

/** A single slot's hero identity for the render (D-12 visible fields only). */
export interface LegionSlotHero {
  heroId: string;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
  class: string;
}

export interface LegionSlotView {
  slotOrder: number;
  /** userHeroId — null when empty. */
  userHeroId: number | null;
  /** The placed hero's identity; null when empty. */
  hero: LegionSlotHero | null;
}

export interface ActiveLegionView {
  formationId: number;
  formationNameVi: string;
  formationNameEn: string;
  formationNameZh: string | null;
  formationEmoji: string | null;
  slots: LegionSlotView[];
}

/** A row of an owned formation for the formation-select menu (D-21/D-22). */
export interface OwnedFormationRow {
  id: number;
  code: string;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
  slotCount: number;
  emoji: string | null;
}

/**
 * D-21/D-22 + flagged assumption: list the formations the user OWNS — granting
 * the free (basePrice 0) starter formation via the first-use upsert first.
 * Ordered by formation id (stable menu order).
 */
export async function listOwnedFormations(userId: number): Promise<OwnedFormationRow[]> {
  return db.transaction(async (tx) => {
    // 1. Grant the free starter (basePrice 0) on first use — onConflictDoNothing
    //    rides the P0-1 unique (userId, formationId) index (no duplicate).
    const freeRows = await tx
      .select({ id: formations.id })
      .from(formations)
      .where(sql`${formations.basePrice} = 0`);
    for (const free of freeRows) {
      await tx
        .insert(userFormations)
        .values({ userId, formationId: free.id })
        .onConflictDoNothing();
    }

    // 2. Owned formations ordered by id.
    const rows = await tx
      .select({
        id: formations.id,
        code: formations.code,
        nameVi: formations.nameVi,
        nameEn: formations.nameEn,
        nameZh: formations.nameZh,
        slotCount: formations.slotCount,
        emoji: formations.emoji,
      })
      .from(userFormations)
      .innerJoin(formations, eq(userFormations.formationId, formations.id))
      .where(eq(userFormations.userId, userId))
      .orderBy(asc(formations.id));
    return rows;
  });
}

/**
 * D-22: the active legion (user_legions + populated user_legion_slots joined to
 * hero identities) for the render + the 11-06 boss-routing read. Returns null
 * when no active legion is saved.
 */
export async function getActiveLegion(userId: number): Promise<ActiveLegionView | null> {
  return db.transaction(async (tx) => {
    const [legion] = await tx
      .select({
        formationId: userLegions.formationId,
        nameVi: formations.nameVi,
        nameEn: formations.nameEn,
        nameZh: formations.nameZh,
        emoji: formations.emoji,
      })
      .from(userLegions)
      .innerJoin(formations, eq(userLegions.formationId, formations.id))
      .where(eq(userLegions.userId, userId))
      .limit(1);
    if (!legion) return null;

    const slots = await tx
      .select({
        slotOrder: userLegionSlots.slotOrder,
        userHeroId: userLegionSlots.userHeroId,
        heroId: heroes.heroId,
        nameVi: heroes.nameVi,
        nameEn: heroes.nameEn,
        nameZh: heroes.nameZh,
        class: heroes.class,
      })
      .from(userLegionSlots)
      .innerJoin(userHeroes, eq(userLegionSlots.userHeroId, userHeroes.id))
      .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
      .where(eq(userLegionSlots.userId, userId))
      .orderBy(userLegionSlots.slotOrder)
      .limit(12);

    return {
      formationId: legion.formationId,
      formationNameVi: legion.nameVi,
      formationNameEn: legion.nameEn,
      formationNameZh: legion.nameZh,
      formationEmoji: legion.emoji,
      slots: slots.map((s) => ({
        slotOrder: s.slotOrder,
        userHeroId: s.userHeroId,
        hero: {
          heroId: s.heroId,
          nameVi: s.nameVi,
          nameEn: s.nameEn,
          nameZh: s.nameZh,
          class: s.class,
        },
      })),
    };
  });
}

export interface AssignHeroResult {
  slotOrder: number;
  userHeroId: number;
}

/** True when `e` is a Postgres unique-violation (SQLSTATE 23505) on the given
 *  constraint — used to surface the WR-05 one-copy-one-slot DB race as
 *  HERO_ALREADY_ASSIGNED instead of leaking a raw 23505 to the command layer. */
function isUniqueViolation(e: unknown, constraint: string): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: string; constraint?: string; message?: string };
  if (err.code === '23505') {
    if (err.constraint === constraint) return true;
    // Fallback: some drivers only surface the constraint in the message.
    if (typeof err.message === 'string' && err.message.includes(constraint)) return true;
  }
  return false;
}

/**
 * D-20/D-22 (V4): assign ONE copy to ONE slot — ONE tx that (1) verifies the
 * formation is owned, (2) FOR UPDATE locks the target copy + re-gates ownership
 * on the pressed userHeroId, (3) resolves the slot's required class, (4) STRICT
 * class-match before ANY write (legion.class_mismatch), (5) one-copy-one-slot
 * dup guard (HERO_ALREADY_ASSIGNED), (6) upserts the slot row. slotOrder bounds
 * 0-11 validated.
 *
 * @throws Error('NOT_OWNED') — formation not owned OR the pressed copy does not
 *   belong to the user (V4 crafted id).
 * @throws Error('legion.class_mismatch') — the copy's class != slot class.
 * @throws Error('HERO_ALREADY_ASSIGNED') — the copy is already in another slot.
 */
export async function assignHero(
  userId: number,
  formationId: number,
  slotOrder: number,
  userHeroId: number,
): Promise<AssignHeroResult> {
  if (!Number.isInteger(slotOrder) || slotOrder < 0 || slotOrder > 11) {
    throw new Error('legion.class_mismatch');
  }
  return db.transaction(async (tx) => {
    // 1. Formation ownership re-gate.
    const [ownedFormation] = await tx
      .select({ id: userFormations.id })
      .from(userFormations)
      .where(
        and(eq(userFormations.userId, userId), eq(userFormations.formationId, formationId)),
      )
      .limit(1);
    if (!ownedFormation) throw new Error('NOT_OWNED');

    // 2. FOR UPDATE lock the target copy + V4 ownership re-gate.
    const [copy] = await tx
      .select()
      .from(userHeroes)
      .where(eq(userHeroes.id, userHeroId))
      .limit(1)
      .for('update');
    if (!copy || copy.userId !== userId) throw new Error('NOT_OWNED');

    // 3. Resolve the slot's required class.
    const [slotDef] = await tx
      .select()
      .from(formationSlots)
      .where(and(eq(formationSlots.formationId, formationId), eq(formationSlots.slotOrder, slotOrder)))
      .limit(1);
    if (!slotDef) throw new Error('legion.class_mismatch');

    // 4. Resolve the copy's catalog class + STRICT match (D-20) BEFORE any write.
    const [hero] = await tx
      .select({ class: heroes.class })
      .from(heroes)
      .where(eq(heroes.id, copy.heroId))
      .limit(1);
    if (!hero || hero.class !== slotDef.class) throw new Error('legion.class_mismatch');

    // 5. One-copy-one-slot (D-17): the copy cannot be in another slot of this
    //    legion. This pre-SELECT is the fast path for the common (serialized)
    //    case.
    const [dup] = await tx
      .select({ id: userLegionSlots.id })
      .from(userLegionSlots)
      .where(and(eq(userLegionSlots.userId, userId), eq(userLegionSlots.userHeroId, userHeroId)))
      .limit(1);
    if (dup) throw new Error('HERO_ALREADY_ASSIGNED');

    // 6. Upsert the slot row — unique(userId, slotOrder). WR-05: the DB unique
    //    index on (userId, userHeroId) (migration 0022) is the STRUCTURAL
    //    one-copy-one-slot guard — a concurrent assign that slipped past the
    //    pre-check conflicts on that index here; we surface it as
    //    HERO_ALREADY_ASSIGNED rather than leaking a raw 23505.
    try {
      await tx
        .insert(userLegionSlots)
        .values({ userId, slotOrder, userHeroId })
        .onConflictDoUpdate({
          target: [userLegionSlots.userId, userLegionSlots.slotOrder],
          set: { userHeroId },
        });
    } catch (e) {
      if (isUniqueViolation(e, 'user_legion_slots_unique_user_hero')) {
        throw new Error('HERO_ALREADY_ASSIGNED');
      }
      throw e;
    }

    return { slotOrder, userHeroId };
  });
}

/**
 * D-20: clear the slot's assignment (empty slots allowed — bonus-only
 * chemistry, no penalty).
 */
export async function clearSlot(userId: number, slotOrder: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(userLegionSlots)
      .where(and(eq(userLegionSlots.userId, userId), eq(userLegionSlots.slotOrder, slotOrder)));
  });
}

export interface SaveLegionResult {
  formationId: number;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
  emoji: string | null;
}

/**
 * D-22: persist the ACTIVE legion (ONE per user) — ONE tx: verify the formation
 * is owned, then upsert user_legions on the unique userId (a second save
 * replaces the previous cleanly). The 12 slot rows persist as assigned (empty
 * stays empty). Incomplete (n/3 mains) is ALLOWED — the caution renders in the
 * command layer (R-11).
 *
 * @throws Error('NOT_OWNED') — the formation is not owned.
 */
export async function saveLegion(userId: number, formationId: number): Promise<SaveLegionResult> {
  return db.transaction(async (tx) => {
    const [ownedFormation] = await tx
      .select({ id: userFormations.id })
      .from(userFormations)
      .where(
        and(eq(userFormations.userId, userId), eq(userFormations.formationId, formationId)),
      )
      .limit(1);
    if (!ownedFormation) throw new Error('NOT_OWNED');

    const [formation] = await tx
      .select()
      .from(formations)
      .where(eq(formations.id, formationId))
      .limit(1);
    if (!formation) throw new Error('NOT_OWNED');

    await tx
      .insert(userLegions)
      .values({ userId, formationId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userLegions.userId,
        set: { formationId, updatedAt: new Date() },
      });

    return {
      formationId: formation.id,
      nameVi: formation.nameVi,
      nameEn: formation.nameEn,
      nameZh: formation.nameZh,
      emoji: formation.emoji,
    };
  });
}
