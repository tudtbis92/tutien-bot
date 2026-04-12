/**
 * Realm (Cảnh Giới) constants for TuTien Bot.
 *
 * 42 total tiers: Luyện Khí (9 tiers) + 11 major realms × 3 tiers each = 42
 * realm_id 0–41 stored as SMALLINT in characters.realm_id
 *
 * Sources:
 * - CONTEXT.md D-10..D-14 (realm structure decisions)
 * - CONTEXT.md D-15..D-16 (breakthrough failure table)
 * - RESEARCH.md "Tu Vi Threshold Curve" (agent-designed exponential curve)
 * - RESEARCH.md "REALM_CONFIG Structure"
 */

/**
 * Tu vi needed to advance FROM each realm tier to the next.
 * Index = realm_id. TU_VI_TO_ADVANCE[41] = Infinity (cannot advance from max tier).
 *
 * Design parameters (RESEARCH.md):
 * - Average active player earns ~4,000 tu vi/day
 * - Luyện Khí complete: ~11 days (6 days at hard cap of 10,000/day)
 * - Enter Trúc Cơ: ~3.5 weeks average
 * - Enter Kim Đan: ~8 weeks average
 * - Enter Nguyên Anh: ~5.5 months (start of legendary territory)
 * - Hóa Thần+: multi-season goals
 */
export const TU_VI_TO_ADVANCE: readonly number[] = [
  // ── Luyện Khí Tầng 1–9 (realm_id 0–8) ──
  1_000,        // 0→1  (0.25 days avg)
  1_500,        // 1→2
  2_200,        // 2→3
  3_200,        // 3→4
  4_700,        // 4→5
  7_000,        // 5→6  (1.75 days avg)
  10_000,       // 6→7  (2.5 days avg)
  15_000,       // 7→8
  22_000,       // 8→9  (major boundary → Trúc Cơ, 0% fail)
  // Cumulative to Trúc Cơ: ~66,600 / 4,000 ≈ 16.6 days

  // ── Trúc Cơ Sơ/Trung/Hậu Kỳ (realm_id 9–11) ──
  35_000,       // 9→10
  52_000,       // 10→11
  78_000,       // 11→12 (major boundary → Kim Đan, 20% fail)
  // Cumulative to Kim Đan: ~231,600 / 4,000 ≈ 57.9 days

  // ── Kim Đan Sơ/Trung/Hậu Kỳ (realm_id 12–14) ──
  120_000,      // 12→13
  180_000,      // 13→14
  270_000,      // 14→15 (major boundary → Nguyên Anh, 40% fail)
  // Cumulative to Nguyên Anh: ~801,600 / 4,000 ≈ 200 days

  // ── Nguyên Anh Sơ/Trung/Hậu Kỳ (realm_id 15–17) ──
  400_000,      // 15→16
  600_000,      // 16→17
  900_000,      // 17→18 (major boundary → Hóa Thần, 60% fail)

  // ── Hóa Thần Sơ/Trung/Hậu Kỳ (realm_id 18–20) ──
  1_350_000,    // 18→19
  2_000_000,    // 19→20
  3_000_000,    // 20→21 (major boundary → Luyện Hư, 70% fail)

  // ── Luyện Hư Sơ/Trung/Hậu Kỳ (realm_id 21–23) ──
  4_500_000,    // 21→22
  6_750_000,    // 22→23
  10_000_000,   // 23→24 (major boundary → Vấn Đỉnh, 75% fail)

  // ── Vấn Đỉnh Sơ/Trung/Hậu Kỳ (realm_id 24–26) ──
  15_000_000,   // 24→25
  22_500_000,   // 25→26
  33_750_000,   // 26→27 (major boundary → Đại Thừa, 80% fail)

  // ── Đại Thừa Sơ/Trung/Hậu Kỳ (realm_id 27–29) ──
  50_000_000,   // 27→28
  75_000_000,   // 28→29
  112_500_000,  // 29→30 (major boundary → Bán Tiên, 85% fail)

  // ── Bán Tiên Sơ/Trung/Hậu Kỳ (realm_id 30–32) ──
  170_000_000,  // 30→31
  255_000_000,  // 31→32
  382_500_000,  // 32→33 (major boundary → Địa Tiên, 88% fail)

  // ── Địa Tiên Sơ/Trung/Hậu Kỳ (realm_id 33–35) ──
  575_000_000,  // 33→34
  860_000_000,  // 34→35
  1_290_000_000, // 35→36 (major boundary → Chân Tiên, 90% fail)

  // ── Chân Tiên Sơ/Trung/Hậu Kỳ (realm_id 36–38) — legendary ──
  1_935_000_000,  // 36→37
  2_900_000_000,  // 37→38
  4_350_000_000,  // 38→39 (major boundary → Đại La Tiên, 93% fail)

  // ── Đại La Tiên Sơ/Trung/Hậu Kỳ (realm_id 39–41) — apex realm ──
  6_525_000_000,  // 39→40
  9_787_500_000,  // 40→41
  Infinity,       // 41: Max tier — Đại La Tiên Hậu Kỳ, cannot advance
] as const;
// 42 entries total for realm_id 0–41

