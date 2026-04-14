/**
 * Gather fee constants and major realm index mapping.
 *
 * Source: CONTEXT.md D-02, ITEM-CATALOG.md "Gather fee table"
 *
 * Fee scales with major realm:
 *   LK 200 → TC 400 → KD 800 → NA 1,500 → HT 3,000 → LH 6,000
 *   → VĐ 12,000 → ĐT 25,000 → BT 50,000 → ĐTi 100,000 → CT 200,000 → ĐLT 400,000
 *
 * EV invariant: 99.8%+ net loss at all fee tiers (D-04).
 */

/**
 * Gather fees indexed by major realm index (0 = Luyện Khí, 11 = Đại La Tiên).
 * Stored as bigint to match tu_vi column type.
 */
export const GATHER_FEES: readonly bigint[] = [
  200n,     // 0: Luyện Khí
  400n,     // 1: Trúc Cơ
  800n,     // 2: Kim Đan
  1_500n,   // 3: Nguyên Anh
  3_000n,   // 4: Hóa Thần
  6_000n,   // 5: Luyện Hư
  12_000n,  // 6: Vấn Đỉnh
  25_000n,  // 7: Đại Thừa
  50_000n,  // 8: Bán Tiên
  100_000n, // 9: Địa Tiên
  200_000n, // 10: Chân Tiên
  400_000n, // 11: Đại La Tiên
] as const;

/**
 * Compute the major realm index from a realm_id.
 *
 * Mapping:
 *  - realm_id 0–8 (Luyện Khí tầng 1–9) → index 0
 *  - realm_id 9–11 (Trúc Cơ Sơ/Trung/Hậu Kỳ) → index 1
 *  - realm_id 12–14 (Kim Đan) → index 2
 *  - realm_id 15–17 (Nguyên Anh) → index 3
 *  - ...continuing in groups of 3...
 *  - realm_id 39–41 (Đại La Tiên) → index 11
 *
 * @param realmId character realm_id (0–41)
 */
export function getMajorRealmIndex(realmId: number): number {
  if (realmId < 9) return 0;
  return Math.min(11, Math.floor((realmId - 9) / 3) + 1);
}
