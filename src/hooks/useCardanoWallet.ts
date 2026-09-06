import { useCallback, useState } from 'react'
import type { getLucidWithWallet } from '@via-labs-tech/usdm-bridge'
import { useInjectedWallets } from './useInjectedWallets'
import { addressHexToBech32, deriveEnterpriseAddress } from '../lib/cardanoWallet'
import { NOT_CARDANO } from '../config'

export type CardanoWalletApi = Parameters<typeof getLucidWithWallet>[0]

export function useCardanoWallet() {
  const wallets = useInjectedWallets(() => window.cardano, NOT_CARDANO)
  const [name, setName] = useState<string | null>(null)
  const [api, setApi] = useState<CardanoWalletApi | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [enterpriseAddress, setEnterpriseAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async (wallet: { name: string; api: { enable(): Promise<unknown> } }) => {
    setConnecting(true)
    setError(null)
    try {
      const connected = (await wallet.api.enable()) as CardanoWalletApi
      const walletAddress = addressHexToBech32(await connected.getChangeAddress())
      setAddress(walletAddress)
      setEnterpriseAddress(deriveEnterpriseAddress(walletAddress))
      setApi(connected)
      setName(wallet.name)
    } catch (err) {
      setAddress(null)
      setEnterpriseAddress(null)
      setApi(null)
      setName(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }, [])

  return { wallets, connect, connecting, name, api, address, enterpriseAddress, error }
}

export type CardanoWallet = ReturnType<typeof useCardanoWallet>
