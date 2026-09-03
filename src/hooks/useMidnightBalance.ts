import { useCallback, useEffect, useState } from 'react'
import type { MidnightWalletApi } from '@via-labs-tech/usdm-bridge'
import { MIDNIGHT_USDM_TOKEN_COLOR } from '../config'

export function useMidnightBalance(api: MidnightWalletApi | null) {
  const [balance, setBalance] = useState<{ usdm: number; dust: number } | null>(null)
  const refresh = useCallback(async () => {
    if (!api) return
    const [unshielded, dust] = await Promise.all([api.getUnshieldedBalances(), api.getDustBalance()])
    setBalance({
      usdm: Number(unshielded[MIDNIGHT_USDM_TOKEN_COLOR] ?? 0n) / 1e6,
      dust: Number(dust.balance) / 1e15,
    })
  }, [api])
  useEffect(() => { void refresh() }, [refresh])
  return { balance, refresh }
}
