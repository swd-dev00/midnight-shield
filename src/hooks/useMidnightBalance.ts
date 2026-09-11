import { useCallback } from 'react'
import type { MidnightWalletApi } from '@via-labs-tech/usdm-bridge'
import { MIDNIGHT_NETWORK_ID, MIDNIGHT_USDM_TOKEN_COLOR } from '../config'
import { useWalletBalance } from './useWalletBalance'

async function readBalance(api: MidnightWalletApi) {
  if ((await api.getConfiguration()).networkId !== MIDNIGHT_NETWORK_ID) throw new Error('Midnight network mismatch: reconnect on Preview')
  const [unshielded, dust] = await Promise.all([api.getUnshieldedBalances(), api.getDustBalance()])
  const units = unshielded[MIDNIGHT_USDM_TOKEN_COLOR] ?? 0n
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('USDM balance exceeds supported precision')
  return { usdm: Number(units) / 1e6, dust: Number(dust.balance) / 1e15 }
}
export function useMidnightBalance(api: MidnightWalletApi | null, address: string | null) {
  const read = useCallback(async (wallet: MidnightWalletApi) => {
    const currentAddress = (await wallet.getUnshieldedAddress()).unshieldedAddress
    if (currentAddress !== address) throw new Error('Midnight account changed: reconnect your wallet')
    return readBalance(wallet)
  }, [address])
  return useWalletBalance(api, read)
}
