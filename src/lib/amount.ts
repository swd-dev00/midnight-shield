/** USDM has six decimal places. Keep monetary validation in integer base units. */
export function usdmToBaseUnits(value: string): bigint {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) {
    throw new Error('Enter a USDM amount with at most 6 decimal places')
  }
  const [whole, fraction = ''] = normalized.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  if (units <= 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Enter a positive amount within the supported balance range')
  }
  return units
}

export function validUsdmAmount(value: string): boolean {
  try { usdmToBaseUnits(value); return true } catch { return false }
}
