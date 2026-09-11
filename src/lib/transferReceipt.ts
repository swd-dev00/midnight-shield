import { bech32, bech32m } from 'bech32'
/** Read-only correlation for VIA USDM SDK 1.2.0's deployed testnet pair. */
export const RECEIPT_ROUTE = { source: 'cardano-preprod', transport: 'via', destination: 'midnight-preview' } as const
export const DEPLOYED_USDM = {
  sourceTokenHash: '48e0d0b7cea01816ba68445fed666b0467148bc06d7fcdb36ed9d7b4bd5eaf24',
  cardanoUnit: 'e675b46e4d2242c991a8932a99db3044e80515ae14b4c4ccf6b3f4c90014df10745553444d',
  midnightColor: '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73',
  cardanoClient: '76fbe9f6c8761cc6744c34a1f30915037e38c01197d6e7c9d2fcc1d3',
  midnightContract: '471dfe55c866fdbc085c9011a51f0cd0e9c9bfca6bb985c35f7716b6e73e485c',
  cardanoLockAddress: 'addr_test1wpm0h60kepmpe3n5fs62rucfz5phuwxqzxtade7f6t7vr5clear6h',
} as const
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type TransferIntent = {
  direction: 'cardano-to-midnight' | 'midnight-to-cardano'
  amount: string; amountBaseUnits: string; recipient: string; recipientKey: string
  sourceAddress: string; submittedAt: string
}
export type Observation = { provider: string; observedAt: string; payload: Json }
export type EvidenceRead = { observation: Observation | null; error: string | null }
export type TransferReads = { source: EvidenceRead; transport: EvidenceRead; destination: EvidenceRead }
export const emptyReads = (): TransferReads => ({ source: { observation: null, error: null }, transport: { observation: null, error: null }, destination: { observation: null, error: null } })

