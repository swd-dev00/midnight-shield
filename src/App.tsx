import { FormEvent, useEffect, useMemo, useState } from 'react'
import { NETWORK_LABEL, cardanoExplorerTxUrl, viaScanUrl } from './config'
import { explainBridgeError } from './lib/errors'
import { useCardanoWallet } from './hooks/useCardanoWallet'
import { useMidnightWallet } from './hooks/useMidnightWallet'
import { useCardanoBalance } from './hooks/useCardanoBalance'
import { useMidnightBalance } from './hooks/useMidnightBalance'
import { CARDANO_BRIDGE_STEPS, useCardanoBridge } from './hooks/useCardanoBridge'
import { MIDNIGHT_BRIDGE_STEPS, useMidnightBridge } from './hooks/useMidnightBridge'

type Direction = 'cardano-to-midnight' | 'midnight-to-cardano'
type Mode = 'simple' | 'advanced' | 'trace'
type CheckState = 'ready' | 'blocked' | 'pending'

const truncate = (value?: string | null, left = 10, right = 8) => {
  if (!value) return 'Not connected'
  if (value.length <= left + right + 3) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

const formatBalance = (value?: number | null) =>
  value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value)

const phaseCopy: Record<string, string> = {
  idle: 'Ready for intent',
  building: 'Constructing Cardano transaction',
  completing: 'Balancing transaction inputs',
  signing: 'Waiting for Cardano authorization',
  submitting: 'Submitting to Cardano',
  joining: 'Preparing Midnight gateway transaction',
  proving: 'Generating proof inside the Midnight wallet',
  confirming: 'Waiting for source-chain finality',
  done: 'Source accepted — VIA delivery continues',
}

function Check({ state, title, detail }: { state: CheckState; title: string; detail: string }) {
  return (
    <div className="check-row" data-state={state}>
      <span className="check-mark" aria-hidden="true">{state === 'ready' ? '✓' : state === 'blocked' ? '!' : '·'}</span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  )
}