/**
 * RealmTier metadata for each of the 42 tiers.
 * Used for display, breakthrough checks, and penalty calculations.
 */
export interface RealmTier {
  /** realm_id 0–41 */
  id: number;
  /** i18n key, e.g. 'game:realms.luyen_khi.tang_1' */
  i18nKey: string;
  /** Major realm index: 0=LK, 1=TC, 2=KD, 3=NA, 4=HT, 5=LH, 6=VD, 7=DT, 8=BT, 9=ĐịaT, 10=CT, 11=ĐLT */
  majorRealmIndex: number;
  /** Tier position within major realm (0-indexed) */
  tierInMajor: number;
  /** true for the Hậu Kỳ tier of Trúc Cơ through Chân Tiên (realm_ids 11,14,17,20,23,26,29,32,35,38) */
  isMajorBoundary: boolean;
  /** Failure probability 0.0–1.0 for breakthrough (only used when isMajorBoundary=true) */
  failureChance: number;
  /** Cumulative tu vi needed to REACH this tier (used for failure penalty calculation) */
  entryThreshold: number;
  /** = TU_VI_TO_ADVANCE[id] — tu vi needed to advance TO the next tier */
  tuViRequired: number;
}

// ── Major realm boundary realm_ids (Hậu Kỳ tiers that gate the next major realm) ──
// realm_id 8: Luyện Khí Tầng Chín → Trúc Cơ (0% fail — first major boundary, no risk)
// realm_ids 11, 14, 17, 20, 23, 26, 29, 32, 35, 38: Trúc Cơ Hậu Kỳ through Chân Tiên Hậu Kỳ
export const MAJOR_REALM_BOUNDARIES: readonly number[] = [8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38] as const;

// Failure chances indexed by MAJOR_REALM_BOUNDARIES position (D-16)
const BOUNDARY_FAILURE_CHANCES: readonly number[] = [
  0.00,  // realm_id 8:  LK→TC  (0%)
  0.20,  // realm_id 11: TC→KD  (20%)
  0.40,  // realm_id 14: KD→NA  (40%)
  0.60,  // realm_id 17: NA→HT  (60%)
  0.70,  // realm_id 20: HT→LH  (70%)
  0.75,  // realm_id 23: LH→VD  (75%)
  0.80,  // realm_id 26: VD→DT  (80%)
  0.85,  // realm_id 29: DT→BT  (85%)
  0.88,  // realm_id 32: BT→ĐịaT(88%)
  0.90,  // realm_id 35: ĐịaT→CT(90%)
  0.93,  // realm_id 38: CT→ĐLT (93%)
] as const;

