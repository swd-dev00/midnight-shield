import { walletErrorMessage, type WalletConnectionFailure } from '../lib/walletConnection'
import { useCallback, useState } from 'react'
import type { MidnightWalletApi } from '@via-labs-tech/usdm-bridge'
import { useInjectedWallets } from './useInjectedWallets'
import { MIDNIGHT_NETWORK_ID } from '../config'

export function useMidnightWallet() {
  const { wallets, refresh } = useInjectedWallets(() => window.midnight)
  const [name, setName] = useState<string | null>(null)
  const [api, setApi] = useState<MidnightWalletApi | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [networkId, setNetworkId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<WalletConnectionFailure | null>(null)

  const connect = useCallback(async (wallet: { name: string; label?: string; api: { connect(networkId: string): Promise<MidnightWalletApi> } }) => {
    setConnecting(true)
    setError(null)
    setFailure(null)
    let step = 'Request connection'
    setApi(null)
    setAddress(null)
    setName(null)
    setNetworkId(null)

    try {
      if (typeof wallet.api.connect !== 'function') {
        throw new Error(`"${wallet.label ?? wallet.name}" does not expose connect() — connector API v4 required`)
      }

      const connected = await wallet.api.connect(MIDNIGHT_NETWORK_ID)
      step = 'Read Midnight configuration'
      const configuration = await connected.getConfiguration()
      const reportedNetworkId = configuration.networkId
      setNetworkId(reportedNetworkId)

      if (reportedNetworkId !== MIDNIGHT_NETWORK_ID) {
        throw new Error(
          `Midnight network mismatch: VIA testnet requires "${MIDNIGHT_NETWORK_ID}"; ` +
          `the wallet reported "${reportedNetworkId}". Switch the wallet to Preview and reconnect.`,
        )
      }

      try {
        await connected.hintUsage?.([
          'getShieldedAddresses', 'getUnshieldedAddress', 'getUnshieldedBalances',
          'getDustBalance', 'getConfiguration', 'getProvingProvider',
          'balanceUnsealedTransaction', 'submitTransaction',
        ])
      } catch { /* wallet can prompt per call */ }

      step = 'Read Midnight address'
      setAddress((await connected.getUnshieldedAddress()).unshieldedAddress)
      setApi(connected)
      setName(wallet.name)
    } catch (err) {
      setError(walletErrorMessage(err))
      setFailure({ provider: wallet.name, step })
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => { setApi(null); setAddress(null); setName(null); setError(null); setFailure(null); setNetworkId(null); }, [])

  return { failure, disconnect, refresh, wallets, connect, connecting, name, api, address, networkId, error }
}

export type MidnightWallet = ReturnType<typeof useMidnightWallet>