/** Versioned canonical JSON: sorted UTF-16 keys, JSON numbers, UTF-8, no whitespace. */
export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 64) throw new Error('Receipt nesting exceeds the supported limit')
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error('Invalid Unicode in receipt')
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error('Sparse arrays are not supported')
    return '[' + value.map(v => canonicalJson(v, depth + 1)).join(',') + ']'
  }
  if (typeof value === 'object' && value && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return '{' + Object.keys(value).sort().map(key => canonicalJson(key, depth + 1) + ':' + canonicalJson((value as Record<string, unknown>)[key], depth + 1)).join(',') + '}'
  }
  throw new Error('Receipt contains unsupported JSON data')
}
export async function evidenceHash(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Evidence response is not an object')
  return v as Record<string, unknown>
}
const list = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw new Error('Evidence response is not a list'); return v }
const hex = (v: unknown): string => typeof v === 'string' ? v.replace(/^0x/, '').toLowerCase() : ''
const txHash = (v: unknown): string => { const h = hex(v); if (!/^[a-f0-9]{64}$/.test(h)) throw new Error('Invalid transaction hash'); return h }
const units = (v: unknown): bigint => {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v)) throw new Error('Expected exact integer token units')
  return BigInt(v)
}
const timestamp = (v: unknown): string => {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) return new Date(v).toISOString()
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new Error('Missing evidence timestamp')
  return v
}
export type Boundary = { status: 'verified' | 'reported' | 'unverified'; detail: string; transactionId: string | null; amountBaseUnits: string | null; block: string | null; timestamp: string | null; messageId: string | null; blockHash?: string | null; contractCall?: { address: string; entryPoint: string; status: string } | null; fees?: { paidFees: string; estimatedFees: string } | null }
const missing = (detail: string): Boundary => ({ status: 'unverified', detail, transactionId: null, amountBaseUnits: null, block: null, timestamp: null, messageId: null })
function lockBalance(outputs: unknown): bigint {
  return list(outputs).reduce<bigint>((sum, item) => {
    const row = object(item)
    if (object(row.payment_addr).bech32 !== DEPLOYED_USDM.cardanoLockAddress) return sum
    return sum + list(row.asset_list).reduce<bigint>((total, a) => {
      const asset = object(a)
      return String(asset.policy_id) + String(asset.asset_name) === DEPLOYED_USDM.cardanoUnit ? total + units(asset.quantity) : total
    }, 0n)
  }, 0n)
}
export function verifySource(payload: unknown, hash: string, intent: TransferIntent): Boundary {
  const data = object(payload), status = object(data.status), info = object(data.info), utxos = object(data.utxos)
  for (const row of [status, info, utxos]) if (txHash(row.tx_hash) !== txHash(hash)) throw new Error('Cardano response does not match the source transaction')
  if (!Number.isSafeInteger(Number(status.num_confirmations)) || !(Number(status.num_confirmations) > 0) || info.valid_contract === false || !Number.isSafeInteger(info.block_height) || Number(info.block_height) <= 0) throw new Error('Cardano transaction is unconfirmed or explicitly invalid')
  if (units(intent.amountBaseUnits) <= 0n) throw new Error('Transfer amount must be positive')
  const amount = lockBalance(utxos.outputs) - lockBalance(utxos.inputs)
  if (amount !== units(intent.amountBaseUnits)) throw new Error('Locked USDM amount does not match the authorized amount')
  if (typeof info.tx_timestamp !== 'number' || !Number.isFinite(info.tx_timestamp)) throw new Error('Missing Cardano block timestamp')
  return { ...missing(''), status: 'verified', detail: 'Koios confirms source inclusion and the exact USDM increase at VIA’s deployed lock address.', transactionId: txHash(hash), amountBaseUnits: amount.toString(), block: String(info.block_height), timestamp: new Date(info.tx_timestamp * 1000).toISOString() }
}
export function verifyTransport(payload: unknown, hash: string, intent?: TransferIntent): Boundary {
  const row = object(payload)
  if (txHash(row.sourceTx) !== txHash(hash)) throw new Error('VIA source transaction does not match this intent')
  if (row.chainType !== 'testnet' || String(row.sourceChainId) !== '2273266' || String(row.destinationChainId) !== '64364450') throw new Error('VIA route is not Cardano Preprod to Midnight Preview')
  if (![DEPLOYED_USDM.cardanoClient, DEPLOYED_USDM.cardanoClient.padStart(64, '0')].includes(hex(row.sourceContract)) || hex(row.destinationContract) !== DEPLOYED_USDM.midnightContract) throw new Error('VIA contract identities do not match the deployed USDM route')
  if (typeof row.messageId !== 'string' || !/^[0-9]{1,100}$/.test(row.messageId)) throw new Error('Missing VIA message identifier')
  if (!row.deliveredAt || !row.destinationTx) throw new Error('VIA delivery is still pending')
  const deposit = hex(row.payload)
  if (!/^[a-f0-9]+$/.test(deposit) || deposit.slice(0, 16) !== '56494c5200000001' || deposit.length < 408) throw new Error('Unrecognized VIA USDM deposit payload')
  const hookLength = Number.parseInt(deposit.slice(400, 408), 16)
  if (deposit.length !== 408 + hookLength * 2 || deposit.slice(80, 144) !== DEPLOYED_USDM.sourceTokenHash || deposit.slice(208, 272) !== DEPLOYED_USDM.midnightColor) throw new Error('VIA payload asset identity or length is invalid')
  if (intent) {
    const source = bech32.decode(intent.sourceAddress, 1000), sourceBytes = bech32.fromWords(source.words)
    const sourceKey = sourceBytes.slice(1, 29).map(b => b.toString(16).padStart(2, '0')).join('')
    if (source.prefix !== 'addr_test' || (sourceBytes[0] & 15) !== 0 || sourceBytes.length < 29 || deposit.slice(144, 208) !== '00000000' + sourceKey) throw new Error('VIA deposit sender does not match the authorized Cardano account')
    if (BigInt('0x' + deposit.slice(16, 80)) !== units(intent.amountBaseUnits) || deposit.slice(272, 336) !== intent.recipientKey) throw new Error('VIA payload amount or recipient does not match the intent')
  }
  return { ...missing(''), status: 'verified', detail: 'VIA Scan reports delivery and links this source transaction to the deployed Preview contract. Validator signatures are not independently verified.', transactionId: txHash(row.destinationTx), amountBaseUnits: BigInt('0x' + deposit.slice(16, 80)).toString(), timestamp: timestamp(row.deliveredAt), block: row.destinationBlockNumber == null ? null : String(row.destinationBlockNumber), messageId: row.messageId }
}
export function verifyDestination(payload: unknown, transport: Boundary, intent: TransferIntent): Boundary {
  const row = object(payload)
  if (transport.status !== 'verified' || txHash(row.hash) !== txHash(transport.transactionId)) throw new Error('Midnight transaction is not linked to the verified VIA record')
  if (object(row.transactionResult).status !== 'SUCCESS') throw new Error('Midnight transaction has not fully succeeded')
  const block = object(row.block)
  if (!Number.isSafeInteger(block.height) || Number(block.height) <= 0) throw new Error('Missing Midnight block inclusion')
  if (transport.block !== null && String(block.height) !== transport.block) throw new Error('VIA and Midnight destination blocks disagree')
  if (!/^[a-f0-9]{64}$/.test(intent.recipientKey)) throw new Error('Missing Preview recipient key')
  const ownerKey = (value: unknown): string => {
    if (typeof value !== 'string') return ''
    if (!value.startsWith('mn_')) return hex(value)
    const decoded = bech32m.decode(value, 1000)
    if (decoded.prefix !== 'mn_addr_preview') throw new Error('Destination owner is on the wrong Midnight network')
    return bech32m.fromWords(decoded.words).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  const total = (outputs: unknown) => list(outputs).reduce<bigint>((sum, item) => {
    const output = object(item)
    return ownerKey(output.owner) === intent.recipientKey && hex(output.tokenType) === DEPLOYED_USDM.midnightColor ? sum + units(output.value) : sum
  }, 0n)
  const amount = total(row.unshieldedCreatedOutputs) - total(row.unshieldedSpentOutputs)
  if (amount !== units(intent.amountBaseUnits)) throw new Error('Destination recipient’s net USDM amount does not match the intent')
  const call = Array.isArray(row.contractActions) ? row.contractActions.find(action => {
    const value = object(action)
    return value.__typename === 'ContractCall' && hex(value.address) === DEPLOYED_USDM.midnightContract && value.entryPoint === 'process'
  }) : null
  const contractCall = call ? { address: DEPLOYED_USDM.midnightContract, entryPoint: 'process', status: 'SUCCESS' } : null
  const feeData = row.fees ? object(row.fees) : null
  const fees = feeData && typeof feeData.paidFees === 'string' && typeof feeData.estimatedFees === 'string' && /^[0-9]+(\.[0-9]+)?$/.test(feeData.paidFees) && /^[0-9]+(\.[0-9]+)?$/.test(feeData.estimatedFees) ? { paidFees: feeData.paidFees, estimatedFees: feeData.estimatedFees } : null
  return { ...missing(''), status: 'verified', detail: 'Preview indexer confirms the VIA-linked transaction succeeded and credited the exact USDM amount to the intended recipient.', transactionId: txHash(row.hash), amountBaseUnits: amount.toString(), block: String(block.height), timestamp: timestamp(block.timestamp), blockHash: block.hash ? txHash(block.hash) : null, contractCall, fees }
}
export function correlate(intent: TransferIntent, hash: string | null, acceptedAt: string | null, reads: TransferReads) {
  const check = (read: EvidenceRead, verify: (p: Json) => Boundary, fallback: string): Boundary => {
    if (!read.observation) return missing(read.error || fallback)
    try { return verify(read.observation.payload) } catch (e) { return missing(e instanceof Error ? e.message : 'Evidence mismatch') }
  }
  const supported = intent.direction === 'cardano-to-midnight'
  const source = check(reads.source, p => verifySource(p, hash || '', intent), 'Independent Cardano evidence has not been read.')
  if (source.status !== 'verified' && hash && acceptedAt) { source.status = 'reported'; source.transactionId = hash; source.timestamp = acceptedAt; source.detail = 'SDK reported source acceptance. ' + source.detail }
  const transport = check(reads.transport, p => verifyTransport(p, hash || '', intent), 'VIA delivery has not been independently located.')
  if (source.status === 'verified' && transport.status === 'verified' && reads.transport.observation) {
    const block = object(reads.transport.observation.payload).sourceBlockNumber
    if (block != null && String(block) !== source.block) { transport.status = 'unverified'; transport.detail = 'VIA and Cardano source blocks disagree' }
  }
  const destination = check(reads.destination, p => verifyDestination(p, transport, intent), 'The VIA-linked Preview transaction has not been verified.')
  if (!supported) return { source: missing('Receipt correlation currently supports Cardano → Midnight only.'), transport: missing('Reverse-route correlation is unavailable.'), destination: missing('Reverse-route correlation is unavailable.'), completeness: 0, routeIntegrity: 'unverified', amountContinuity: 'unverified' }
  const completeness = [source, transport, destination].filter(b => b.status === 'verified').length
  return { source, transport, destination, completeness, routeIntegrity: completeness === 3 ? 'verified' : 'unverified', amountContinuity: completeness === 3 && source.amountBaseUnits === destination.amountBaseUnits && source.amountBaseUnits === transport.amountBaseUnits ? 'verified' : 'unverified' }
}
export type ReceiptInput = { intent: TransferIntent; sourceTransactionId: string | null; sdkAcceptedAt: string | null; reads: TransferReads; balanceObservation: Json }
export async function createTransferReceipt(input: ReceiptInput & { applicationSettlement?: Json; returnProofObservation?: Json; intentOrigin?: 'captured-in-app' | 'reconstructed-from-public-evidence' }) {
  const observations = Object.fromEntries(await Promise.all(Object.entries(input.reads).map(async ([key, value]) => [key, value.observation ? { ...value.observation, evidenceHash: await evidenceHash(value.observation) } : null])))
  const result = correlate(input.intent, input.sourceTransactionId, input.sdkAcceptedAt, input.reads)
  const record = {
    receiptVersion: '1.1', canonicalization: 'settlement-studio-json-v1', hashAlgorithm: 'SHA-256', asset: 'USDM', decimals: 6,
    route: input.intent.direction === 'cardano-to-midnight' ? RECEIPT_ROUTE : { source: 'midnight-preview', transport: 'via', destination: 'cardano-preprod' },
    intentOrigin: input.intentOrigin ?? 'captured-in-app',
    intent: { direction: input.intent.direction, amount: input.intent.amount, amountBaseUnits: input.intent.amountBaseUnits, recipient: input.intent.recipient, recipientKey: input.intent.recipientKey, sourceAddress: input.intent.sourceAddress, submittedAt: input.intent.submittedAt }, sourceTransactionId: input.sourceTransactionId, sdkAcceptedAt: input.sdkAcceptedAt,
    source: result.source, transport: result.transport, destination: result.destination,
    correlation: { sourceToTransport: result.source.status === 'verified' && result.transport.status === 'verified' ? input.sourceTransactionId : null, transportToDestination: result.destination.status === 'verified' ? result.transport.transactionId : null, evidenceCompleteness: result.completeness, routeIntegrity: result.routeIntegrity, amountContinuity: result.amountContinuity },
    operation: {
      requiredEvidenceBoundaries: 5, verifiedEvidenceBoundaries: result.completeness, continuity: 'unverified',
      localProof: { status: 'unverified', runtime: 'unknown', detail: 'Connector API v4 does not attest the selected proving mode. A chain proof does not establish where it was generated.' },
      applicationSettlement: { status: 'unverified', detail: 'Requires indexed Compact state and an explicit commitment linking it to this transfer. An SDK execution report alone does not establish that link.', report: input.applicationSettlement ?? null },
      returnProofObservation: input.returnProofObservation ?? null,
    },
    evidence: observations, readErrors: Object.fromEntries(Object.entries(input.reads).map(([key, value]) => [key, value.error])),
    balanceObservation: input.balanceObservation,
    verificationBasis: 'Read-only Koios Preprod, VIA Scan, and Midnight Preview indexer responses. These providers are trusted; this is not a light-client or validator-signature proof. Balance observations do not establish transfer attribution. Hashes establish record integrity, not authenticity.',
  }
  return { ...record, receiptHash: await evidenceHash(record) }
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

/** Create the only receipt shape that may be downloaded: a timestamped, immutable snapshot. */
export async function finalizeTransferReceipt(
  input: ReceiptInput & { applicationSettlement?: Json; returnProofObservation?: Json; intentOrigin?: 'captured-in-app' | 'reconstructed-from-public-evidence' },
  finalizedAt = new Date().toISOString(),
) {
  if (!Number.isFinite(Date.parse(finalizedAt))) throw new Error('Invalid receipt finalization timestamp')
  const draft = await createTransferReceipt(input)
  const { receiptHash: _draftHash, ...draftRecord } = draft
  const record = { ...draftRecord, receiptVersion: '1.2', snapshotState: 'finalized', finalizedAt }
  return deepFreeze({ ...record, receiptHash: await evidenceHash(record) })
}

export async function verifyReceiptFile(text: string): Promise<string> {
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error('Receipt exceeds the 2 MB limit')
  const parsed = object(JSON.parse(text)), { receiptHash: expected, ...record } = parsed
  if (!['1.0', '1.1', '1.2'].includes(String(record.receiptVersion)) || record.canonicalization !== 'settlement-studio-json-v1' || record.hashAlgorithm !== 'SHA-256') throw new Error('Unsupported receipt format')
  if (record.receiptVersion === '1.2' && (record.snapshotState !== 'finalized' || typeof record.finalizedAt !== 'string' || !Number.isFinite(Date.parse(record.finalizedAt)))) throw new Error('Receipt snapshot was not finalized')
  if (expected !== await evidenceHash(record)) throw new Error('Receipt hash mismatch: this record was changed or damaged')
  for (const entry of Object.values(object(record.evidence))) {
    if (entry === null) continue
    const { evidenceHash: expectedEvidence, ...observation } = object(entry)
    if (expectedEvidence !== await evidenceHash(observation)) throw new Error('Evidence hash mismatch')
  }
  return 'File hashes match. This verifies file integrity only; it does not authenticate the author or recheck the chains.'
}

/** Recompute transfer correlations from a hash-checked file; never trust its saved success labels. */
export async function inspectReceiptFile(text: string) {
  const integrity = await verifyReceiptFile(text)
  const record = object(JSON.parse(text)), rawIntent = object(record.intent)
  if (!['cardano-to-midnight', 'midnight-to-cardano'].includes(String(rawIntent.direction))) throw new Error('Unsupported receipt direction')
  for (const field of ['amount', 'amountBaseUnits', 'recipient', 'recipientKey', 'sourceAddress', 'submittedAt']) {
    if (typeof rawIntent[field] !== 'string') throw new Error('Invalid receipt intent: ' + field)
  }
  units(rawIntent.amountBaseUnits)
  const sourceHash = record.sourceTransactionId === null ? null : txHash(record.sourceTransactionId)
  if (record.sdkAcceptedAt !== null && (typeof record.sdkAcceptedAt !== 'string' || !Number.isFinite(Date.parse(record.sdkAcceptedAt)))) throw new Error('Invalid source acceptance timestamp')
  const reads = emptyReads(), evidence = object(record.evidence)
  for (const key of ['source', 'transport', 'destination'] as const) {
    const entry = evidence[key]
    if (entry === null) continue
    const observation = object(entry)
    if (typeof observation.provider !== 'string' || typeof observation.observedAt !== 'string' || !('payload' in observation)) throw new Error('Invalid observation: ' + key)
    reads[key] = { observation: { provider: observation.provider, observedAt: observation.observedAt, payload: observation.payload as Json }, error: null }
  }
  const intent = rawIntent as TransferIntent
  return { integrity, record, intent, sourceHash, result: correlate(intent, sourceHash, record.sdkAcceptedAt as string | null, reads) }
}
