/** Compare integer micro-USDM without granting a tolerance of one whole base unit. */
export function hasArrived(balance: number, target: number): boolean {
  return Number.isFinite(balance) && Number.isFinite(target) && Math.round(balance * 1e6) >= Math.round(target * 1e6)
}
