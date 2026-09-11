import { describeWalletProviders, walletConnectionGuidance, type WalletConnectionFailure } from '../lib/walletConnection'
import { useState } from 'react'
import type { InjectedWallet } from '../hooks/useInjectedWallets'

type Props<T> = {
  chain: 'Cardano' | 'Midnight'
  wallets: InjectedWallet<T>[]
  connectedLabel: string | null
  connecting: boolean
  locked: boolean
  error: string | null
  failure?: WalletConnectionFailure | null
  refresh: () => InjectedWallet<T>[]
  connect: (wallet: InjectedWallet<T>) => Promise<void>
}

export function WalletConnection<T>({ chain, wallets, connectedLabel, connecting, locked, error, failure, refresh, connect }: Props<T>) {
  const [showHelp, setShowHelp] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [diagnosticCopyStatus, setDiagnosticCopyStatus] = useState('')
  const address = window.location.origin + window.location.pathname
  const search = () => {
    const found = refresh()
    setShowHelp(found.length === 0)
    if (found.length === 1) void connect(found[0])
  }
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopyStatus('App address copied. Paste it into the browser with your wallet.')
    } catch {
      setCopyStatus('Select and copy the app address below.')
    }
  }

  const diagnosticReport = JSON.stringify({
    chain, origin: window.location.origin, secureContext: window.isSecureContext,
    requestedNetwork: chain === 'Midnight' ? 'preview' : 'preprod',
    failure: failure ? { ...failure, message: error } : null,
    providers: describeWalletProviders(chain === 'Midnight' ? window.midnight : window.cardano),
    offeredProviders: wallets.map(wallet => ({ key: wallet.name, aliases: wallet.aliases })),
  }, null, 2)
  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticReport)
      setDiagnosticCopyStatus('Connection details copied.')
    } catch { setDiagnosticCopyStatus('Select and copy the details shown below.') }
  }

  return <div className="wallet-actions">
    {connectedLabel ? <span className="connected-label">{connectedLabel}</span> : wallets.length ? wallets.map(wallet => (
      <button type="button" key={wallet.name} onClick={() => void connect(wallet)} disabled={connecting || locked}>
        {connecting ? 'Connecting…' : `Connect ${wallet.label}`}
      </button>
    )) : <>
      <button type="button" onClick={search} disabled={connecting || locked}>Connect {chain} wallet</button>
      <p className="wallet-empty">No {chain} wallet detected in this browser.</p>
      {showHelp && <div className="wallet-setup">
        <p role="status">{chain === 'Midnight'
          ? 'Open this app in the browser where 1AM or your other Midnight wallet is installed. Enable and unlock the extension, choose Preview, then try again.'
          : 'Open this app in the browser where your Cardano wallet is installed. Enable and unlock the extension, choose Preprod, then try again.'}</p>
        <label>App address<input id={`${chain.toLowerCase()}-app-address`} name={`${chain.toLowerCase()}-app-address`} aria-label={`${chain} wallet app address`} readOnly value={address} onFocus={event => event.currentTarget.select()} /></label>
        <button type="button" onClick={() => void copyAddress()}>Copy app address</button>
        <span role="status">{copyStatus}</span>
        <button type="button" onClick={search} disabled={connecting || locked}>Check for {chain} wallets again</button>
      </div>}
    </>}
    {error && <p className="wallet-connection-error" role="alert">{walletConnectionGuidance(error)}</p>}
    {(wallets.length > 0 || error) && <details className="wallet-diagnostics" aria-label={`${chain} connection details`}>
      <summary>Connection details</summary>
      <p>Provider information and the failed connection step. No wallet accounts or balances are read.</p>
      <button type="button" onClick={() => void copyDiagnostics()}>Copy connection details</button>
      <span role="status">{diagnosticCopyStatus}</span>
      <pre>{diagnosticReport}</pre>
    </details>}
  </div>
}
