import { useCallback, useEffect, useState } from 'react'
import { decodeBalance } from '../lib/cardanoWallet'
import type { CardanoWalletApi } from './useCardanoWallet'

export function useCardanoBalance(api: CardanoWalletApi | null) {
  const [balance, setBalance] = useState<{ ada: number; usdm: number } | null>(null)
  const refresh = useCallback(async () => {
    if (!api) return
    const { lovelace, usdm } = decodeBalance(await api.getBalance())
    setBalance({ ada: Number(lovelace) / 1e6, usdm: Number(usdm) / 1e6 })
  }, [api])
  useEffect(() => { void refresh() }, [refresh])
  return { balance, refresh }
}
