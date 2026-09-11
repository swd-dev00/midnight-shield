import { bech32, bech32m } from 'bech32'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { canonicalJson, evidenceHash, createTransferReceipt, finalizeTransferReceipt, verifyReceiptFile, inspectReceiptFile, correlate, verifySource, verifyTransport, verifyDestination, emptyReads, DEPLOYED_USDM } from '../src/lib/transferReceipt.ts'

const sourceHash = 'aa'.repeat(32), destinationHash = 'bb'.repeat(32), owner = 'cc'.repeat(32)
const intent = { direction: 'cardano-to-midnight', amount: '1.000001', amountBaseUnits: '1000001', recipient: 'fixture-recipient', recipientKey: owner, sourceAddress: bech32.encode('addr_test', bech32.toWords([0x60, ...Array(28).fill(5)]), 1000), submittedAt: '2026-09-10T10:00:00.000Z' }
const asset = quantity => ({ policy_id: DEPLOYED_USDM.cardanoUnit.slice(0, 56), asset_name: DEPLOYED_USDM.cardanoUnit.slice(56), quantity })
const output = quantity => ({ payment_addr: { bech32: DEPLOYED_USDM.cardanoLockAddress }, asset_list: [asset(quantity)] })
const source = () => ({ status: { tx_hash: sourceHash, num_confirmations: 2 }, info: { tx_hash: sourceHash, block_height: 100, block_hash: 'dd'.repeat(32), valid_contract: true, tx_timestamp: 1789034400 }, utxos: { tx_hash: sourceHash, inputs: [output('5000000')], outputs: [output('6000001')] } })
const transport = () => ({ sourceTx: sourceHash, destinationTx: destinationHash, sourceChainId: '2273266', destinationChainId: '64364450', sourceContract: DEPLOYED_USDM.cardanoClient, destinationContract: DEPLOYED_USDM.midnightContract, chainType: 'testnet', messageId: '22732660000000001', requestedAt: '2026-09-10T10:00:30.000Z', deliveredAt: '2026-09-10T10:01:00.000Z', destinationBlockNumber: '101', payload: '0x56494c5200000001' + BigInt(intent.amountBaseUnits).toString(16).padStart(64, '0') + DEPLOYED_USDM.sourceTokenHash + '00000000' + '05'.repeat(28) + DEPLOYED_USDM.midnightColor + owner + '0'.repeat(72) })
const destination = () => ({ hash: destinationHash, block: { height: 101, timestamp: '2026-09-10T10:01:00.000Z' }, transactionResult: { status: 'SUCCESS' }, unshieldedCreatedOutputs: [{ owner, tokenType: DEPLOYED_USDM.midnightColor, value: '1000001' }], unshieldedSpentOutputs: [] })
const observed = payload => ({ observation: { provider: 'test fixture only', observedAt: '2026-09-10T10:02:00.000Z', payload }, error: null })
const reads = () => ({ source: observed(source()), transport: observed(transport()), destination: observed(destination()) })
const input = () => ({ intent, sourceTransactionId: sourceHash, sdkAcceptedAt: '2026-09-10T10:00:20.000Z', reads: reads(), balanceObservation: null })

