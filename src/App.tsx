import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  MIDNIGHT_NETWORK_ID,
  MIDNIGHT_SETTLEMENT_CONTRACT_ADDRESS,
  NETWORK_LABEL,
  cardanoExplorerTxUrl,
  viaScanUrl,
} from './config'
import { explainBridgeError } from './lib/errors'
import { useCardanoWallet } from './hooks/useCardanoWallet'
import { useMidnightWallet } from './hooks/useMidnightWallet'
import { useCardanoBalance } from './hooks/useCardanoBalance'
import { useMidnightBalance } from './hooks/useMidnightBalance'
import { CARDANO_BRIDGE_STEPS, useCardanoBridge } from './hooks/useCardanoBridge'
import { MIDNIGHT_BRIDGE_STEPS, useMidnightBridge } from './hooks/useMidnightBridge'
import { useDeliveryEvidence } from './hooks/useDeliveryEvidence'
import { useCompactSettlement } from './hooks/useCompactSettlement'
import {
  type EvidenceState,
  type SourceFinalityEvidence,
  type ViaDeliveryEvidence,
  unavailableEvidence,
} from './lib/evidence'

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
  proving: 'Generating proof inside the Midnight wallet',
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
  const cardanoBalance = useCardanoBalance(cardano.api)
  const midnightBalance = useMidnightBalance(midnight.api)
  const cardanoBridge = useCardanoBridge(cardano.name)
  const midnightBridge = useMidnightBridge(midnight.name)
  const compactSettlement = useCompactSettlement(midnight.api, midnight.networkId)

  const [direction, setDirection] = useState<Direction>('cardano-to-midnight')
  const [mode, setMode] = useState<Mode>('simple')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [manualRecipient, setManualRecipient] = useState(false)
  const [intentLabel, setIntentLabel] = useState('USDM settlement')
  const [settlementRecipient, setSettlementRecipient] = useState('')
  const [manualSettlementRecipient, setManualSettlementRecipient] = useState(false)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    if (!manualRecipient) {
      setRecipient(direction === 'cardano-to-midnight' ? midnight.address ?? '' : cardano.address ?? '')
    }
  }, [direction, manualRecipient, midnight.address, cardano.address])

  useEffect(() => {
    if (!manualSettlementRecipient) {
      setSettlementRecipient(midnight.address ?? '')
    }
  }, [manualSettlementRecipient, midnight.address])

  useEffect(() => {
    setAttempted(false)
  }, [direction])

  const parsedAmount = Number(amount)
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0
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
  const recipientReady = recipient.trim().length > 10
  const settlementRecipientReady = settlementRecipient.trim().length > 10
  const activeStep = direction === 'cardano-to-midnight' ? cardanoBridge.step : midnightBridge.step
  const activeError = direction === 'cardano-to-midnight' ? cardanoBridge.error : midnightBridge.error
  const busy = activeStep !== 'idle' && activeStep !== 'done'
  const canAuthorize = sourceWalletConnected && recipientReady && amountValid && balanceEnough && feeReady && !busy
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

  const rawError = activeError || cardano.error || midnight.error
  const friendlyError = rawError ? explainBridgeError(rawError) : null

  const sourceTxHash = direction === 'cardano-to-midnight' ? cardanoBridge.txHash : midnightBridge.result?.txHash
  const sourceTxId = direction === 'midnight-to-cardano' ? midnightBridge.result?.txId : null
  const sourceAccepted = activeStep === 'done'

  const sourceFinalityEvidence: EvidenceState<SourceFinalityEvidence> = sourceAccepted
    ? sourceTxHash
      ? {
          status: 'verified',
          evidence: {
            kind: 'source-finality',
            chain: sourceName,
            txHash: sourceTxHash,
            ...(sourceTxId ? { txId: sourceTxId } : {}),
          },
        }
      : unavailableEvidence('Source bridge completed without a transaction hash')
    : { status: busy ? 'pending' : 'idle' }

  // The current browser bridge result exposes source-chain transaction output,
  // but not an independently attributable VIA message/relay identifier.
  // Destination balance movement is therefore never allowed to verify VIA delivery.
  const viaEvidence: EvidenceState<ViaDeliveryEvidence> = sourceAccepted
    ? unavailableEvidence('Independently attributable VIA message evidence is not exposed by the current bridge result')
    : { status: 'idle' }

  const rail = useMemo<RailNode[]>(() => {
    const c2m = direction === 'cardano-to-midnight'
    const labels = c2m
      ? ['Intent', 'Construct', 'Authorize', 'Submit', 'Source finality']
      : ['Intent', 'Join gateway', 'Prove locally', 'Submit', 'Source finality']
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

    const base = labels.map((label, index): RailNode => ({
      label,
      state: index < progress ? 'complete' : index === progress ? 'active' : 'waiting',
    }))

    if (sourceAccepted) {
      base[4] = {
        label: 'Source finality',
        state: sourceFinalityEvidence.status === 'verified' ? 'complete' : 'unverified',
        note: sourceFinalityEvidence.status === 'verified'
          ? `Source transaction ${truncate(sourceFinalityEvidence.evidence.txHash, 8, 6)}`
          : 'Source transaction evidence unavailable',
      }
    }

    const arrivalVerified = deliveryEvidence.status === 'verified'
    const evidenceUnavailable = deliveryEvidence.status === 'unavailable'
    const viaState: RailState = sourceAccepted
      ? viaEvidence.status === 'verified' ? 'complete' : 'unverified'
      : 'waiting'
    const arrivalState: RailState = arrivalVerified
      ? 'complete'
      : sourceAccepted && evidenceUnavailable
        ? 'locked'
        : sourceAccepted
          ? 'active'
          : 'waiting'

    const arrivalNote = arrivalVerified
      ? `+${formatBalance(deliveryEvidence.snapshot?.expectedDelta)} USDM observed`
      : evidenceUnavailable
        ? 'Connected destination required for balance proof'
        : sourceAccepted
          ? 'Watching destination wallet balance'
          : undefined

    if (!c2m) {
      return [
        ...base,
        {
          label: 'VIA release',
          state: viaState,
          note: sourceAccepted ? 'Arrival evidence cannot independently attribute the VIA release' : undefined,
        },
        { label: 'Cardano arrival', state: arrivalState, note: arrivalNote },
      ]
    }

    const settlementVerified = compactSettlement.status === 'verified' && Boolean(compactSettlement.execution)
    const settlementBusy = compactSettlement.status === 'deploying' || compactSettlement.status === 'settling'
    const settlementState: RailState = settlementVerified
      ? 'complete'
      : settlementBusy
        ? 'active'
        : !compactSettlement.compiledReady || !midnightNetworkReady || !arrivalVerified
          ? 'locked'
          : 'waiting'

    const settlementNote = settlementVerified
      ? `Finalized tx ${truncate(compactSettlement.execution?.txId, 8, 6)}`
      : compactSettlement.status === 'deploying'
        ? 'Deploying Compact contract through the wallet'
        : compactSettlement.status === 'settling'
          ? 'Proving, balancing, submitting, and finalizing settlement'
          : !compactSettlement.compiledReady
            ? 'Compile Compact 0.31 assets to unlock'
            : !midnightNetworkReady
              ? `Midnight ${MIDNIGHT_NETWORK_ID} wallet required`
              : !arrivalVerified
                ? 'Verify Midnight arrival to unlock execution'
                : !settlementConfigured
                  ? 'Ready for wallet-approved Preview deployment'
                  : 'Ready for wallet-approved Compact settlement'

    return [
      ...base,
      {
        label: 'VIA delivery',
        state: viaState,
        note: sourceAccepted ? 'Awaiting independently attributable VIA message evidence' : undefined,
      },
      { label: 'Midnight arrival', state: arrivalState, note: arrivalNote },
      {
        label: 'Compact settlement',
        state: settlementState,
        note: settlementNote,
      },
      {
        label: 'Receipt',
        state: settlementVerified ? 'unverified' : 'locked',
        note: settlementVerified
          ? 'Settlement finalized; independent ledger receipt-state query still required'
          : 'Requires verified Compact settlement',
      },
    ]
  }, [
    activeStep,
    compactSettlement.compiledReady,
    compactSettlement.execution,
    compactSettlement.status,
    deliveryEvidence.snapshot?.expectedDelta,
    deliveryEvidence.status,
    direction,
    midnightNetworkReady,
    settlementConfigured,
    sourceAccepted,
    sourceFinalityEvidence,
    viaEvidence,
  ])

  const executionStatus = compactSettlement.status === 'verified'
    ? 'Compact settlement finalized; receipt-state verification pending'
    : deliveryEvidence.status === 'verified'
      ? `${destinationName} arrival verified; VIA attribution remains unverified`
      : deliveryEvidence.status === 'watching' || deliveryEvidence.status === 'armed'
        ? `Source accepted — watching ${destinationName} USDM balance`
        : deliveryEvidence.status === 'unavailable' && activeStep === 'done'
          ? 'Source accepted — connected destination evidence unavailable'
          : phaseCopy[activeStep]

  const submitIntent = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (!canAuthorize) return

    compactSettlement.reset()
    deliveryEvidence.arm(parsedAmount, deliveryObservable)

    if (direction === 'cardano-to-midnight') {
      const result = await cardanoBridge.bridge(amount, recipient.trim())
      if (result) {
        void cardanoBalance.refresh()
        deliveryEvidence.watch()
      } else {
        deliveryEvidence.reset()
      }
    } else {
      const result = await midnightBridge.bridge(amount, recipient.trim())
      if (result) {
        void midnightBalance.refresh()
        deliveryEvidence.watch()
      } else {
        deliveryEvidence.reset()
      }
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
  const midnightNetworkCheck: CheckState = midnight.networkId == null
    ? 'pending'
    : midnight.networkId === MIDNIGHT_NETWORK_ID
      ? 'ready'
      : 'blocked'
  const showMidnightNetworkCheck = direction === 'midnight-to-cardano' || !manualRecipient || midnight.networkId != null
  const compactBusy = compactSettlement.status === 'deploying' || compactSettlement.status === 'settling'

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

          <article className="wallet-card" data-connected={midnightNetworkReady}>
            <div className="wallet-title"><span className="chain-dot midnight-dot" /><div><strong>Midnight</strong><small>Connector API v4</small></div></div>
            <div className="wallet-value"><b>{formatBalance(midnightBalance.balance?.usdm)}</b><span>USDM</span></div>
            <div className="wallet-meta"><span>{truncate(midnight.address)}</span><span>{midnightBalance.balance ? `${formatBalance(midnightBalance.balance.dust)} DUST` : 'Execution capacity —'}</span></div>
            <div className="wallet-actions">
              {midnight.api ? <span className="connected-label">Connected · {midnight.name} · {midnight.networkId}</span> : midnight.wallets.length ? midnight.wallets.map((wallet) => (
                <button type="button" key={wallet.name} onClick={() => midnight.connect(wallet)} disabled={midnight.connecting}>Connect {wallet.label}</button>
              )) : <span className="wallet-empty">No connector-v4 wallet detected</span>}
              {midnight.networkId && midnight.networkId !== MIDNIGHT_NETWORK_ID && <span className="wallet-empty">Network mismatch · {midnight.networkId} ≠ {MIDNIGHT_NETWORK_ID}</span>}
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
              <div className="intent-name"><small>INTENT</small><strong>{intentLabel || 'USDM settlement'}</strong><span>Local label · memo hash only at settlement</span></div>
            </div>

            {mode !== 'simple' && (
              <div className="advanced-fields">
                <label>
                  <span>Intent label</span>
                  <input value={intentLabel} onChange={(event) => setIntentLabel(event.target.value)} maxLength={64} />
                  <small>Bridge-local metadata. Compact settlement hashes this label; raw text is not written on-chain.</small>
                </label>
                <label>
                  <span>Destination address</span>
                  <input value={recipient} onChange={(event) => { setManualRecipient(true); setRecipient(event.target.value) }} aria-invalid={attempted && !recipientReady} />
                  <small>{manualRecipient ? 'Manual route override active. Balance-delta arrival proof is disabled.' : 'Resolved from the connected destination wallet.'}</small>
                </label>
                {manualRecipient && <button type="button" className="text-button" onClick={() => setManualRecipient(false)}>Use connected destination instead</button>}
                {direction === 'cardano-to-midnight' && (
                  <label>
                    <span>Compact settlement payee</span>
                    <input value={settlementRecipient} onChange={(event) => { setManualSettlementRecipient(true); setSettlementRecipient(event.target.value) }} />
                    <small>{manualSettlementRecipient ? 'Downstream Midnight payee override.' : 'Defaults to the connected Midnight wallet for a safe self-settlement demo.'}</small>
                  </label>
                )}
                {direction === 'cardano-to-midnight' && manualSettlementRecipient && <button type="button" className="text-button" onClick={() => setManualSettlementRecipient(false)}>Use connected Midnight wallet as payee</button>}
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
          <div className="handoff-note evidence-verified">
            <strong>{destinationName} arrival verified.</strong> Connected wallet USDM moved from {formatBalance(deliveryEvidence.snapshot.baseline)} to {formatBalance(deliveryEvidence.verifiedBalance)}. Expected threshold: {formatBalance(deliveryEvidence.snapshot.target)} USDM. This proves destination arrival, not VIA attribution.
          </div>
        )}

        {(deliveryEvidence.status === 'watching' || deliveryEvidence.status === 'armed') && deliveryEvidence.snapshot && (
          <div className="handoff-note">
            <strong>Source accepted.</strong> Watching the connected {destinationName} wallet for +{formatBalance(deliveryEvidence.snapshot.expectedDelta)} USDM. The arrival node will not complete until that balance evidence appears.
          </div>
        )}

        {deliveryEvidence.status === 'unavailable' && activeStep === 'done' && (
          <div className="handoff-note evidence-unavailable">
            <strong>Source accepted, destination not automatically proven.</strong> The destination is not the connected wallet, so balance-delta evidence cannot be attributed safely. Use VIA Scan or destination-chain evidence instead.
          </div>
        )}

        {direction === 'cardano-to-midnight' && deliveryEvidence.status === 'verified' && (
          <div className="handoff-note">
            {!compactSettlement.compiledReady ? (
              <><strong>Compact execution is still locked.</strong> Compile the real contract and prepare browser assets with <code>npm run contract:browser</code>. The stub refuses deployment until those artifacts exist.</>
            ) : !midnightNetworkReady ? (
              <><strong>Preview wallet required.</strong> Connect 1AM on Midnight Preview with Preview DUST before deploying or settling.</>
            ) : !settlementRecipientReady ? (
              <><strong>Settlement payee required.</strong> Supply a valid Midnight payee in Advanced mode.</>
            ) : !compactSettlement.contractAddress ? (
              <button type="button" className="authorize-button" disabled={compactBusy} onClick={() => { void compactSettlement.deploy() }}>
                <span>{compactSettlement.status === 'deploying' ? 'Deploying Compact contract…' : 'Deploy Compact on Midnight Preview'}</span><b aria-hidden="true">→</b>
              </button>
            ) : compactSettlement.status === 'verified' && compactSettlement.execution ? (
              <><strong>Compact settlement finalized.</strong> Transaction {truncate(compactSettlement.execution.txId, 12, 8)} finalized at block {compactSettlement.execution.blockHeight}. Receipt stays unverified until its ledger state is queried independently.</>
            ) : (
              <button type="button" className="authorize-button" disabled={compactBusy} onClick={() => { void compactSettlement.settle(amount, settlementRecipient.trim(), intentLabel || 'USDM settlement') }}>
                <span>{compactSettlement.status === 'settling' ? 'Executing Compact settlement…' : `Settle ${amount} USDM with Compact`}</span><b aria-hidden="true">→</b>
              </button>
            )}
          </div>
        )}

        {compactSettlement.error && (
          <div className="handoff-note evidence-unavailable">
            <strong>Compact action not verified.</strong> {compactSettlement.error}
          </div>
        )}
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
            <div><dt>Midnight wallet network</dt><dd><code>{midnight.networkId ?? 'not validated'}</code></dd></div>
            <div><dt>Required Midnight network</dt><dd><code>{MIDNIGHT_NETWORK_ID}</code></dd></div>
            <div><dt>Proof execution</dt><dd>{direction === 'midnight-to-cardano' ? 'Wallet-local proving' : compactSettlement.status === 'settling' || compactSettlement.status === 'verified' ? 'Wallet-local Compact proving' : 'Not required on source leg'}</dd></div>
            <div><dt>Raw bridge phase</dt><dd><code>{activeStep}</code></dd></div>
            <div><dt>Source finality evidence</dt><dd><code>{sourceFinalityEvidence.status}</code></dd></div>
            <div><dt>VIA attribution evidence</dt><dd><code>{viaEvidence.status}</code></dd></div>
            <div><dt>Source address</dt><dd><code>{sourceAddress || 'not connected'}</code></dd></div>
            <div><dt>Destination</dt><dd><code>{recipient || 'not resolved'}</code></dd></div>
            <div><dt>Destination evidence</dt><dd><code>{deliveryEvidence.status}</code></dd></div>
            {deliveryEvidence.snapshot && <div><dt>Destination baseline / target</dt><dd><code>{formatBalance(deliveryEvidence.snapshot.baseline)} → {formatBalance(deliveryEvidence.snapshot.target)} USDM</code></dd></div>}
            {deliveryEvidence.verifiedBalance != null && <div><dt>Verified destination balance</dt><dd><code>{formatBalance(deliveryEvidence.verifiedBalance)} USDM</code></dd></div>}
            {direction === 'cardano-to-midnight' && <div><dt>Compact browser assets</dt><dd><code>{compactSettlement.compiledReady ? 'compiled/prepared' : 'stub locked'}</code></dd></div>}
            {direction === 'cardano-to-midnight' && <div><dt>Compact settlement deployment</dt><dd><code>{compactSettlement.contractAddress || MIDNIGHT_SETTLEMENT_CONTRACT_ADDRESS || 'not deployed/configured'}</code></dd></div>}
            {direction === 'cardano-to-midnight' && <div><dt>Compact settlement status</dt><dd><code>{compactSettlement.status}</code></dd></div>}
            {direction === 'cardano-to-midnight' && <div><dt>Compact payee</dt><dd><code>{settlementRecipient || 'not resolved'}</code></dd></div>}
            {compactSettlement.execution && <div><dt>Compact settlement tx</dt><dd><code>{compactSettlement.execution.txId}</code></dd></div>}
            {compactSettlement.execution && <div><dt>Settlement id</dt><dd><code>{compactSettlement.execution.settlementId}</code></dd></div>}
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