/**
 * i18n key suffix for each tier within a major realm.
 * Luyện Khí uses "tang_N" naming; all others use "so_ky/trung_ky/hau_ky".
 */
const LUYEN_KHI_TIER_KEYS = [
  'tang_1', 'tang_2', 'tang_3', 'tang_4', 'tang_5',
  'tang_6', 'tang_7', 'tang_8', 'tang_9',
] as const;

const STANDARD_TIER_KEYS = ['so_ky', 'trung_ky', 'hau_ky'] as const;

/** Major realm i18n key prefixes (majorRealmIndex → i18n prefix) */
const MAJOR_REALM_PREFIXES = [
  'luyen_khi',   // 0
  'truc_co',     // 1
  'kim_dan',     // 2
  'nguyen_anh',  // 3
  'hoa_than',    // 4
  'luyen_hu',    // 5
  'van_dinh',    // 6
  'dai_thua',    // 7
  'ban_tien',    // 8
  'dia_tien',    // 9
  'chan_tien',   // 10
  'dai_la_tien', // 11
] as const;

/** Build cumulative entry thresholds for all 42 tiers */
function buildEntryThresholds(): number[] {
  const thresholds: number[] = [0]; // realm_id 0 starts at 0
  let cumulative = 0;
  for (let i = 0; i < 41; i++) {
    cumulative += TU_VI_TO_ADVANCE[i] as number;
    thresholds.push(cumulative);
  }
  return thresholds;
}

const ENTRY_THRESHOLDS = buildEntryThresholds();

/** Build full REALM_CONFIG array for all 42 tiers */
function buildRealmConfig(): RealmTier[] {
  const config: RealmTier[] = [];

  // Luyện Khí: realm_id 0–8, majorRealmIndex 0, 9 tiers
  for (let i = 0; i < 9; i++) {
    const realmId = i;
    const isBoundary = realmId === 8;
    const boundaryIdx = MAJOR_REALM_BOUNDARIES.indexOf(realmId);
    config.push({
      id: realmId,
      i18nKey: `game:realms.${MAJOR_REALM_PREFIXES[0]}.${LUYEN_KHI_TIER_KEYS[i]}`,
      majorRealmIndex: 0,
      tierInMajor: i,
      isMajorBoundary: isBoundary,
      failureChance: isBoundary ? (BOUNDARY_FAILURE_CHANCES[boundaryIdx] ?? 0) : 0,
      entryThreshold: ENTRY_THRESHOLDS[realmId] ?? 0,
      tuViRequired: TU_VI_TO_ADVANCE[realmId] as number,
    });
  }

  // Trúc Cơ through Đại La Tiên: realm_id 9–41, majorRealmIndex 1–11, 3 tiers each
  for (let majorIdx = 1; majorIdx <= 11; majorIdx++) {
    for (let tierInMajor = 0; tierInMajor < 3; tierInMajor++) {
      const realmId = 9 + (majorIdx - 1) * 3 + tierInMajor;
      const isBoundary = MAJOR_REALM_BOUNDARIES.includes(realmId);
      const boundaryIdx = MAJOR_REALM_BOUNDARIES.indexOf(realmId);
      config.push({
        id: realmId,
        i18nKey: `game:realms.${MAJOR_REALM_PREFIXES[majorIdx]}.${STANDARD_TIER_KEYS[tierInMajor]}`,
        majorRealmIndex: majorIdx,
        tierInMajor,
        isMajorBoundary: isBoundary,
        failureChance: isBoundary ? (BOUNDARY_FAILURE_CHANCES[boundaryIdx] ?? 0) : 0,
        entryThreshold: ENTRY_THRESHOLDS[realmId] ?? 0,
        tuViRequired: TU_VI_TO_ADVANCE[realmId] as number,
      });
    }
  }

  return config;
}

/** Full configuration for all 42 realm tiers */
export const REALM_CONFIG: readonly RealmTier[] = buildRealmConfig();
