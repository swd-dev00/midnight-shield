import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  MIDNIGHT_NETWORK_ID,
  MIDNIGHT_SETTLEMENT_CONTRACT_ADDRESS,
  NETWORK_LABEL,
  cardanoExplorerTxUrl,
  viaScanUrl,
} from './config'
import { addressHexToBech32 } from './lib/cardanoWallet'
import { usdmToBaseUnits, validUsdmAmount } from './lib/amount'
import { midnightRecipientBytes, validRecipient } from './lib/recipient'
import { explainBridgeError } from './lib/errors'
import { WalletConnection } from './components/WalletConnection'
import { TransferReceipt } from './components/TransferReceipt'
import type { TransferIntent } from './lib/transferReceipt'
import { useCardanoWallet } from './hooks/useCardanoWallet'
import { useMidnightWallet } from './hooks/useMidnightWallet'
import { useCardanoBalance } from './hooks/useCardanoBalance'
import { useMidnightBalance } from './hooks/useMidnightBalance'
import { CARDANO_BRIDGE_STEPS, useCardanoBridge } from './hooks/useCardanoBridge'
import { MIDNIGHT_BRIDGE_STEPS, useMidnightBridge } from './hooks/useMidnightBridge'
import { useDeliveryEvidence } from './hooks/useDeliveryEvidence'
import { useCompactSettlement } from './hooks/useCompactSettlement'

type Direction = 'cardano-to-midnight' | 'midnight-to-cardano'
type Mode = 'simple' | 'advanced' | 'trace'
type CheckState = 'ready' | 'blocked' | 'pending'
type RailState = 'complete' | 'active' | 'waiting' | 'unverified' | 'locked'

