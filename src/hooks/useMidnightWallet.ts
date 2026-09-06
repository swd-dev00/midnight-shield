import { useCallback, useMemo, useState } from 'react'
import type { MidnightWalletApi } from '@via-labs-tech/usdm-bridge'
import { type InjectedWallet, useInjectedWallets } from './useInjectedWallets'
import { MIDNIGHT_NETWORK_ID } from '../config'

type MidnightInitialApi = {
  name?: string
  rdns?: string
  apiVersion?: string
  icon?: string
  connect?: (networkId: string) => Promise<MidnightWalletApi>
}

const CONNECTOR_V4 = /^4\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

const scanMidnight = () => window.midnight as Record<string, MidnightInitialApi> | undefined

const isConnectorV4 = (wallet: MidnightInitialApi) =>
  typeof wallet.connect === 'function' &&
  typeof wallet.apiVersion === 'string' &&
  CONNECTOR_V4.test(wallet.apiVersion)

export function useMidnightWallet() {
  const injectedWallets = useInjectedWallets<MidnightInitialApi>(scanMidnight)
  const wallets = useMemo(() => injectedWallets.filter((wallet) => isConnectorV4(wallet.api)), [injectedWallets])

  const [name, setName] = useState<string | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [rdns, setRdns] = useState<string | null>(null)
  const [apiVersion, setApiVersion] = useState<string | null>(null)
  const [api, setApi] = useState<MidnightWalletApi | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [networkId, setNetworkId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const compatibilityWarnings = useMemo(() => {
    const warnings: string[] = []
    const incompatibleCount = injectedWallets.length - wallets.length
    if (incompatibleCount > 0) {
      warnings.push(
        `${incompatibleCount} injected Midnight provider${incompatibleCount === 1 ? '' : 's'} ignored because Connector API v4 was not advertised.`,
      )
    }

    const rdnsCounts = new Map<string, number>()
    for (const wallet of wallets) {
      const identity = wallet.api.rdns?.trim().toLowerCase()
      if (!identity) continue
      rdnsCounts.set(identity, (rdnsCounts.get(identity) ?? 0) + 1)
    }
    const duplicateIdentities = [...rdnsCounts.entries()].filter(([, count]) => count > 1).map(([identity]) => identity)
    if (duplicateIdentities.length > 0) {
      warnings.push(
        `Multiple Connector v4 entries report the same wallet identity (${duplicateIdentities.join(', ')}). Verify the provider you authorize.`,
      )
    }

    return warnings
  }, [injectedWallets.length, wallets])

  const connect = useCallback(async (wallet: InjectedWallet<MidnightInitialApi>) => {
    setConnecting(true)
    setError(null)
    setApi(null)
    setAddress(null)
    setName(null)
    setLabel(null)
    setRdns(null)
    setApiVersion(null)
    setNetworkId(null)

    try {
      if (!isConnectorV4(wallet.api)) {
        throw new Error(
          `"${wallet.label}" is not a supported Midnight Connector API v4 provider. ` +
          `Reported API version: ${wallet.api.apiVersion ?? 'missing'}.`,
        )
      }

      const connected = await wallet.api.connect!(MIDNIGHT_NETWORK_ID)

      const connectionStatus = await connected.getConnectionStatus()
      if (connectionStatus.status !== 'connected') {
        throw new Error('Midnight wallet connection was not established.')
      }
      if (connectionStatus.networkId !== MIDNIGHT_NETWORK_ID) {
        setNetworkId(connectionStatus.networkId)
        throw new Error(
          `Midnight network mismatch: VIA testnet requires "${MIDNIGHT_NETWORK_ID}"; ` +
          `the wallet connected to "${connectionStatus.networkId}".`,
        )
      }

      const configuration = await connected.getConfiguration()
      setNetworkId(configuration.networkId)
      if (configuration.networkId !== MIDNIGHT_NETWORK_ID) {
        throw new Error(
          `Midnight configuration mismatch: VIA testnet requires "${MIDNIGHT_NETWORK_ID}"; ` +
          `the wallet reports "${configuration.networkId}". Switch the wallet to Preview and reconnect.`,
        )
      }

      try {
        await connected.hintUsage?.([
          'getShieldedAddresses',
          'getUnshieldedAddress',
          'getUnshieldedBalances',
          'getDustBalance',
          'getConfiguration',
          'getProvingProvider',
          'balanceUnsealedTransaction',
          'submitTransaction',
        ])
      } catch {
        // Permission hints are advisory; compatible wallets may prompt per call.
      }

      const unshielded = await connected.getUnshieldedAddress()
      if (!unshielded?.unshieldedAddress) {
        throw new Error('Midnight wallet connected but did not return an unshielded address.')
      }

      setAddress(unshielded.unshieldedAddress)
      setApi(connected)
      // `name` is the registry key under window.midnight. VIA bridgeUSDM() needs this exact key.
      setName(wallet.name)
      setLabel(wallet.label)
      setRdns(wallet.api.rdns ?? null)
      setApiVersion(wallet.api.apiVersion ?? null)
    } catch (err) {
      setApi(null)
      setAddress(null)
      setName(null)
      setLabel(null)
      setRdns(null)
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
    rdns,
    apiVersion,
    api,
    address,
    networkId,
    compatibilityWarnings,
    error,
  }
}

export type MidnightWallet = ReturnType<typeof useMidnightWallet>