test('canonical representation and SHA-256 are deterministic across key order', async () => {
  assert.equal(canonicalJson({ z: [3, null], a: 'é' }), '{"a":"é","z":[3,null]}')
  assert.equal(await evidenceHash({ b: 2, a: 1 }), createHash('sha256').update('{"a":1,"b":2}').digest('hex'))
  assert.equal(await evidenceHash({ a: 1, b: 2 }), await evidenceHash({ b: 2, a: 1 }))
  for (const unsupported of [undefined, NaN, Infinity, 1n, new Date(), { a: undefined }, '\ud800', Array(2)]) assert.throws(() => canonicalJson(unsupported))
})
test('same immutable observations produce the same receipt and root hash', async () => {
  const a = await createTransferReceipt(input()), b = await createTransferReceipt(input())
  assert.deepEqual(a, b)
  assert.equal(a.correlation.evidenceCompleteness, 3)
  assert.equal(a.correlation.amountContinuity, 'verified')
  assert.match(await verifyReceiptFile(JSON.stringify(a)), /integrity only/)
})
test('changed receipt content and evidence hashes are rejected', async () => {
  const receipt = await createTransferReceipt(input())
  receipt.intent = { ...receipt.intent, amount: '9' }
  await assert.rejects(verifyReceiptFile(JSON.stringify(receipt)), /Receipt hash mismatch/)
  const another = await createTransferReceipt(input())
  another.evidence.source.payload.info.block_height = 999
  const { receiptHash, ...record } = another
  another.receiptHash = await evidenceHash(record)
  await assert.rejects(verifyReceiptFile(JSON.stringify(another)), /Evidence hash mismatch/)
})
test('SDK success and wallet balance movement cannot verify the three boundaries', async () => {
  const data = input(); data.reads = emptyReads(); data.balanceObservation = { observedBalance: 5000, attribution: 'unverified' }
  const receipt = await createTransferReceipt(data)
  assert.equal(receipt.source.status, 'reported')
  assert.equal(receipt.correlation.evidenceCompleteness, 0)
  assert.equal(receipt.correlation.routeIntegrity, 'unverified')
  assert.equal(receipt.correlation.amountContinuity, 'unverified')
  assert.equal(receipt.destination.status, 'unverified')
})
test('Cardano verification requires valid inclusion and the exact net lock amount', () => {
  assert.equal(verifySource(source(), sourceHash, intent).amountBaseUnits, '1000001')
  for (const change of [s => s.status.tx_hash = destinationHash, s => s.status.num_confirmations = 0, s => s.status.num_confirmations = 'Infinity', s => s.info.valid_contract = false, s => s.utxos.outputs[0].asset_list[0].quantity = '6000000', s => s.utxos.outputs[0].asset_list[0].quantity = 6000001, s => s.utxos.outputs[0].payment_addr.bech32 = 'other-address', s => s.utxos.outputs[0].asset_list[0].policy_id = 'wrong-policy']) {
    const s = source(); change(s); assert.throws(() => verifySource(s, sourceHash, intent))
  }
})
test('VIA correlation rejects unrelated transactions, contracts, networks and pending delivery', () => {
  assert.equal(verifyTransport({ ...transport(), sourceContract: '0x00000000' + DEPLOYED_USDM.cardanoClient }, sourceHash, intent).messageId, '22732660000000001')
  for (const change of [v => v.sourceTx = destinationHash, v => v.chainType = 'mainnet', v => v.destinationChainId = '64364449', v => v.sourceChainId = '2273265', v => v.destinationContract = sourceHash, v => v.sourceContract = sourceHash, v => v.deliveredAt = null, v => v.messageId = null, v => v.destinationTx = 'invalid']) {
    const v = transport(); change(v); assert.throws(() => verifyTransport(v, sourceHash))
  }
})
test('Midnight requires linked hash, successful inclusion, recipient, token and net amount', () => {
  const via = verifyTransport(transport(), sourceHash)
  assert.equal(verifyDestination(destination(), via, intent).status, 'verified')
  for (const change of [d => d.hash = sourceHash, d => d.transactionResult.status = 'PARTIAL_SUCCESS', d => d.block.height = 102, d => d.unshieldedCreatedOutputs[0].owner = sourceHash, d => d.unshieldedCreatedOutputs[0].tokenType = sourceHash, d => d.unshieldedCreatedOutputs[0].value = '1000002', d => d.unshieldedSpentOutputs = [...d.unshieldedCreatedOutputs]]) {
    const d = destination(); change(d); assert.throws(() => verifyDestination(d, via, intent))
  }
})
test('missing or mismatched links cannot give route or amount verification', () => {
  for (const key of ['source', 'transport', 'destination']) {
    const r = reads(); r[key] = { observation: null, error: 'Service unavailable' }
    const result = correlate(intent, sourceHash, null, r)
    assert.ok(result.completeness < 3)
    assert.equal(result.routeIntegrity, 'unverified'); assert.equal(result.amountContinuity, 'unverified')
    assert.match(result[key].detail, /Service unavailable/)
  }
  assert.equal(correlate({ ...intent, direction: 'midnight-to-cardano' }, sourceHash, null, reads()).completeness, 0)
})
test('local file verification rejects invalid versions, oversized files and malformed data', async () => {
  await assert.rejects(verifyReceiptFile('{}'), /Unsupported receipt/)
  await assert.rejects(verifyReceiptFile('x'.repeat(2_000_001)), /2 MB/)
  await assert.rejects(verifyReceiptFile('{broken'))
})