type RailNode = {
  label: string
  state: RailState
  note?: string
}

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
  proving: 'Generating proof through the Midnight wallet',
  confirming: 'Waiting for source-chain finality',
  done: 'Source accepted — downstream evidence pending',
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
  const cardanoBalance = useCardanoBalance(cardano.api, cardano.address)
  const midnightBalance = useMidnightBalance(midnight.api, midnight.address)
  const cardanoBridge = useCardanoBridge(cardano.name)
  const midnightBridge = useMidnightBridge(midnight.name)
  const [optionalCompact, setOptionalCompact] = useState(false)
  const compactSettlement = useCompactSettlement(midnight.api, midnight.networkId, midnight.address, optionalCompact)

  const [direction, setDirection] = useState<Direction>('cardano-to-midnight')
  const [mode, setMode] = useState<Mode>('simple')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [manualRecipient, setManualRecipient] = useState(false)
  const [intentLabel, setIntentLabel] = useState('USDM settlement')
  const [settlementRecipient, setSettlementRecipient] = useState('')
  const [manualSettlementRecipient, setManualSettlementRecipient] = useState(false)
  const submitLock = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedIntent, setSubmittedIntent] = useState<(TransferIntent & { payee: string; memo: string; walletAddress: string }) | null>(null)
  const [recoveredSourceHash, setRecoveredSourceHash] = useState('')
  const [preflightError, setPreflightError] = useState<string | null>(null)

  useEffect(() => {
    if (!manualRecipient && !submittedIntent) {
      setRecipient(direction === 'cardano-to-midnight' ? midnight.address ?? '' : cardano.address ?? '')
    }
  }, [direction, manualRecipient, midnight.address, cardano.address, submittedIntent])

  useEffect(() => {
    if (!manualSettlementRecipient && !submittedIntent) {
      setSettlementRecipient(midnight.address ?? '')
    }
  }, [manualSettlementRecipient, midnight.address, submittedIntent])

  const parsedAmount = Number(amount)
  const amountValid = validUsdmAmount(amount)
  const midnightNetworkReady = Boolean(midnight.api && midnight.networkId === MIDNIGHT_NETWORK_ID)
  const sourceWalletConnected = direction === 'cardano-to-midnight' ? Boolean(cardano.api) : midnightNetworkReady
  const destinationWalletConnected = direction === 'cardano-to-midnight' ? midnightNetworkReady : Boolean(cardano.api)
  const sourceBalance = direction === 'cardano-to-midnight' ? cardanoBalance.balance?.usdm : midnightBalance.balance?.usdm
  const destinationBalance = direction === 'cardano-to-midnight' ? midnightBalance.balance?.usdm : cardanoBalance.balance?.usdm
  const sourceFeeBalance = direction === 'cardano-to-midnight' ? cardanoBalance.balance?.ada : midnightBalance.balance?.dust
  const refreshDestination = direction === 'cardano-to-midnight' ? midnightBalance.refresh : cardanoBalance.refresh
  const sourceBalanceLoaded = sourceBalance != null
  const balanceEnough = amountValid && sourceBalance != null && sourceBalance >= parsedAmount
  const feeReady = sourceFeeBalance != null && sourceFeeBalance > 0
  const recipientReady = validRecipient(recipient, direction)
  const settlementRecipientReady = validRecipient(settlementRecipient, 'cardano-to-midnight')
  const activeStep = direction === 'cardano-to-midnight' ? cardanoBridge.step : midnightBridge.step
  const activeError = direction === 'cardano-to-midnight' ? cardanoBridge.error : midnightBridge.error
  const compactBusy = compactSettlement.status === 'deploying' || compactSettlement.status === 'settling' || compactSettlement.receiptStatus === 'checking'
  const busy = submitting || compactBusy || (activeStep !== 'idle' && activeStep !== 'done')
  const intentLocked = busy || submittedIntent !== null
  const canAuthorize = sourceWalletConnected && recipientReady && amountValid && balanceEnough && feeReady && !intentLocked
  const sourceName = direction === 'cardano-to-midnight' ? 'Cardano' : 'Midnight'
  const destinationName = direction === 'cardano-to-midnight' ? 'Midnight' : 'Cardano'
  const sourceAddress = direction === 'cardano-to-midnight' ? cardano.address : midnight.address
  const destinationConnectedAddress = direction === 'cardano-to-midnight' ? midnight.address : cardano.address
  const destinationAddress = recipient
  const settlementConfigured = Boolean(compactSettlement.contractAddress)
  const deliveryObservable = Boolean(
    destinationWalletConnected &&
    destinationConnectedAddress &&
    !manualRecipient &&
    recipient.trim() === destinationConnectedAddress?.trim(),
  )

  const deliveryEvidence = useDeliveryEvidence(destinationBalance, refreshDestination)

  useEffect(() => {
    deliveryEvidence.reset()
  }, [direction]) // eslint-disable-line react-hooks/exhaustive-deps

  const rawError = preflightError || activeError || cardano.error || midnight.error || cardanoBalance.error || midnightBalance.error
  const friendlyError = rawError ? explainBridgeError(rawError) : null

  const sourceTxHash = direction === 'cardano-to-midnight' ? cardanoBridge.txHash : midnightBridge.result?.txHash
  const sourceTxId = direction === 'midnight-to-cardano' ? midnightBridge.result?.txId : null
  const sourceAccepted = activeStep === 'done'

  const sdkAcceptedAt = direction === 'cardano-to-midnight' ? cardanoBridge.acceptedAt : midnightBridge.acceptedAt
  const rail = useMemo<RailNode[]>(() => {
    const c2m = direction === 'cardano-to-midnight'
    const labels = c2m ? ['Intent', 'Construct', 'Authorize', 'Submit', 'Source accepted'] : ['Intent', 'Join gateway', 'Wallet proof', 'Submit', 'Source accepted']
    const raw = c2m ? CARDANO_BRIDGE_STEPS : MIDNIGHT_BRIDGE_STEPS
    const index = raw.indexOf(activeStep as never)
    const progress = activeStep === 'done' ? 5 : index < 0 ? 0 : (c2m ? [1, 1, 2, 3, 4] : [1, 2, 4])[index]
    return labels.map((label, position) => ({ label, state: position < progress ? 'complete' : position === progress ? 'active' : 'waiting', note: position === 4 && sourceAccepted ? 'Reported by VIA SDK; independent checks below' : undefined }))
  }, [activeStep, direction, sourceAccepted])

  const executionStatus = compactSettlement.receiptStatus === 'verified'
    ? 'Compact settlement and public receipt verified'
    : compactSettlement.status === 'verified'
    ? 'Compact settlement finalized; receipt-state verification pending'
    : deliveryEvidence.status === 'paused' ? 'Arrival not yet observed; balance monitoring paused'
    : deliveryEvidence.status === 'verified'
      ? `${destinationName} balance increase observed; transfer attribution requires transaction evidence`
      : sourceAccepted && (deliveryEvidence.status === 'watching' || deliveryEvidence.status === 'armed')
        ? `Source accepted — watching ${destinationName} USDM balance`
        : deliveryEvidence.status === 'unavailable' && activeStep === 'done'
          ? 'Source accepted — connected destination evidence unavailable'
          : submittedIntent && recoveredSourceHash ? 'Recovered source reference — inspect receipt evidence'
          : submittedIntent && activeStep === 'idle' ? 'Source confirmation unavailable — inspect wallet history before retrying'
          : phaseCopy[activeStep]

  const submitIntent = async (event: FormEvent) => {
    event.preventDefault()
    if (!canAuthorize || submitLock.current) {
      event.currentTarget.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
      return
    }
    submitLock.current = true
    setSubmitting(true)
    setPreflightError(null)
    try {
      // Revalidate wallet identity immediately before requesting authorization.
      if (cardano.api) {
        if (await cardano.api.getNetworkId() !== 0) throw new Error('Cardano network mismatch: switch to Preprod and reconnect')
        if (addressHexToBech32(await cardano.api.getChangeAddress()) !== cardano.address) throw new Error('Cardano account changed: reconnect before authorizing')
      }
      if (midnight.api) {
        const configuration = await midnight.api.getConfiguration()
        const currentAddress = (await midnight.api.getUnshieldedAddress()).unshieldedAddress
        if (configuration.networkId !== MIDNIGHT_NETWORK_ID || currentAddress !== midnight.address) {
          throw new Error('Midnight wallet changed: reconnect on Preview before authorizing')
        }
      }
      compactSettlement.reset()
      const intent = { direction, amount, amountBaseUnits: usdmToBaseUnits(amount).toString(), recipientKey: direction === 'cardano-to-midnight' ? Array.from(midnightRecipientBytes(recipient), byte => byte.toString(16).padStart(2, '0')).join('') : '', sourceAddress: sourceAddress ?? '', submittedAt: new Date().toISOString(), recipient: recipient.trim(), payee: settlementRecipient.trim(), memo: intentLabel || 'USDM settlement', walletAddress: midnight.address ?? '' }
      setSubmittedIntent(intent)
      deliveryEvidence.arm(parsedAmount, deliveryObservable)
      const result = direction === 'cardano-to-midnight'
        ? await cardanoBridge.bridge(intent.amount, intent.recipient)
        : await midnightBridge.bridge(intent.amount, intent.recipient)
      if (result) {
        deliveryEvidence.watch()
        void cardanoBalance.refresh()
        void midnightBalance.refresh()
      } else {
        deliveryEvidence.reset()
        // Keep the captured intent after an uncertain outcome; no automatic retry.
      }
    } catch (err) {
      setPreflightError(err instanceof Error ? err.message : String(err))
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  const newIntent = () => {
    if (busy) return
    setSubmittedIntent(null)
    setRecoveredSourceHash('')
    setPreflightError(null)
    cardanoBridge.reset()
    midnightBridge.reset()
    compactSettlement.reset()
    deliveryEvidence.reset()
  }

  const reverse = () => {
    setDirection((value) => value === 'cardano-to-midnight' ? 'midnight-to-cardano' : 'cardano-to-midnight')
    setManualRecipient(false)
  }

  const sourceCheck: CheckState = sourceWalletConnected ? 'ready' : 'blocked'
  const recipientCheck: CheckState = recipientReady ? 'ready' : 'blocked'
  const amountCheck: CheckState = !amountValid ? 'blocked' : !sourceBalanceLoaded ? 'pending' : balanceEnough ? 'ready' : 'blocked'
  const feeCheck: CheckState = sourceFeeBalance == null ? 'pending' : feeReady ? 'ready' : 'blocked'
  const midnightNetworkCheck: CheckState = midnight.networkId == null
    ? 'pending'
    : midnight.networkId === MIDNIGHT_NETWORK_ID
      ? 'ready'
      : 'blocked'
  const showMidnightNetworkCheck = direction === 'midnight-to-cardano' || !manualRecipient || midnight.networkId != null

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="VIA USDM Settlement Studio home">
          <span className="brand-mark">V</span>
          <span><b>USDM Settlement Studio</b><small>powered by VIA Labs</small></span>
        </a>
        <div className="topbar-actions">
          <span className="network-pill"><i />{NETWORK_LABEL}</span>
          <div className="mode-switch" role="group" aria-label="Interface detail level">
            {(['simple', 'advanced', 'trace'] as Mode[]).map((value) => (
              <button key={value} type="button" aria-pressed={mode === value} data-active={mode === value} onClick={() => setMode(value)}>{value}</button>
            ))}
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Intent layer / USDM / Cardano ↔ Midnight</p>
          <h1>Move value.<br /><em>Not infrastructure.</em></h1>
        </div>
        <p className="hero-copy">Authorize a USDM transfer through VIA’s deployed infrastructure. Settlement Studio connects the source transaction, VIA delivery, and destination arrival into one verifiable receipt.</p>
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
            <WalletConnection chain="Cardano" wallets={cardano.wallets}
              connectedLabel={cardano.api ? `Connected · ${cardano.name}` : null}
              connecting={cardano.connecting} locked={intentLocked} error={cardano.error} failure={cardano.failure}
              refresh={cardano.refresh} connect={cardano.connect} />
          </article>

          <article className="wallet-card" data-connected={midnightNetworkReady}>
            <div className="wallet-title"><span className="chain-dot midnight-dot" /><div><strong>Midnight</strong><small>Connector API v4</small></div></div>
            <div className="wallet-value"><b>{formatBalance(midnightBalance.balance?.usdm)}</b><span>USDM</span></div>
            <div className="wallet-meta"><span>{truncate(midnight.address)}</span><span>{midnightBalance.balance ? `${formatBalance(midnightBalance.balance.dust)} DUST` : 'Execution capacity —'}</span></div>
            <WalletConnection chain="Midnight" wallets={midnight.wallets}
              connectedLabel={midnight.api ? `Connected · ${midnight.name} · ${midnight.networkId}` : null}
              connecting={midnight.connecting} locked={intentLocked} error={midnight.error} failure={midnight.failure}
              refresh={midnight.refresh} connect={midnight.connect} />
            {midnight.networkId && midnight.networkId !== MIDNIGHT_NETWORK_ID && <span className="wallet-empty">Network mismatch · {midnight.networkId} ≠ {MIDNIGHT_NETWORK_ID}</span>}
          </article>

          <p className="security-note"><span>◈</span> Wallets retain signing authority. The connected wallet manages Midnight proving; this interface never asks for a mnemonic.</p>
        </aside>

        <section className="intent-panel" aria-labelledby="intent-title">
          <div className="section-heading">
            <span id="intent-title">New intent</span>
            <small>One action, routed end to end</small>
          </div>

          <form noValidate onSubmit={submitIntent}>
            <fieldset disabled={intentLocked} className="intent-fields">
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
              <div><input id="transfer-amount" name="transfer-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(amount) && !amountValid} aria-describedby="amount-help" /><b>USDM</b></div>
              <small id="amount-help">{amount && !amountValid ? "Enter a positive amount with at most 6 decimal places." : `Available on ${sourceName}: ${formatBalance(sourceBalance)} USDM`}</small>
            </label>

            <div className="destination-summary">
              <div><small>DESTINATION</small><strong>{destinationName}</strong><span>{truncate(destinationAddress, 14, 10)}</span></div>
              <span className="route-arrow">→</span>
              <div className="intent-name"><small>INTENT</small><strong>{intentLabel || 'USDM settlement'}</strong><span>Local label · memo hash only at settlement</span></div>
            </div>

            {mode !== 'simple' && (
              <div className="advanced-fields">
                <label>
                  <span>Intent label</span>
                  <input id="intent-label" name="intent-label" value={intentLabel} onChange={(event) => setIntentLabel(event.target.value)} maxLength={64} />
                  <small>Bridge-local metadata. Compact settlement hashes this label; raw text is not written on-chain.</small>
                </label>
                <label>
                  <span>Destination address</span>
                  <input id="destination-address" name="destination-address" value={recipient} onChange={(event) => { setManualRecipient(true); setRecipient(event.target.value) }} aria-invalid={Boolean(recipient) && !recipientReady} aria-describedby="recipient-help" maxLength={200} />
                  <small id="recipient-help">{recipient && !recipientReady ? `Enter a valid ${destinationName} address on the displayed test network.` : manualRecipient ? 'Manual route override active. Wallet balance observation is disabled.' : 'Resolved from the connected destination wallet.'}</small>
                </label>
                {manualRecipient && <button type="button" className="text-button" onClick={() => setManualRecipient(false)}>Use connected destination instead</button>}
                {direction === 'cardano-to-midnight' && <label className="optional-compact-toggle"><input type="checkbox" id="optional-compact" name="optional-compact" checked={optionalCompact} onChange={event => setOptionalCompact(event.target.checked)} /> Show Compact settlement controls (required for the sprint)</label>}
                {optionalCompact && direction === 'cardano-to-midnight' && (
                  <label>
                    <span>Compact settlement payee</span>
                    <input id="settlement-payee" name="settlement-payee" maxLength={200} aria-invalid={Boolean(settlementRecipient) && !settlementRecipientReady} aria-describedby="payee-help" value={settlementRecipient} onChange={(event) => { setManualSettlementRecipient(true); setSettlementRecipient(event.target.value) }} />
                    <small id="payee-help">{settlementRecipient && !settlementRecipientReady ? 'Enter a valid Midnight Preview unshielded address.' : manualSettlementRecipient ? 'Downstream Midnight payee override.' : 'Defaults to the connected Midnight wallet for a self-settlement demo.'}</small>
                  </label>
                )}
                {optionalCompact && direction === 'cardano-to-midnight' && manualSettlementRecipient && <button type="button" className="text-button" onClick={() => setManualSettlementRecipient(false)}>Use connected Midnight wallet as payee</button>}
              </div>
            )}

            <div className="preflight">
              <div className="preflight-title"><span>Preflight</span><small>Blocking checks run before authorization</small></div>
              <Check state={sourceCheck} title={`${sourceName} source`} detail={sourceWalletConnected ? 'Wallet authority available' : `Connect a ${sourceName} wallet`} />
              <Check state={recipientCheck} title={`${destinationName} destination`} detail={recipientReady ? 'Destination resolved' : mode === 'simple' ? `Connect the ${destinationName} wallet` : 'Enter a valid destination address'} />
              {showMidnightNetworkCheck && <Check state={midnightNetworkCheck} title="Midnight Preview network" detail={midnight.networkId == null ? 'Connect Midnight wallet to validate Preview' : midnight.networkId === MIDNIGHT_NETWORK_ID ? 'Wallet network matches VIA testnet route' : `Wallet reports ${midnight.networkId}; VIA testnet requires ${MIDNIGHT_NETWORK_ID}`} />}
              <Check state={amountCheck} title="USDM availability" detail={!amountValid ? 'Enter an amount greater than zero' : !sourceBalanceLoaded ? 'Reading wallet balance' : balanceEnough ? `${formatBalance(sourceBalance)} USDM available` : 'Amount exceeds the wallet balance'} />
              <Check state={feeCheck} title={direction === 'cardano-to-midnight' ? 'Cardano fee balance' : 'Midnight execution capacity'} detail={sourceFeeBalance == null ? 'Reading fee capacity' : feeReady ? direction === 'cardano-to-midnight' ? 'ADA balance detected' : 'DUST capacity detected on Preview' : direction === 'cardano-to-midnight' ? 'Add ADA for network fees' : 'Add Preview DUST capacity before proving'} />
            </div>

            </fieldset>
            <button className="authorize-button" type="submit" disabled={!canAuthorize} aria-busy={busy}>
              <span>{busy ? phaseCopy[activeStep] : amountValid ? `Authorize ${amount} USDM` : 'Authorize USDM intent'}</span>
              <b aria-hidden="true">→</b>
            </button>
            <p className="authorize-caption">You authorize the source transaction in your wallet. Settlement Studio does not custody funds.</p>
          </form>
        </section>
      </section>

      <section className="rail-section" aria-live="polite" aria-label="Intent execution trace">
        <div className="section-heading">
          <span>Intent Rail</span>
          <small>{executionStatus}</small>
        </div>
        <div className="intent-rail">
          <div className="rail-line" aria-hidden="true" />
          {rail.map((node) => (
            <div className="rail-node" data-state={node.state} key={node.label}>
              <i aria-hidden="true" />
              <strong>{node.label}</strong>
              <small>{node.note ?? (node.state === 'complete' ? 'Complete' : node.state === 'active' ? 'Current' : node.state === 'unverified' ? 'Unverified' : node.state === 'locked' ? 'Locked' : 'Waiting')}</small>
            </div>
          ))}
        </div>

        {midnight.networkId && midnight.networkId !== MIDNIGHT_NETWORK_ID && (
          <div className="handoff-note evidence-unavailable">
            <strong>Midnight network mismatch.</strong> The connected wallet reports {midnight.networkId}. VIA testnet is Cardano Preprod ↔ Midnight Preview, so Pre-Prod DUST cannot be counted as execution capacity for this route.
          </div>
        )}

        {deliveryEvidence.status === 'verified' && deliveryEvidence.snapshot && (
          <div className="handoff-note">
            <strong>{destinationName} balance increase observed.</strong> Connected wallet USDM moved from {formatBalance(deliveryEvidence.snapshot.baseline)} to {formatBalance(deliveryEvidence.verifiedBalance)}. Expected threshold: {formatBalance(deliveryEvidence.snapshot.target)} USDM. This balance change does not identify which transfer caused it. The receipt below checks transaction-level evidence.
          </div>
        )}

        {sourceAccepted && (deliveryEvidence.status === 'watching' || deliveryEvidence.status === 'armed') && deliveryEvidence.snapshot && (
          <div className="handoff-note">
            <strong>Source accepted.</strong> Watching the connected {destinationName} wallet for +{formatBalance(deliveryEvidence.snapshot.expectedDelta)} USDM. This observation is supplementary; independent transaction evidence is checked below.
          </div>
        )}

        {deliveryEvidence.status === 'paused' && <div className="handoff-note"><p>Arrival has not been observed after three minutes. The transfer may still be processing; check the source transaction before creating another intent.</p><button type="button" className="text-button" onClick={deliveryEvidence.watch}>Resume balance monitoring</button></div>}
        {deliveryEvidence.status === 'unavailable' && activeStep === 'done' && (
          <div className="handoff-note evidence-unavailable">
            <strong>Source accepted, destination not automatically proven.</strong> The destination is not the connected wallet, so balance-delta evidence cannot be attributed safely. Use VIA Scan or destination-chain evidence instead.
          </div>
        )}

        {optionalCompact && direction === 'cardano-to-midnight' && deliveryEvidence.status === 'verified' && submittedIntent && (
          <div className="handoff-note">
            {!compactSettlement.compiledReady ? (
              <><strong>Compact execution is still locked.</strong> This app deployment is missing its proving files. {mode === 'trace' && <>Prepare them with <code>npm run contract:browser</code>.</>}</>
            ) : !midnightNetworkReady || !midnightBalance.balance?.dust ? (
              <><strong>Preview wallet with DUST required.</strong> Connect 1AM on Midnight Preview with Preview DUST before deploying or settling.</>
            ) : !settlementRecipientReady ? (
              <><strong>Settlement payee required.</strong> Supply a valid Midnight payee in Advanced mode.</>
            ) : !compactSettlement.contractAddress ? (
              <button type="button" className="authorize-button" disabled={compactBusy} onClick={() => { void compactSettlement.deploy() }}>
                <span>{compactSettlement.status === 'deploying' ? 'Deploying Compact contract…' : 'Deploy Compact on Midnight Preview'}</span><b aria-hidden="true">→</b>
              </button>
            ) : compactSettlement.status === 'verified' && compactSettlement.execution ? (
              <><strong>Compact settlement finalized.</strong> Transaction {truncate(compactSettlement.execution.txId, 12, 8)} finalized at block {compactSettlement.execution.blockHeight}. {compactSettlement.receiptStatus === 'verified' ? 'Public receipt verified against the settlement block.' : 'Public receipt verification is pending.'}</>
            ) : (
              <button type="button" className="authorize-button" disabled={compactBusy || !submittedIntent || submittedIntent.walletAddress !== midnight.address} onClick={() => { void compactSettlement.settle(submittedIntent!.amount, submittedIntent!.payee, submittedIntent!.memo) }}>
                <span>{compactSettlement.status === 'settling' ? 'Executing Compact settlement…' : `Settle ${amount} USDM with Compact`}</span><b aria-hidden="true">→</b>
              </button>
            )}
          </div>
        )}

        {compactSettlement.execution && compactSettlement.receiptStatus !== 'verified' && (
          <div className="handoff-note">
            <p>{compactSettlement.receiptError || 'Checking the public settlement receipt.'}</p>
            <button type="button" className="text-button" disabled={compactSettlement.receiptStatus === 'checking'} onClick={() => void compactSettlement.verifyReceipt()}>Verify receipt again</button>
          </div>
        )}

        {compactSettlement.error && (
          <div className="handoff-note evidence-unavailable">
            <strong>Compact action needs review.</strong> Check your wallet transaction history before retrying. {mode === 'trace' ? compactSettlement.error : 'Open Trace for details.'}
          </div>
        )}
      </section>

      {submittedIntent && !busy && !sourceTxHash && direction === 'cardano-to-midnight' && <div className="handoff-note"><label htmlFor="recovered-source-hash">Recover evidence from a source transaction in your wallet history</label><input id="recovered-source-hash" name="recovered-source-hash" value={recoveredSourceHash} maxLength={64} onChange={event => setRecoveredSourceHash(event.target.value.trim())} aria-describedby="recovery-help" aria-invalid={Boolean(recoveredSourceHash) && !/^[a-fA-F0-9]{64}$/.test(recoveredSourceHash)} /><p id="recovery-help">Paste its 64-character Cardano transaction hash. This only reads evidence; it does not resend the transfer. The amount, sender, recipient, and route must still match the captured intent.</p></div>}
      <TransferReceipt applicationSettlement={compactSettlement.execution ? { ...compactSettlement.execution, ledgerReadStatus: compactSettlement.receiptStatus } : null} returnProofObservation={direction === 'midnight-to-cardano' ? { wallet: midnight.name, runtime: 'unknown', phases: midnightBridge.phases, timingScope: 'VIA SDK proving phase includes proof, balance, and submission; not pure proof time' } : null} intent={submittedIntent} sourceHash={sourceTxHash ?? (/^[a-fA-F0-9]{64}$/.test(recoveredSourceHash) ? recoveredSourceHash.toLowerCase() : null)} acceptedAt={sdkAcceptedAt} balanceObservation={deliveryEvidence.observedAt && deliveryEvidence.snapshot ? { ...deliveryEvidence.snapshot, observedBalance: deliveryEvidence.verifiedBalance, observedAt: deliveryEvidence.observedAt, attribution: 'unverified' } : null} />

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
            <div><dt>Midnight wallet network</dt><dd><code>{midnight.networkId ?? 'not validated'}</code></dd></div>
            <div><dt>Required Midnight network</dt><dd><code>{MIDNIGHT_NETWORK_ID}</code></dd></div>
            <div><dt>Proof execution</dt><dd>{direction === 'midnight-to-cardano' ? 'Wallet-managed proving' : compactSettlement.status === 'settling' || compactSettlement.status === 'verified' ? 'Wallet-managed Compact proving' : 'Not required on source leg'}</dd></div>
            <div><dt>Raw bridge phase</dt><dd><code>{activeStep}</code></dd></div>
            <div><dt>Source finality evidence</dt><dd><code>{sourceAccepted ? 'SDK reported acceptance; inspect receipt for independent confirmation' : 'unverified'}</code></dd></div>
            <div><dt>VIA attribution evidence</dt><dd><code>{'See the settlement receipt for independent VIA correlation'}</code></dd></div>
            <div><dt>Source address</dt><dd><code>{sourceAddress || 'not connected'}</code></dd></div>
            <div><dt>Destination</dt><dd><code>{recipient || 'not resolved'}</code></dd></div>
            <div><dt>Destination evidence</dt><dd><code>{deliveryEvidence.status}</code></dd></div>
            {deliveryEvidence.snapshot && <div><dt>Destination baseline / target</dt><dd><code>{formatBalance(deliveryEvidence.snapshot.baseline)} → {formatBalance(deliveryEvidence.snapshot.target)} USDM</code></dd></div>}
            {deliveryEvidence.verifiedBalance != null && <div><dt>Observed destination balance</dt><dd><code>{formatBalance(deliveryEvidence.verifiedBalance)} USDM</code></dd></div>}
            {optionalCompact && direction === 'cardano-to-midnight' && <div><dt>Compact browser assets</dt><dd><code>{compactSettlement.compiledReady ? 'compiled/prepared' : 'proving files unavailable'}</code></dd></div>}
            {optionalCompact && direction === 'cardano-to-midnight' && <div><dt>Compact settlement deployment</dt><dd><code>{compactSettlement.contractAddress || MIDNIGHT_SETTLEMENT_CONTRACT_ADDRESS || 'not deployed/configured'}</code></dd></div>}
            {optionalCompact && direction === 'cardano-to-midnight' && <div><dt>Compact settlement status</dt><dd><code>{compactSettlement.status}</code></dd></div>}
            {optionalCompact && direction === 'cardano-to-midnight' && <div><dt>Compact payee</dt><dd><code>{settlementRecipient || 'not resolved'}</code></dd></div>}
            {compactSettlement.execution && <div><dt>Compact settlement tx</dt><dd><code>{compactSettlement.execution.txId}</code></dd></div>}
            {compactSettlement.execution && <div><dt>Settlement id</dt><dd><code>{compactSettlement.execution.settlementId}</code></dd></div>}
            {compactSettlement.execution && <div><dt>Public receipt</dt><dd>{compactSettlement.receiptStatus}</dd></div>}
            {sourceTxId && <div><dt>Midnight tx id</dt><dd><code>{sourceTxId}</code></dd></div>}
            {sourceTxHash && <div><dt>Source tx hash</dt><dd><code>{sourceTxHash}</code></dd></div>}
          </dl>
          <div className="trace-actions">
            {direction === 'cardano-to-midnight' && sourceTxHash && <a href={cardanoExplorerTxUrl(sourceTxHash)} target="_blank" rel="noreferrer">Open Cardano transaction ↗</a>}
            <a href={viaScanUrl} target="_blank" rel="noreferrer">Open VIA Scan ↗</a>
          </div>
        </section>
      )}

      {submittedIntent && !busy && <div className="handoff-note">
        <p>The submitted amount and destination are locked to this intent. Download its receipt before starting another. Before starting another transfer after an error, check your wallet and source transaction history for an existing submission.</p>
        <button type="button" className="text-button" onClick={newIntent}>Start a new intent</button>
      </div>}

      <footer>
        <span>VIA moves the asset.</span><b>Settlement Studio proves what happened across the boundaries.</b>
      </footer>
    </main>
  )
}
