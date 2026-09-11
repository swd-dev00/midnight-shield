import { useCallback } from 'react'
import { addressHexToBech32, decodeBalance } from '../lib/cardanoWallet'
import type { CardanoWalletApi } from './useCardanoWallet'
import { useWalletBalance } from './useWalletBalance'

async function readBalance(api: CardanoWalletApi) {
  if (await api.getNetworkId() !== 0) throw new Error('Cardano network mismatch: reconnect on Preprod')
  const { lovelace, usdm } = decodeBalance(await api.getBalance())
  if (usdm > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('USDM balance exceeds supported precision')
  return { ada: Number(lovelace) / 1e6, usdm: Number(usdm) / 1e6 }
}
export function useCardanoBalance(api: CardanoWalletApi | null, address: string | null) {
  const read = useCallback(async (wallet: CardanoWalletApi) => {
    const currentAddress = addressHexToBech32(await wallet.getChangeAddress())
    if (currentAddress !== address) throw new Error('Cardano account changed: reconnect your wallet')
    return readBalance(wallet)
  }, [address])
  return useWalletBalance(api, read)
}
