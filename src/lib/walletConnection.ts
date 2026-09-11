export interface WalletProvider<T> {
  name: string
  label: string
  api: T
  aliases: string[]
}

/** Collapse only identical provider objects, never wallets that merely share a name. */
export function discoverWalletProviders<T extends { name?: string }>(registry: Record<string, T> | undefined, accept?: (wallet: T) => boolean): WalletProvider<T>[] {
  const found: WalletProvider<T>[] = []
  for (const [name, api] of Object.entries(registry ?? {})) {
    if (!api || typeof api !== 'object' || (accept && !accept(api))) continue
    const alias = found.find(wallet => wallet.api === api)
    if (alias) alias.aliases.push(name)
    else found.push({ name, label: typeof api.name === 'string' && api.name.trim() ? api.name : name, api, aliases: [name] })
  }
  const counts = new Map<string, number>()
  for (const wallet of found) counts.set(wallet.label, (counts.get(wallet.label) ?? 0) + 1)
  return found.map(wallet => ({ ...wallet, label: (counts.get(wallet.label) ?? 0) > 1 ? `${wallet.label} (${wallet.name})` : wallet.label }))
}

export function walletErrorMessage(error: unknown, depth = 0): string {
  if (typeof error === 'string' && error.trim()) return error.slice(0, 2000)
  if (depth > 3 || !error || typeof error !== 'object') return 'The wallet did not provide an error description.'
  const record = error as Record<string, unknown>
  const details = ['message', 'info', 'reason', 'error'].map(key => record[key]).filter(value => value !== undefined)
  const message = details.map(value => walletErrorMessage(value, depth + 1)).find(value => value !== 'The wallet did not provide an error description.')
  const code = typeof record.code === 'number' || typeof record.code === 'string' ? String(record.code).slice(0, 80) : null
  return `${message ?? 'The wallet did not provide an error description.'}${code === null ? '' : ` (code ${code})`}`
}

export function walletConnectionGuidance(message: string): string {
  if (/no response.*background|background.*(?:unavailable|not respond)|timed? ?out|timeout/i.test(message)) {
    return 'The wallet was detected, but its connection service did not respond. If the wallet is syncing, let it finish, then reload this page and reconnect. If this continues, check the extension’s access to this site. Connection details are below.'
  }
  return message
}

export interface WalletConnectionFailure { provider: string; step: string }

/** Public injected metadata only: never calls enable/connect or reads wallet accounts. */
export function describeWalletProviders(registry: unknown) {
  if (!registry || typeof registry !== 'object') return []
  return Object.entries(registry).map(([key, value]) => {
    const provider = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    return {
      key, type: typeof value,
      name: typeof provider.name === 'string' ? provider.name : null,
      apiVersion: typeof provider.apiVersion === 'string' ? provider.apiVersion : null,
      icon: Boolean(provider.icon),
      enable: typeof provider.enable === 'function',
      isEnabled: typeof provider.isEnabled === 'function',
      connect: typeof provider.connect === 'function',
      keys: Object.keys(provider),
    }
  })
}
