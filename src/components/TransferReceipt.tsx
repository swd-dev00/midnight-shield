import { useEffect, useMemo, useRef, useState } from 'react'
import { useTransferEvidence } from '../hooks/useTransferEvidence'
import { canonicalJson, correlate, finalizeTransferReceipt, inspectReceiptFile, type Json, type TransferIntent } from '../lib/transferReceipt'

const displayUsdm = (value: string) => {
  const amount = BigInt(value), fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return `${amount / 1_000_000n}${fraction ? '.' + fraction : ''} USDM`
}
const midnightLink = (hash: string) => `https://explorer.1am.xyz/tx/${encodeURIComponent(hash)}?network=preview`
function CopyValue({ label, value, disabled = false }: { label: string; value: string | null; disabled?: boolean }) {
  const [status, setStatus] = useState('')
  useEffect(() => { setStatus('') }, [value])
  return <span className="receipt-copy"><button type="button" className="text-button" disabled={!value || disabled} onClick={async () => {
    try { await navigator.clipboard.writeText(value!); setStatus('Copied') }
    catch { setStatus('Clipboard unavailable. Download the JSON instead.') }
  }}>{label}</button><small role="status">{status}</small></span>
}
function BoundaryCards({ intent, result, saved = false }: { intent: TransferIntent | null; result: ReturnType<typeof correlate> | null; saved?: boolean }) {
  const forward = intent?.direction !== 'midnight-to-cardano'
  return <>{([
    { key: 'source', title: '01 · Source acceptance', network: forward ? 'Cardano Preprod' : 'Midnight Preview' },
    { key: 'transport', title: '02 · VIA transport', network: 'VIA Network' },
    { key: 'destination', title: '03 · Destination arrival', network: forward ? 'Midnight Preview' : 'Cardano Preprod' },
  ] as const).map(({ key, title, network }) => {
    const boundary = result?.[key]
    return <article key={key} data-status={boundary?.status ?? 'unverified'}>
      <h2>{title}</h2><p>{network}</p>
      <strong>{boundary?.status === 'verified' ? saved ? 'Consistent with saved evidence' : 'Verified against provider' : boundary?.status === 'reported' ? 'Reported by SDK' : 'Unverified'}</strong>
      <p>{boundary?.detail ?? 'No transaction evidence captured for this boundary.'}</p>
      {boundary?.transactionId && <p><span>Transaction</span><code>{boundary.transactionId}</code></p>}
      {boundary?.messageId && <p><span>VIA message</span><code>{boundary.messageId}</code></p>}
      {boundary?.block && <p>Block {boundary.block}{network === 'Midnight Preview' && /^[0-9]+$/.test(boundary.block) && <> · <a target="_blank" rel="noreferrer" href={`https://explorer.1am.xyz/block/${boundary.block}?network=preview`}>Open Midnight block ↗</a></>}</p>}
      {boundary?.blockHash && <p><span>Block hash</span><code>{boundary.blockHash}</code></p>}
      {boundary?.contractCall && <p>VIA gateway · {boundary.contractCall.entryPoint}() · {boundary.contractCall.status}. This is VIA execution, not our Compact settlement.</p>}
      {boundary?.fees && <details><summary>Indexer fee fields</summary><p>paidFees: {boundary.fees.paidFees} · estimatedFees: {boundary.fees.estimatedFees}</p></details>}
      {boundary?.amountBaseUnits && <p>{displayUsdm(boundary.amountBaseUnits)}</p>}
      {boundary?.timestamp && <p><time dateTime={boundary.timestamp}>{boundary.timestamp}</time></p>}
      {key !== 'transport' && boundary?.transactionId && (/^[a-f0-9]{64}$/i.test(boundary.transactionId)) && <a target="_blank" rel="noreferrer" href={network === 'Cardano Preprod' ? `https://preprod.cardanoscan.io/transaction/${boundary.transactionId}` : midnightLink(boundary.transactionId)}>{network === 'Cardano Preprod' ? 'Open Cardano transaction' : 'Open transaction in 1AM Explorer'} ↗</a>}
      {key === 'transport' && boundary?.messageId && <a target="_blank" rel="noreferrer" href={`https://scan.vialabs.tech/tx/${encodeURIComponent(boundary.messageId)}`}>Open message in VIA Scan ↗</a>}
    </article>
  })}</>
}
function ApplicationCards({ applicationSettlement, returnProofObservation }: { applicationSettlement?: Json; returnProofObservation?: Json }) {
  const report = applicationSettlement && typeof applicationSettlement === 'object' && !Array.isArray(applicationSettlement) ? applicationSettlement : null
  const hash = typeof report?.txHash === 'string' && /^[a-f0-9]{64}$/i.test(report.txHash) ? report.txHash : null
  return <>
    <article data-status="unverified"><h2>04 · Local proof</h2><p>Runtime evidence</p><strong>Unverified</strong>
      <p>No operation-linked evidence establishes browser WASM execution. Wallet identity and an accepted on-chain proof do not establish where it was generated.</p>
      {returnProofObservation && <details><summary>Return transfer observations</summary><p>VIA's proving phase includes proof, balance, and submission. These durations are not pure proof times.</p><pre>{JSON.stringify(returnProofObservation, null, 2)}</pre></details>}
    </article>
    <article data-status="unverified"><h2>05 · Application settlement</h2><p>Compact · settle(...)</p><strong>{hash ? 'Execution reported · correlation unverified' : 'Unverified'}</strong>
      <p>The settlement state must commit to this transfer's evidence before the entire operation can be marked verified.</p>
      {hash && <><code>{hash}</code><a target="_blank" rel="noreferrer" href={midnightLink(hash)}>Open Compact transaction in 1AM Explorer ↗</a></>}
      {report && <details><summary>Settlement execution report</summary><p>This report is not independently replayable settlement-state evidence.</p><pre>{JSON.stringify(report, null, 2)}</pre></details>}
    </article>
  </>
}
type Props = { intent: TransferIntent | null; sourceHash: string | null; acceptedAt: string | null; balanceObservation: Json; applicationSettlement?: Json; returnProofObservation?: Json }
export function TransferReceipt({ intent, sourceHash, acceptedAt, balanceObservation, applicationSettlement = null, returnProofObservation = null }: Props) {
  const { reads, reading, evidenceKey, evidenceSettled, refresh } = useTransferEvidence(intent, sourceHash)
  const [preparedReceipt, setPreparedReceipt] = useState<{ key: string; value: Awaited<ReturnType<typeof finalizeTransferReceipt>> } | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [fileResult, setFileResult] = useState('')
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof inspectReceiptFile>> | null>(null)
  const [checkingFile, setCheckingFile] = useState(false)
  const fileRevision = useRef(0)
  const result = useMemo(() => intent ? correlate(intent, sourceHash, acceptedAt, reads) : null, [intent, sourceHash, acceptedAt, reads])
  const supplementalJson = canonicalJson({ balanceObservation, applicationSettlement, returnProofObservation })
  const receiptKey = canonicalJson({ intent, sourceHash, acceptedAt, reads, supplementalJson, evidenceKey })
  const receipt = preparedReceipt?.key === receiptKey ? preparedReceipt.value : null
  useEffect(() => {
    let cancelled = false
    setPreparedReceipt(null); setReceiptError(null)
    if (intent && evidenceSettled) void finalizeTransferReceipt({ intent, sourceTransactionId: sourceHash, sdkAcceptedAt: acceptedAt, reads, ...JSON.parse(supplementalJson) }).then(value => { if (!cancelled) setPreparedReceipt({ key: receiptKey, value }) }).catch(error => { if (!cancelled) setReceiptError(error instanceof Error ? error.message : 'Could not finalize receipt') })
    return () => { cancelled = true }
  }, [intent, sourceHash, acceptedAt, reads, supplementalJson, receiptKey, evidenceSettled])
  const download = () => {
    if (!receipt || receipt.snapshotState !== 'finalized' || !receipt.finalizedAt) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2) + '\n'], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `via-receipt-${receipt.receiptHash.slice(0, 16)}.json`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="transfer-receipt" aria-labelledby="transfer-receipt-title">
    <div className="section-heading"><span id="transfer-receipt-title">Settlement receipt</span><small>Independent evidence</small></div>
    <p>Correlate Cardano, VIA, Midnight, local proof, and Compact settlement into one operation. Open the linked explorers to inspect each public record.</p>
    <div className="receipt-boundaries"><BoundaryCards intent={intent} result={result} /><ApplicationCards applicationSettlement={applicationSettlement} returnProofObservation={returnProofObservation} /></div>
    <dl className="receipt-summary">
      <div><dt>Transfer evidence</dt><dd>{result?.completeness ?? 0} / 3</dd></div>
      <div><dt>Operation evidence</dt><dd>{result?.completeness ?? 0} / 5 · incomplete</dd></div>
      <div><dt>Transfer route integrity</dt><dd>{result?.routeIntegrity ?? 'unverified'}</dd></div>
      <div><dt>Transfer amount continuity</dt><dd>{result?.amountContinuity ?? 'unverified'}</dd></div>
      <div><dt>Settlement continuity</dt><dd>Unverified</dd></div>
      <div><dt>Receipt snapshot</dt><dd>{reading ? 'Reading evidence' : receipt ? `Frozen ${receipt.finalizedAt}` : 'Waiting for a completed evidence read'}</dd></div>
      <div><dt>Receipt hash · SHA-256</dt><dd><code>{receipt?.receiptHash ?? 'Available after the snapshot is frozen'}</code></dd></div>
    </dl>
    <p className="receipt-trust">Transfer checks rely on Koios, VIA Scan, and the Preview indexer. A balance increase alone does not identify this transfer. File hashes establish integrity; they do not authenticate chain data or an author.</p>
    <div className="receipt-actions">
      <button type="button" className="text-button" disabled={!intent || !sourceHash || reading || intent.direction !== 'cardano-to-midnight'} onClick={refresh}>{reading ? 'Reading independent evidence…' : 'Check transfer evidence'}</button>
      <button type="button" className="text-button" disabled={!receipt} aria-describedby="receipt-download-help" onClick={download}>Download {result?.completeness === 3 ? 'verified transfer' : 'partial'} receipt</button>
      <CopyValue label="Copy canonical JSON" value={receipt ? canonicalJson(receipt) : null} />
      <CopyValue label="Copy receipt hash" value={receipt?.receiptHash ?? null} />
    </div>
    <p id="receipt-download-help" role="status">{reading ? 'Reading transaction records. Download remains locked until this evidence read finishes and its receipt is frozen.' : receipt ? 'Frozen receipt ready. Local proof and Compact settlement remain explicitly unverified in this snapshot.' : sourceHash ? 'Finalizing the completed evidence snapshot.' : intent ? 'No source transaction identifier is available yet. Check wallet history if authorization had an uncertain outcome.' : 'No new operation captured. You can inspect a saved receipt below without connecting a wallet.'}</p>
    {receiptError && <p role="alert">{receiptError}</p>}
    <details className="receipt-file-check">
      <summary>Inspect a saved receipt · no wallet required</summary>
      <label htmlFor="receipt-file">Receipt JSON file · up to 2 MB</label>
      <input type="file" id="receipt-file" name="receipt-file" accept="application/json,.json" onChange={async event => {
        const version = ++fileRevision.current, file = event.target.files?.[0]
        setFileResult(''); setSaved(null); setCheckingFile(Boolean(file))
        if (!file) return
        try {
          if (file.size > 2_000_000) throw new Error('Receipt exceeds the 2 MB limit')
          const value = await inspectReceiptFile(await file.text())
          if (version === fileRevision.current) { setSaved(value); setFileResult(value.integrity) }
        } catch (error) { if (version === fileRevision.current) setFileResult(error instanceof Error ? error.message : 'Invalid receipt file') }
        finally { if (version === fileRevision.current) setCheckingFile(false) }
      }} />
      <p role="status">{checkingFile ? 'Checking file hashes…' : fileResult || 'The file stays in this browser. Inspection makes no wallet or network requests.'}</p>
      {saved && <section className="saved-receipt" aria-label="Saved receipt evidence">
        <h2>Saved operation</h2>{saved.record.intentOrigin === 'reconstructed-from-public-evidence' && <p>Intent reconstructed from public transaction records; authorization was not captured by this app.</p>}<p>Correlations are recalculated from the saved provider responses. These are historical observations; saved success labels are not trusted. Explorer links let you check public records independently.</p>
        <div className="receipt-boundaries"><BoundaryCards intent={saved.intent} result={saved.result} saved /><ApplicationCards /></div>
        <p>Transfer evidence: {saved.result.completeness} / 3 · Operation evidence: {saved.result.completeness} / 5 · Settlement continuity: unverified</p>
        <code>{String(saved.record.receiptHash)}</code>
        <div className="receipt-actions"><CopyValue label="Copy saved canonical JSON" value={canonicalJson(saved.record)} /><CopyValue label="Copy saved receipt hash" value={String(saved.record.receiptHash)} /></div>
        <details><summary>Canonical JSON · includes receipt hash</summary><pre>{canonicalJson(saved.record)}</pre></details>
      </section>}
    </details>
  </section>
}
