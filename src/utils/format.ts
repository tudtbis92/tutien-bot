/**
 * Format a BigInt balance value for display in Discord messages.
 * Uses locale-aware number formatting with thousand separators.
 * NEVER pass BigInt directly to string templates — always use this helper.
 *
 * @example formatBalance(1234567n) → "1,234,567"
 */
export function formatBalance(amount: bigint): string {
  // Convert to string then format with Number for locale formatting
  // Safe up to Number.MAX_SAFE_INTEGER — for larger values use custom formatter
  if (amount <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(amount).toLocaleString('en-US');
  }
  // For very large values: manual thousand-separator insertion
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
