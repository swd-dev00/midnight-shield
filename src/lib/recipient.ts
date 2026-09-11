import { bech32, bech32m } from 'bech32'

/** Require network-bearing Preview addresses; raw keys cannot prove a network. */
export function midnightRecipientBytes(value: string): Uint8Array {
  const decoded = bech32m.decode(value.trim(), 1000)
  const bytes = Uint8Array.from(bech32m.fromWords(decoded.words))
  if (decoded.prefix !== 'mn_addr_preview' || bytes.length !== 32) {
    throw new Error('Use a Midnight Preview unshielded address')
  }
  return bytes
}

export function validRecipient(value: string, direction: 'cardano-to-midnight' | 'midnight-to-cardano'): boolean {
  try {
    if (direction === 'cardano-to-midnight') { midnightRecipientBytes(value); return true }
    const decoded = bech32.decode(value.trim(), 1000)
    const bytes = bech32.fromWords(decoded.words)
    const type = bytes[0] >> 4
    return decoded.prefix === 'addr_test' && (bytes[0] & 15) === 0 &&
      ((type <= 3 && bytes.length === 57) || ((type === 6 || type === 7) && bytes.length === 29))
  } catch { return false }
}
