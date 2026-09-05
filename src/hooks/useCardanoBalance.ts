import { useCallback, useEffect, useState } from 'react'
import { getLucidWithWallet, getSpendableUtxos } from '@via-labs-tech/usdm-bridge'
import { CARDANO_USDM_UNIT } from '../config'
import { addressHexToBech32, decodeBalance, deriveEnterpriseAddress } from '../lib/cardanoWallet'
import type { CardanoWalletApi } from './useCardanoWallet'

export type CardanoBalanceSnapshot = {
  /** Spendable ADA reported across the wallet/VIA spendable set. */
  ada: number
  /** Total spendable USDM, including VIA release UTxOs at the enterprise address. */
  usdm: number
  /** USDM visible through the connected CIP-30 wallet balance. */
  baseUsdm: number
  /** USDM spendable outside the wallet-reported balance, normally the VIA release address. */
  enterpriseUsdm: number | null
  /** True only when the VIA spendable-UTxO query completed successfully. */
  releaseAware: boolean
  /** Derived enterprise address used for Midnight → Cardano release verification. */
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
    const baseUsdm = Number(walletValue.usdm) / 1e6

    let enterpriseAddress: string | null = null
    try {
      const changeAddress = addressHexToBech32(await api.getChangeAddress())
      enterpriseAddress = deriveEnterpriseAddress(changeAddress)

      // VIA's own spendable set includes released funds at the enterprise
      // address derived from the wallet payment credential. Using the package
      // helper keeps destination verification aligned with the bridge itself.
      const lucid = await getLucidWithWallet(api)
      const utxos = await getSpendableUtxos(lucid)

      let spendableLovelace = 0n
      let spendableUsdm = 0n
      for (const utxo of utxos) {
        spendableLovelace += utxo.assets.lovelace ?? 0n
        spendableUsdm += utxo.assets[CARDANO_USDM_UNIT] ?? 0n
      }

      const totalUsdm = Number(spendableUsdm) / 1e6
      setBalance({
        ada: Number(spendableLovelace) / 1e6,
        usdm: totalUsdm,
        baseUsdm,
        enterpriseUsdm: Math.max(0, totalUsdm - baseUsdm),
        releaseAware: true,
        enterpriseAddress,
      })
      setError(null)
    } catch (err) {
      // Never invent enterprise-address evidence. The wallet-only value is
      // still useful for ordinary source readiness, but reverse-leg arrival
      // must stay unverified until the VIA-aware spendable query succeeds.
      setBalance({
        ada: baseAda,
        usdm: baseUsdm,
        baseUsdm,
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
