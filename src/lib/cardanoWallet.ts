import { bech32 } from 'bech32'
import { CARDANO_USDM_UNIT } from '../config'

const hexToBytes = (hex: string): Uint8Array =>
  new Uint8Array(hex.match(/../g)?.map((b) => parseInt(b, 16)) ?? [])

export function addressHexToBech32(addressHex: string): string {
  const bytes = hexToBytes(addressHex)
  const isMainnet = (bytes[0] & 0x0f) === 1
  return bech32.encode(isMainnet ? 'addr' : 'addr_test', bech32.toWords(bytes), 1000)
}

class CborReader {
  private i = 0
  constructor(private readonly bytes: Uint8Array) {}

  private byte(): number { return this.bytes[this.i++] }

  private uint(info: number): bigint {
    if (info < 24) return BigInt(info)
    const sizes: Record<number, number> = { 24: 1, 25: 2, 26: 4, 27: 8 }
    const n = sizes[info]
    if (!n) throw new Error(`Unsupported CBOR length info ${info}`)
    let value = 0n
    for (let k = 0; k < n; k++) value = (value << 8n) | BigInt(this.byte())
    return value
  }

  read(): bigint | Uint8Array | unknown[] | Map<string, unknown> {
    const head = this.byte()
    const major = head >> 5
    const info = head & 31
    switch (major) {
      case 0: return this.uint(info)
      case 2: {
        const len = Number(this.uint(info))
        const out = this.bytes.slice(this.i, this.i + len)
        this.i += len
        return out
      }
      case 4: {
        const len = Number(this.uint(info))
        return Array.from({ length: len }, () => this.read())
      }
      case 5: {
        const len = Number(this.uint(info))
        const map = new Map<string, unknown>()
        for (let k = 0; k < len; k++) {
          const key = this.read()
          const hex = key instanceof Uint8Array ? bytesToHex(key) : String(key)
          map.set(hex, this.read())
        }
        return map
      }
      case 6:
        this.uint(info)
        return this.read()
      default:
        throw new Error(`Unsupported CBOR major type ${major}`)
    }
  }
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export function decodeBalance(balanceCborHex: string): { lovelace: bigint; usdm: bigint } {
  const value = new CborReader(hexToBytes(balanceCborHex)).read()
  if (typeof value === 'bigint') return { lovelace: value, usdm: 0n }
  if (!Array.isArray(value)) throw new Error('Unexpected balance CBOR shape')

  const [coin, multiasset] = value as [bigint, Map<string, Map<string, bigint>>]
  const policyId = CARDANO_USDM_UNIT.slice(0, 56)
  const assetName = CARDANO_USDM_UNIT.slice(56)
  const assets = multiasset?.get?.(policyId)
  return { lovelace: coin, usdm: assets?.get(assetName) ?? 0n }
}