test('Preview indexer address owners and millisecond timestamps are normalized', () => {
  const d = destination(); d.unshieldedCreatedOutputs[0].owner = bech32m.encode('mn_addr_preview', bech32m.toWords(Array(32).fill(0xcc)), 1000); d.block.timestamp = 1789034460000
  const verified = verifyDestination(d, verifyTransport(transport(), sourceHash, intent), intent)
  assert.equal(verified.status, 'verified'); assert.equal(verified.timestamp, '2026-09-10T10:01:00.000Z')
  d.unshieldedCreatedOutputs[0].owner = bech32m.encode('mn_addr_preprod', bech32m.toWords(Array(32).fill(0xcc)), 1000)
  assert.throws(() => verifyDestination(d, verifyTransport(transport(), sourceHash, intent), intent), /wrong Midnight network/)
})
test('VIA raw deposit payload binds amount, both token identities, sender and recipient', () => {
  for (const index of [16, 80, 144, 208, 272, 400]) {
    const v = transport(), raw = v.payload.slice(2)
    v.payload = '0x' + raw.slice(0, index) + (raw[index] === 'f' ? 'e' : 'f') + raw.slice(index + 1)
    assert.throws(() => verifyTransport(v, sourceHash, intent))
  }
})

test('receipt excludes optional Compact fields and private intent memo', async () => {
  const data = input(); data.intent = { ...data.intent, memo: 'PRIVATE LABEL', payee: 'optional-payee', walletAddress: 'extra-wallet-address' }
  const receipt = await createTransferReceipt(data)
  assert.equal('memo' in receipt.intent, false); assert.equal('payee' in receipt.intent, false)
  assert.equal(JSON.stringify(receipt).includes('PRIVATE LABEL'), false)
})
test('conflicting source block evidence cannot verify the route', () => {
  const r = reads(); r.transport.observation.payload.sourceBlockNumber = '999'
  const result = correlate(intent, sourceHash, null, r)
  assert.equal(result.transport.status, 'unverified'); assert.equal(result.destination.status, 'unverified'); assert.equal(result.routeIntegrity, 'unverified')
})


test('complete transfer evidence never claims local runtime or application settlement verification', async () => {
  const receipt = await createTransferReceipt({ ...input(), applicationSettlement: { txHash: destinationHash, ledgerReadStatus: 'verified' }, returnProofObservation: { wallet: '1am', phases: [{ phase: 'proving', durationMs: 840 }] } })
  assert.equal(receipt.receiptVersion, '1.1')
  assert.equal(receipt.operation.verifiedEvidenceBoundaries, 3)
  assert.equal(receipt.operation.requiredEvidenceBoundaries, 5)
  assert.equal(receipt.operation.localProof.status, 'unverified')
  assert.equal(receipt.operation.localProof.runtime, 'unknown')
  assert.equal(receipt.operation.applicationSettlement.status, 'unverified')
  assert.equal(receipt.operation.continuity, 'unverified')
})

test('downloadable receipt is a frozen finalized snapshot with explicit unverified gates', async () => {
  const receipt = await finalizeTransferReceipt(input(), '2026-09-10T20:00:00.000Z')
  assert.equal(receipt.receiptVersion, '1.2')
  assert.equal(receipt.snapshotState, 'finalized')
  assert.equal(receipt.finalizedAt, '2026-09-10T20:00:00.000Z')
  assert.equal(receipt.operation.localProof.status, 'unverified')
  assert.equal(receipt.operation.applicationSettlement.status, 'unverified')
  assert.ok(Object.isFrozen(receipt))
  assert.ok(Object.isFrozen(receipt.intent))
  assert.ok(Object.isFrozen(receipt.evidence.destination))
  assert.throws(() => { receipt.intent.amount = '9' }, TypeError)
  assert.match(await verifyReceiptFile(JSON.stringify(receipt)), /integrity only/)
})

