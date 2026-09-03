import { useCallback, useState } from 'react'
import type { MidnightWalletApi } from '@via-labs-tech/usdm-bridge'
import { useInjectedWallets } from './useInjectedWallets'
import { MIDNIGHT_NETWORK_ID } from '../config'

export function useMidnightWallet() {
  const wallets = useInjectedWallets(() => window.midnight)
  const [name, setName] = useState<string | null>(null)
  const [api, setApi] = useState<MidnightWalletApi | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async (wallet: { name: string; label?: string; api: { connect(networkId: string): Promise<MidnightWalletApi> } }) => {
    setConnecting(true)
    setError(null)
    try {
      if (typeof wallet.api.connect !== 'function') {
        throw new Error(`"${wallet.label ?? wallet.name}" does not expose connect() — connector API v4 required`)
      }
      const connected = await wallet.api.connect(MIDNIGHT_NETWORK_ID)
      try {
        await connected.hintUsage?.([
          'getShieldedAddresses', 'getUnshieldedAddress', 'getUnshieldedBalances',
          'getDustBalance', 'getConfiguration', 'getProvingProvider',
          'balanceUnsealedTransaction', 'submitTransaction',
        ])
      } catch { /* wallet can prompt per call */ }
      setAddress((await connected.getUnshieldedAddress()).unshieldedAddress)
      setApi(connected)
      setName(wallet.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }, [])

  return { wallets, connect, connecting, name, api, address, error }
}

export type MidnightWallet = ReturnType<typeof useMidnightWallet>
