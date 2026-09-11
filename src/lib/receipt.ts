import type { Ledger } from '../../contracts/managed/usdm-settlement/contract/index.js'

type ExpectedReceipt = { id: Uint8Array; color: Uint8Array; amount: bigint; recipient: Uint8Array; memoHash: Uint8Array }
const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index])

export function assertReceiptMatches(receipt: Ledger, expected: ExpectedReceipt): void {
  const { id, color, amount, recipient, memoHash } = expected
  if (!equalBytes(receipt.usdmColor, color) ||
      !receipt.settlementAmounts.member(id) || !receipt.settlementRecipients.member(id) || !receipt.settlementMemoHashes.member(id) ||
      receipt.settlementAmounts.lookup(id) !== amount ||
      !equalBytes(receipt.settlementRecipients.lookup(id).bytes, recipient) ||
      !equalBytes(receipt.settlementMemoHashes.lookup(id), memoHash)) {
    throw new Error('The public receipt does not match this settlement. Keep the transaction evidence for review.')
  }
}
