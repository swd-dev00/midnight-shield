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
    const run = () => setWallets(
      Object.entries(scan() ?? {})
        .filter(([name, w]) => !exclude || (!exclude.test(name) && !exclude.test(w?.name ?? '')))
        .map(([name, w]) => ({ name, label: w?.name ?? name, api: w })),
    )
    run()
    const timers = [250, 1000, 3000].map((delay) => setTimeout(run, delay))
    return () => timers.forEach(clearTimeout)
  }, [])

  return wallets
}