export default function App() {
  const cardano = useCardanoWallet()
  const midnight = useMidnightWallet()
  const cardanoBalance = useCardanoBalance(cardano.api)
  const midnightBalance = useMidnightBalance(midnight.api)
  const cardanoBridge = useCardanoBridge(cardano.name)
  const midnightBridge = useMidnightBridge(midnight.name)

  const [direction, setDirection] = useState<Direction>('cardano-to-midnight')
  const [mode, setMode] = useState<Mode>('simple')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [manualRecipient, setManualRecipient] = useState(false)
  const [intentLabel, setIntentLabel] = useState('USDM settlement')
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    if (!manualRecipient) {
      setRecipient(direction === 'cardano-to-midnight' ? midnight.address ?? '' : cardano.address ?? '')
    }
  }, [direction, manualRecipient, midnight.address, cardano.address])

  useEffect(() => {
    setAttempted(false)
  }, [direction])

  const parsedAmount = Number(amount)
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0
  const sourceWalletConnected = direction === 'cardano-to-midnight' ? Boolean(cardano.api) : Boolean(midnight.api)
  const sourceBalance = direction === 'cardano-to-midnight' ? cardanoBalance.balance?.usdm : midnightBalance.balance?.usdm
  const sourceFeeBalance = direction === 'cardano-to-midnight' ? cardanoBalance.balance?.ada : midnightBalance.balance?.dust
  const sourceBalanceLoaded = sourceBalance != null
  const balanceEnough = amountValid && sourceBalanceLoaded && sourceBalance >= parsedAmount
  const feeReady = sourceFeeBalance != null && sourceFeeBalance > 0
  const recipientReady = recipient.trim().length > 10
  const activeStep = direction === 'cardano-to-midnight' ? cardanoBridge.step : midnightBridge.step
  const activeError = direction === 'cardano-to-midnight' ? cardanoBridge.error : midnightBridge.error
  const busy = activeStep !== 'idle' && activeStep !== 'done'
  const canAuthorize = sourceWalletConnected && recipientReady && amountValid && balanceEnough && feeReady && !busy
  const sourceName = direction === 'cardano-to-midnight' ? 'Cardano' : 'Midnight'
  const destinationName = direction === 'cardano-to-midnight' ? 'Midnight' : 'Cardano'
  const sourceAddress = direction === 'cardano-to-midnight' ? cardano.address : midnight.address
  const destinationAddress = recipient

  const rawError = activeError || (direction === 'cardano-to-midnight' ? cardano.error : midnight.error)
  const friendlyError = rawError ? explainBridgeError(rawError) : null

  const rail = useMemo(() => {
    const c2m = direction === 'cardano-to-midnight'
    const labels = c2m
      ? ['Intent', 'Construct', 'Authorize', 'Submit', 'Source finality', 'VIA delivery']
      : ['Intent', 'Join gateway', 'Prove locally', 'Submit', 'Source finality', 'VIA release']
    const raw = c2m ? CARDANO_BRIDGE_STEPS : MIDNIGHT_BRIDGE_STEPS
    const rawIndex = raw.indexOf(activeStep as never)
    let progress = 0
    if (activeStep === 'done') progress = 5
    else if (rawIndex >= 0) {
      if (c2m) {
        const map = [1, 1, 2, 3, 4]
        progress = map[rawIndex]
      } else {
        const map = [1, 2, 4]
        progress = map[rawIndex]
      }
    }
    return labels.map((label, index) => ({
      label,
      state: index < progress ? 'complete' : index === progress ? 'active' : 'waiting',
      note: index === labels.length - 1 && activeStep === 'done' ? 'handoff' : undefined,
    }))
  }, [direction, activeStep])

  const submitIntent = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (!canAuthorize) return

    if (direction === 'cardano-to-midnight') {
      const result = await cardanoBridge.bridge(amount, recipient.trim())
      if (result) void cardanoBalance.refresh()
    } else {
      const result = await midnightBridge.bridge(amount, recipient.trim())
      if (result) void midnightBalance.refresh()
    }
  }

  const reverse = () => {
    setDirection((value) => value === 'cardano-to-midnight' ? 'midnight-to-cardano' : 'cardano-to-midnight')
    setManualRecipient(false)
  }

  const sourceCheck: CheckState = sourceWalletConnected ? 'ready' : 'blocked'
  const recipientCheck: CheckState = recipientReady ? 'ready' : 'blocked'
  const amountCheck: CheckState = !amountValid ? 'blocked' : !sourceBalanceLoaded ? 'pending' : balanceEnough ? 'ready' : 'blocked'
  const feeCheck: CheckState = sourceFeeBalance == null ? 'pending' : feeReady ? 'ready' : 'blocked'

  const sourceTxHash = direction === 'cardano-to-midnight' ? cardanoBridge.txHash : midnightBridge.result?.txHash
  const sourceTxId = direction === 'midnight-to-cardano' ? midnightBridge.result?.txId : null

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="VIA USDM Settlement Studio home">
          <span className="brand-mark">V</span>
          <span><b>USDM Settlement Studio</b><small>powered by VIA Labs</small></span>
        </a>
        <div className="topbar-actions">
          <span className="network-pill"><i />{NETWORK_LABEL}</span>
          <div className="mode-switch" aria-label="Interface detail level">
            {(['simple', 'advanced', 'trace'] as Mode[]).map((value) => (
              <button key={value} type="button" data-active={mode === value} onClick={() => setMode(value)}>{value}</button>
            ))}
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Intent layer / USDM / Cardano ↔ Midnight</p>
          <h1>Move value.<br /><em>Not infrastructure.</em></h1>
        </div>
        <p className="hero-copy">State the economic action. Settlement Studio handles wallet standards, route construction, proof execution, source finality, and VIA handoff—then exposes the machinery only when you ask for it.</p>
      </section>

      <section className="workspace">
        <aside className="wallet-stack" aria-label="Wallet connections">
          <div className="section-heading">
            <span>Connections</span>
            <small>Local wallet authority</small>
          </div>

          <article className="wallet-card" data-connected={Boolean(cardano.api)}>
            <div className="wallet-title"><span className="chain-dot cardano-dot" /><div><strong>Cardano</strong><small>CIP-30</small></div></div>
            <div className="wallet-value"><b>{formatBalance(cardanoBalance.balance?.usdm)}</b><span>USDM</span></div>
            <div className="wallet-meta"><span>{truncate(cardano.address)}</span><span>{cardanoBalance.balance ? `${formatBalance(cardanoBalance.balance.ada)} ADA` : 'Fee balance —'}</span></div>
            <div className="wallet-actions">
              {cardano.api ? <span className="connected-label">Connected · {cardano.name}</span> : cardano.wallets.length ? cardano.wallets.map((wallet) => (
                <button type="button" key={wallet.name} onClick={() => cardano.connect(wallet)} disabled={cardano.connecting}>Connect {wallet.label}</button>
              )) : <span className="wallet-empty">No CIP-30 wallet detected</span>}
            </div>
          </article>

          <article className="wallet-card" data-connected={Boolean(midnight.api)}>
            <div className="wallet-title"><span className="chain-dot midnight-dot" /><div><strong>Midnight</strong><small>Connector API v4</small></div></div>
            <div className="wallet-value"><b>{formatBalance(midnightBalance.balance?.usdm)}</b><span>USDM</span></div>
            <div className="wallet-meta"><span>{truncate(midnight.address)}</span><span>{midnightBalance.balance ? `${formatBalance(midnightBalance.balance.dust)} DUST` : 'Execution capacity —'}</span></div>
            <div className="wallet-actions">
              {midnight.api ? <span className="connected-label">Connected · {midnight.name}</span> : midnight.wallets.length ? midnight.wallets.map((wallet) => (
                <button type="button" key={wallet.name} onClick={() => midnight.connect(wallet)} disabled={midnight.connecting}>Connect {wallet.label}</button>
              )) : <span className="wallet-empty">No connector-v4 wallet detected</span>}
            </div>
          </article>

          <p className="security-note"><span>◈</span> Wallets retain signing authority. Midnight proving happens inside the connected wallet; this interface never asks for a mnemonic.</p>
        </aside>

        <section className="intent-panel" aria-labelledby="intent-title">
          <div className="section-heading">
            <span id="intent-title">New intent</span>
            <small>One action, routed end to end</small>
          </div>

          <form noValidate onSubmit={submitIntent}>
            <div className="direction-row">
              <button type="button" className="chain-choice" data-selected={direction === 'cardano-to-midnight'} onClick={() => { setDirection('cardano-to-midnight'); setManualRecipient(false) }}>
                <small>FROM</small><strong>Cardano</strong><span>{formatBalance(cardanoBalance.balance?.usdm)} USDM</span>
              </button>
              <button type="button" className="reverse-button" aria-label="Reverse transfer direction" onClick={reverse}>⇄</button>
              <button type="button" className="chain-choice" data-selected={direction === 'midnight-to-cardano'} onClick={() => { setDirection('midnight-to-cardano'); setManualRecipient(false) }}>
                <small>FROM</small><strong>Midnight</strong><span>{formatBalance(midnightBalance.balance?.usdm)} USDM</span>
              </button>
            </div>

            <label className="amount-field">
              <span>Amount</span>
              <div><input inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={attempted && !amountValid} /><b>USDM</b></div>
              <small>Available on {sourceName}: {formatBalance(sourceBalance)} USDM</small>
            </label>

            <div className="destination-summary">
              <div><small>DESTINATION</small><strong>{destinationName}</strong><span>{truncate(destinationAddress, 14, 10)}</span></div>
              <span className="route-arrow">→</span>
              <div className="intent-name"><small>INTENT</small><strong>{intentLabel || 'USDM settlement'}</strong><span>Local label · not written on-chain</span></div>
            </div>

            {mode !== 'simple' && (
              <div className="advanced-fields">
                <label>
                  <span>Intent label</span>
                  <input value={intentLabel} onChange={(event) => setIntentLabel(event.target.value)} maxLength={64} />
                  <small>Interface metadata only. It is not included in the bridge payload.</small>
                </label>
                <label>
                  <span>Destination address</span>
                  <input value={recipient} onChange={(event) => { setManualRecipient(true); setRecipient(event.target.value) }} aria-invalid={attempted && !recipientReady} />
                  <small>{manualRecipient ? 'Manual route override active.' : 'Resolved from the connected destination wallet.'}</small>
                </label>
                {manualRecipient && <button type="button" className="text-button" onClick={() => setManualRecipient(false)}>Use connected destination instead</button>}
              </div>
            )}

            <div className="preflight">
              <div className="preflight-title"><span>Preflight</span><small>Blocking checks run before authorization</small></div>
              <Check state={sourceCheck} title={`${sourceName} source`} detail={sourceWalletConnected ? 'Wallet authority available' : `Connect a ${sourceName} wallet`} />
              <Check state={recipientCheck} title={`${destinationName} destination`} detail={recipientReady ? 'Destination resolved' : mode === 'simple' ? `Connect the ${destinationName} wallet` : 'Enter a valid destination address'} />
              <Check state={amountCheck} title="USDM availability" detail={!amountValid ? 'Enter an amount greater than zero' : !sourceBalanceLoaded ? 'Reading wallet balance' : balanceEnough ? `${formatBalance(sourceBalance)} USDM available` : 'Amount exceeds the wallet balance'} />
              <Check state={feeCheck} title={direction === 'cardano-to-midnight' ? 'Cardano fee balance' : 'Midnight execution capacity'} detail={sourceFeeBalance == null ? 'Reading fee capacity' : feeReady ? direction === 'cardano-to-midnight' ? 'ADA balance detected' : 'DUST capacity detected' : direction === 'cardano-to-midnight' ? 'Add ADA for network fees' : 'Add DUST capacity before proving'} />
            </div>

            <button className="authorize-button" type="submit" disabled={!canAuthorize} aria-busy={busy}>
              <span>{busy ? phaseCopy[activeStep] : amountValid ? `Authorize ${amount} USDM` : 'Authorize USDM intent'}</span>
              <b aria-hidden="true">→</b>
            </button>
            <p className="authorize-caption">You authorize the source transaction in your wallet. Settlement Studio does not custody funds.</p>
          </form>
        </section>
      </section>

      <section className="rail-section" aria-label="Intent execution trace">
        <div className="section-heading">
          <span>Intent Rail</span>
          <small>{phaseCopy[activeStep]}</small>
        </div>
        <div className="intent-rail">
          <div className="rail-line" aria-hidden="true" />
          {rail.map((node) => (
            <div className="rail-node" data-state={node.state} key={node.label}>
              <i aria-hidden="true" />
              <strong>{node.label}</strong>
              <small>{node.note === 'handoff' ? 'Network delivery continues' : node.state === 'complete' ? 'Complete' : node.state === 'active' ? 'Current' : 'Waiting'}</small>
            </div>
          ))}
        </div>
        {activeStep === 'done' && <div className="handoff-note"><strong>Source accepted.</strong> VIA can now carry the message to {destinationName}. This interface intentionally does not label destination settlement complete until destination evidence is available.</div>}
      </section>

      {friendlyError && (
        <section className="error-panel" role="alert">
          <div><span>Action required</span><h2>{friendlyError.title}</h2><p>{friendlyError.guidance}</p></div>
          {mode === 'trace' && <code>{friendlyError.technical}</code>}
        </section>
      )}

      {mode === 'trace' && (
        <section className="trace-panel">
          <div className="section-heading"><span>Protocol trace</span><small>Evidence, not decoration</small></div>
          <dl>
            <div><dt>Direction</dt><dd>{sourceName} → VIA → {destinationName}</dd></div>
            <div><dt>Source wallet standard</dt><dd>{direction === 'cardano-to-midnight' ? 'CIP-30' : 'Midnight Connector API v4'}</dd></div>
            <div><dt>Proof execution</dt><dd>{direction === 'midnight-to-cardano' ? 'Wallet-local proving' : 'Not required on source leg'}</dd></div>
            <div><dt>Raw bridge phase</dt><dd><code>{activeStep}</code></dd></div>
            <div><dt>Source address</dt><dd><code>{sourceAddress || 'not connected'}</code></dd></div>
            <div><dt>Destination</dt><dd><code>{recipient || 'not resolved'}</code></dd></div>
            {sourceTxId && <div><dt>Midnight tx id</dt><dd><code>{sourceTxId}</code></dd></div>}
            {sourceTxHash && <div><dt>Source tx hash</dt><dd><code>{sourceTxHash}</code></dd></div>}
          </dl>
          <div className="trace-actions">
            {direction === 'cardano-to-midnight' && sourceTxHash && <a href={cardanoExplorerTxUrl(sourceTxHash)} target="_blank" rel="noreferrer">Open Cardano transaction ↗</a>}
            <a href={viaScanUrl} target="_blank" rel="noreferrer">Open VIA Scan ↗</a>
          </div>
        </section>
      )}

      <footer>
        <span>VIA moves the message.</span><span>Midnight proves execution.</span><b>Settlement Studio removes the cognitive tax.</b>
      </footer>
    </main>
  )
}
