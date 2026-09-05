import { useCallback, useEffect, useState } from 'react'
import { CARDANO_USDM_UNIT } from '../config'
import { addressHexToBech32, decodeBalance, deriveEnterpriseAddress } from '../lib/cardanoWallet'
import type { CardanoWalletApi } from './useCardanoWallet'

type KoiosAsset = {
  policy_id: string
  asset_name: string
  quantity: string
}

type KoiosAddressAssets = {
  address: string
  asset_list?: KoiosAsset[] | null
}

const CARDANO_USDM_POLICY_ID = CARDANO_USDM_UNIT.slice(0, 56)
const CARDANO_USDM_ASSET_NAME = CARDANO_USDM_UNIT.slice(56)

const usdmAtAddress = (rows: KoiosAddressAssets[], address: string): bigint => {
  const row = rows.find((item) => item.address === address)
  return (row?.asset_list ?? [])
    .filter((asset) => (
      asset.policy_id === CARDANO_USDM_POLICY_ID &&
      asset.asset_name === CARDANO_USDM_ASSET_NAME
    ))
    .reduce((sum, asset) => sum + BigInt(asset.quantity), 0n)
}

export type CardanoBalanceSnapshot = {
  /** ADA visible through the connected CIP-30 wallet. */
  ada: number
  /**
   * Evidence-bearing USDM total across the Cardano base and VIA enterprise
   * release addresses. Null means that chain observation is unavailable.
   */
  usdm: number | null
  /** USDM reported by the connected wallet itself. Diagnostic only. */
  baseUsdm: number
  /** On-chain USDM at the wallet's normal Cardano address. */
  chainBaseUsdm: number | null
  /** On-chain USDM at the derived VIA release address. */
  enterpriseUsdm: number | null
  /** True only when both Cardano addresses were successfully queried. */
  releaseAware: boolean
  enterpriseAddress: string | null
}

export function useCardanoBalance(api: CardanoWalletApi | null) {
  const [balance, setBalance] = useState<CardanoBalanceSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!api) {
      setBalance(null)
      setError(null)
      return
    }

    const walletValue = decodeBalance(await api.getBalance())
    const baseAda = Number(walletValue.lovelace) / 1e6
    const walletReportedUsdm = Number(walletValue.usdm) / 1e6

    let baseAddress: string | null = null
    let enterpriseAddress: string | null = null

    try {
      baseAddress = addressHexToBech32(await api.getChangeAddress())
      enterpriseAddress = deriveEnterpriseAddress(baseAddress)

      // The Vite/deployed app proxies this same-origin route to Cardano Preprod
      // Koios. Query both addresses directly so a successful Midnight → Cardano
      // release cannot be missed merely because the wallet UI omits enterprise
      // address UTxOs.
      const response = await fetch('/koios/address_assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ _addresses: [baseAddress, enterpriseAddress] }),
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Koios address_assets returned HTTP ${response.status}`)
      }

      const rows = await response.json() as KoiosAddressAssets[]
      if (!Array.isArray(rows)) {
        throw new Error('Koios address_assets returned an unexpected response')
      }

      const chainBase = usdmAtAddress(rows, baseAddress)
      const enterprise = usdmAtAddress(rows, enterpriseAddress)
      const total = chainBase + enterprise

      setBalance({
        ada: baseAda,
        usdm: Number(total) / 1e6,
        baseUsdm: walletReportedUsdm,
        chainBaseUsdm: Number(chainBase) / 1e6,
        enterpriseUsdm: Number(enterprise) / 1e6,
        releaseAware: true,
        enterpriseAddress,
      })
      setError(null)
    } catch (err) {
      // Never let the normal wallet balance masquerade as reverse-leg arrival
      // evidence. We keep it for source diagnostics, but the evidence-bearing
      // Cardano total stays unavailable until both addresses are observable.
      setBalance({
        ada: baseAda,
        usdm: null,
        baseUsdm: walletReportedUsdm,
        chainBaseUsdm: null,
        enterpriseUsdm: null,
        releaseAware: false,
        enterpriseAddress,
      })
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  return { balance, refresh, error }
}