test('schema 1.2 file without a valid finalization marker is rejected even when rehashed', async () => {
  const receipt = await createTransferReceipt(input())
  receipt.receiptVersion = '1.2'
  receipt.snapshotState = 'live'
  receipt.finalizedAt = null
  const { receiptHash, ...record } = receipt
  receipt.receiptHash = await evidenceHash(record)
  await assert.rejects(verifyReceiptFile(JSON.stringify(receipt)), /not finalized/)
})

test('saved receipt inspection recalculates correlations instead of trusting rehashed success labels', async () => {
  const receipt = await createTransferReceipt(input())
  receipt.evidence.destination = null
  receipt.destination.status = 'verified'
  receipt.correlation.evidenceCompleteness = 3
  receipt.operation.verifiedEvidenceBoundaries = 5
  const { receiptHash, ...record } = receipt
  receipt.receiptHash = await evidenceHash(record)
  const inspected = await inspectReceiptFile(JSON.stringify(receipt))
  assert.equal(inspected.result.completeness, 2)
  assert.equal(inspected.result.destination.status, 'unverified')
  assert.equal(inspected.result.amountContinuity, 'unverified')
})

test('saved legacy receipts remain inspectable without a wallet or network', async () => {
  const receipt = await createTransferReceipt(input())
  receipt.receiptVersion = '1.0'; delete receipt.operation
  const { receiptHash, ...record } = receipt; receipt.receiptHash = await evidenceHash(record)
  const inspected = await inspectReceiptFile(JSON.stringify(receipt))
  assert.equal(inspected.result.completeness, 3)
  assert.equal(inspected.sourceHash, sourceHash)
  assert.match(inspected.integrity, /integrity only/)
})

test('hash-consistent malformed receipt intent cannot be opened as an operation', async () => {
  for (const change of [r => r.intent.direction = 'mainnet', r => r.intent.amountBaseUnits = '-1', r => delete r.evidence.destination, r => r.intent.recipient = {}]) {
    const receipt = await createTransferReceipt(input()); change(receipt)
    const { receiptHash, ...record } = receipt; receipt.receiptHash = await evidenceHash(record)
    await assert.rejects(inspectReceiptFile(JSON.stringify(receipt)))
  }
})


test('destination preserves UTC block provenance and identifies only the deployed VIA process call', () => {
  const d = destination(); d.block.hash = 'ee'.repeat(32); d.block.timestamp = 1789066194000
  d.contractActions = [{ __typename: 'ContractCall', address: DEPLOYED_USDM.midnightContract, entryPoint: 'process' }]
  d.fees = { paidFees: '1', estimatedFees: '1' }
  const checked = verifyDestination(d, verifyTransport(transport(), sourceHash, intent), intent)
  assert.equal(checked.blockHash, 'ee'.repeat(32)); assert.equal(checked.timestamp, '2026-09-10T18:49:54.000Z')
  assert.deepEqual(checked.contractCall, { address: DEPLOYED_USDM.midnightContract, entryPoint: 'process', status: 'SUCCESS' })
  assert.equal(checked.fees.paidFees, '1')
  d.contractActions[0].address = sourceHash
  assert.equal(verifyDestination(d, verifyTransport(transport(), sourceHash, intent), intent).contractCall, null)
  d.contractActions[0].address = DEPLOYED_USDM.midnightContract; d.contractActions[0].entryPoint = 'settle'
  assert.equal(verifyDestination(d, verifyTransport(transport(), sourceHash, intent), intent).contractCall, null)
  d.block.hash = 'not-a-block-hash'
  assert.throws(() => verifyDestination(d, verifyTransport(transport(), sourceHash, intent), intent), /Invalid transaction hash/)
})
