import { useEffect, useState } from 'react'

export interface InjectedWallet<T> {
  name: string
  label: string
  api: T
}

export function useInjectedWallets<T extends { name?: string }>(
  scan: () => Record<string, T> | undefined,
  exclude?: RegExp,
): InjectedWallet<T>[] {
  const [wallets, setWallets] = useState<InjectedWallet<T>[]>([])

  useEffect(() => {
    const run = () => {
      const discovered = Object.entries(scan() ?? {})
        .filter(([name, wallet]) => !exclude || (!exclude.test(name) && !exclude.test(wallet?.name ?? '')))
        .map(([name, wallet]) => ({ name, label: wallet?.name ?? name, api: wallet }))

      setWallets((current) => {
        const currentKey = current.map(({ name, label }) => `${name}:${label}`).join('|')
        const nextKey = discovered.map(({ name, label }) => `${name}:${label}`).join('|')
        return currentKey === nextKey ? current : discovered
      })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') run()
    }

    run()

    const startupTimers = [250, 1000, 3000].map((delay) => window.setTimeout(run, delay))
    const interval = window.setInterval(run, 2000)

    window.addEventListener('focus', run)
    window.addEventListener('wallet:rescan', run)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      startupTimers.forEach(window.clearTimeout)
      window.clearInterval(interval)
      window.removeEventListener('focus', run)
      window.removeEventListener('wallet:rescan', run)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // scan/exclude are expected to be stable module-level callbacks/values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return wallets
}
