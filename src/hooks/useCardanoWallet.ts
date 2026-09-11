import { walletErrorMessage, type WalletConnectionFailure } from '../lib/walletConnection'
import { useCallback, useState } from 'react'
import type { getLucidWithWallet } from '@via-labs-tech/usdm-bridge'
import { useInjectedWallets } from './useInjectedWallets'
import { addressHexToBech32 } from '../lib/cardanoWallet'

export type CardanoWalletApi = Parameters<typeof getLucidWithWallet>[0]

export function useCardanoWallet() {
  const { wallets, refresh } = useInjectedWallets(() => window.cardano, wallet => typeof wallet.enable === 'function')
  const [name, setName] = useState<string | null>(null)
  const [api, setApi] = useState<CardanoWalletApi | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<WalletConnectionFailure | null>(null)

  const connect = useCallback(async (wallet: { name: string; api: { enable(): Promise<unknown> } }) => {
    setConnecting(true)
    setError(null)
    setFailure(null)
    let step = 'Request connection'
    setApi(null)
    setAddress(null)
    setName(null)
    try {
      const candidate = await wallet.api.enable()
      step = 'Validate authorized Cardano API'
      // A provider name does not prove support. Check its authorized API before reading funds.
      const required = ['getNetworkId', 'getChangeAddress', 'getBalance', 'getUtxos', 'signTx', 'submitTx']
      if (!candidate || typeof candidate !== 'object' || required.some(method =>
        typeof (candidate as Record<string, unknown>)[method] !== 'function',
      )) throw new Error('This wallet does not provide the Cardano connection and signing features needed here. Connect a Cardano-compatible wallet on Preprod. You can still connect your Midnight wallet separately.')
      const connected = candidate as CardanoWalletApi
      step = 'Read Cardano network'
      if (await connected.getNetworkId() !== 0) throw new Error('Cardano network mismatch: switch your wallet to Preprod')
      step = 'Read Cardano address'
      const address = addressHexToBech32(await connected.getChangeAddress())
      if (!address.startsWith('addr_test1')) throw new Error('Cardano testnet address required')
      setAddress(address)
      setApi(connected)
      setName(wallet.name)
    } catch (err) {
      setError(walletErrorMessage(err))
      setFailure({ provider: wallet.name, step })
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => { setApi(null); setAddress(null); setName(null); setError(null); setFailure(null);  }, [])

  return { failure, disconnect, refresh, wallets, connect, connecting, name, api, address, error }
}

export type CardanoWallet = ReturnType<typeof useCardanoWallet>
