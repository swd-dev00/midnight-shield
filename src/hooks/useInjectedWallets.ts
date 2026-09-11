import { useCallback, useEffect, useRef, useState } from 'react'

import { discoverWalletProviders, type WalletProvider } from '../lib/walletConnection'

export type InjectedWallet<T> = WalletProvider<T>

export function useInjectedWallets<T extends { name?: string }>(
  scan: () => Record<string, T> | undefined,
  accept?: (wallet: T) => boolean,
) {
  const [wallets, setWallets] = useState<InjectedWallet<T>[]>([])
  const source = useRef({ scan, accept })
  source.current = { scan, accept }

  const refresh = useCallback(() => {
    const { scan, accept } = source.current
    const found = discoverWalletProviders(scan(), accept)
    setWallets(previous => previous.length === found.length && previous.every((wallet, index) =>
      wallet.name === found[index].name && wallet.label === found[index].label && wallet.api === found[index].api && wallet.aliases.join('\0') === found[index].aliases.join('\0'),
    ) ? previous : found)
    return found
  }, [])

  useEffect(() => {
    refresh()
    const whenVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(whenVisible, 2000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', whenVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', whenVisible)
    }
  }, [refresh])

  return { wallets, refresh }
}
