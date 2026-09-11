import { DEPLOYED_USDM } from '../src/lib/transferReceipt.ts'
import { bech32, bech32m } from 'bech32'

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

export { intent, sourceHash, source, transport, destination }
