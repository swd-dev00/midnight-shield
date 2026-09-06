import { useCallback, useEffect, useState } from 'react'
import { CARDANO_USDM_UNIT } from '../config'

const policyId = CARDANO_USDM_UNIT.slice(0, 56)
const assetName = CARDANO_USDM_UNIT.slice(56)

type KoiosAsset = {
  policy_id?: string
  asset_name?: string
  quantity?: string | number
}

type KoiosAddressInfo = {
  balance?: string | number
  asset_list?: KoiosAsset[]
}

export function useCardanoAddressBalance(address: string | null) {
  const [balance, setBalance] = useState<{ ada: number; usdm: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(null)
      setError(null)
      return
    }

    try {
      const response = await fetch('/koios/address_info', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ _addresses: [address] }),
      })
      if (!response.ok) throw new Error(`Koios address_info HTTP ${response.status}`)

      const rows = await response.json() as KoiosAddressInfo[]
      const info = rows[0]
      const usdmAsset = info?.asset_list?.find((asset) =>
        asset.policy_id === policyId && asset.asset_name === assetName,
      )

      setBalance({
        ada: Number(info?.balance ?? 0) / 1e6,
        usdm: Number(usdmAsset?.quantity ?? 0) / 1e6,
      })
      setError(null)
    } catch (err) {
      setBalance(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [address])

  useEffect(() => { void refresh() }, [refresh])

  return { balance, error, refresh }
}
