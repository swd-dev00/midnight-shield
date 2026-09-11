import { assertReceiptMatches } from '../src/lib/receipt.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { Contract, ledger } from '../contracts/managed/usdm-settlement/contract/index.js'
import { createConstructorContext, createCircuitContext } from '@midnight-ntwrk/compact-runtime'

const color = new Uint8Array(32).fill(7)
const owner = '00'.repeat(32)
const contractAddress = '01'.repeat(32)
const key = new Uint8Array(32).fill(3)
const memo = new Uint8Array(32).fill(4)
const recipient = { bytes: new Uint8Array(32).fill(5) }
function setup() {
  const contract = new Contract({})
  const initial = contract.initialState(createConstructorContext({}, owner), color)
  return { contract, context: createCircuitContext(contractAddress, owner, initial.currentContractState, {}) }
}
test('settlement records exact receipt fields and rejects duplicate settlement ids', () => {
  const { contract, context } = setup()
  const result = contract.impureCircuits.settle(context, key, 1234567n, recipient, memo)
  const receipt = ledger(result.context.currentQueryContext.state)
  assert.equal(receipt.settlementCount, 1n)
  assert.equal(receipt.settlementAmounts.lookup(key), 1234567n)
  assert.deepEqual(receipt.settlementRecipients.lookup(key), recipient)
  assert.deepEqual(receipt.settlementMemoHashes.lookup(key), memo)
  assert.deepEqual(receipt.usdmColor, color)
  assert.throws(() => contract.impureCircuits.settle(result.context, key, 1234567n, recipient, memo), /already used/)
})
test('zero-value settlement is rejected by the actual generated circuit', () => {
  const { contract, context } = setup()
  assert.throws(() => contract.impureCircuits.settle(context, key, 0n, recipient, memo), /greater than zero/)
})

test('receipt verification rejects independently mismatched amount, payee, memo, id, and token', () => {
  const { contract, context } = setup()
  const result = contract.impureCircuits.settle(context, key, 10n, recipient, memo)
  const receipt = ledger(result.context.currentQueryContext.state)
  const expected = { id: key, color, amount: 10n, recipient: recipient.bytes, memoHash: memo }
  assert.doesNotThrow(() => assertReceiptMatches(receipt, expected))
  for (const change of [{ amount: 11n }, { id: new Uint8Array(32) }, { color: new Uint8Array(32) }, { recipient: new Uint8Array(32) }, { memoHash: new Uint8Array(32) }]) {
    assert.throws(() => assertReceiptMatches(receipt, { ...expected, ...change }), /does not match/)
  }
})
