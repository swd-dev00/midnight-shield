import { useCallback, useMemo, useState } from 'react'
import type { getLucidWithWallet } from '@via-labs-tech/usdm-bridge'
import { type InjectedWallet, useInjectedWallets } from './useInjectedWallets'
import { addressHexToBech32, deriveEnterpriseAddress } from '../lib/cardanoWallet'
import { NOT_CARDANO } from '../config'

export type CardanoWalletApi = Parameters<typeof getLucidWithWallet>[0]

type CardanoInitialApi = {
  name?: string
  apiVersion?: string
  icon?: string
  enable?: () => Promise<unknown>
}

type CardanoConnectedApi = CardanoWalletApi & {
  getNetworkId(): Promise<number>
  getChangeAddress(): Promise<string>
}

const scanCardano = () => window.cardano as Record<string, CardanoInitialApi> | undefined
const isCip30 = (wallet: CardanoInitialApi) => typeof wallet.enable === 'function'

export function useCardanoWallet() {
  const injectedWallets = useInjectedWallets<CardanoInitialApi>(scanCardano, NOT_CARDANO)
  const wallets = useMemo(() => injectedWallets.filter((wallet) => isCip30(wallet.api)), [injectedWallets])

  const [name, setName] = useState<string | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [apiVersion, setApiVersion] = useState<string | null>(null)
  const [api, setApi] = useState<CardanoWalletApi | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [enterpriseAddress, setEnterpriseAddress] = useState<string | null>(null)
  const [networkId, setNetworkId] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async (wallet: InjectedWallet<CardanoInitialApi>) => {
    setConnecting(true)
    setError(null)
    setApi(null)
    setAddress(null)
    setEnterpriseAddress(null)
    setName(null)
    setLabel(null)
    setApiVersion(null)
    setNetworkId(null)

    try {
      if (!isCip30(wallet.api)) {
        throw new Error(`"${wallet.label}" does not expose CIP-30 enable().`)
      }

      const connected = (await wallet.api.enable!()) as CardanoConnectedApi
      const reportedNetworkId = await connected.getNetworkId()
      setNetworkId(reportedNetworkId)

      // CIP-30 exposes only mainnet (1) vs testnet (0). Cardano Preprod is a testnet,
      // so this blocks accidental mainnet use while the configured VIA route fixes the
      // actual testnet pair to Cardano Preprod ↔ Midnight Preview.
      if (reportedNetworkId !== 0) {
        throw new Error(
          `Cardano network mismatch: VIA sprint testing requires Cardano Preprod/testnet (CIP-30 network id 0); ` +
          `the wallet reported network id ${reportedNetworkId}. Do not use mainnet.`,
        )
      }

      const changeAddressHex = await connected.getChangeAddress()
      if (!changeAddressHex) {
        throw new Error('Cardano wallet connected but did not return a change address.')
      }

      const walletAddress = addressHexToBech32(changeAddressHex)
      setAddress(walletAddress)
      setEnterpriseAddress(deriveEnterpriseAddress(walletAddress))
      setApi(connected)
      // `name` is the registry key under window.cardano. VIA bridgeUSDM() needs this exact key.
      setName(wallet.name)
      setLabel(wallet.label)
      setApiVersion(wallet.api.apiVersion ?? null)
    } catch (err) {
      setAddress(null)
      setEnterpriseAddress(null)
      setApi(null)
      setName(null)
      setLabel(null)
      setApiVersion(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }, [])

  return {
    wallets,
    connect,
    connecting,
    name,
    label,
    apiVersion,
    api,
    address,
    enterpriseAddress,
    networkId,
    error,
  }
}

export type CardanoWallet = ReturnType<typeof useCardanoWallet>
