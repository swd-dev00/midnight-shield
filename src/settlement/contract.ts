import { withReadTimeout } from '../lib/timeout'
import { CompiledContract } from '@midnight-ntwrk/compact-js'
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime'
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts'
import { midnightRecipientBytes } from '../lib/recipient'
import { assertReceiptMatches } from '../lib/receipt'
import { MIDNIGHT_USDM_TOKEN_COLOR } from '../config'
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-utils'
import { Contract, ledger } from '../../contracts/managed/usdm-settlement/contract/index.js'
import {
  SETTLEMENT_PRIVATE_STATE_ID,
  type SettlementProviders,
} from './providers'

export const COMPACT_SETTLEMENT_COMPILED: boolean = true

export type SettlementDeployment = {
  contractAddress: string
  txId: string
  txHash: string
  blockHeight: number
}

export type SettlementExecution = {
  settlementId: string
  contractAddress: string
  txId: string
  txHash: string
  blockHeight: number
  amount: string
  recipient: string
  memoHash: string
}

const compiledContract = CompiledContract.make(
  'ViaUsdmSettlement',
  Contract,
).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets('managed/usdm-settlement'),
)

const require32 = (value: Uint8Array, label: string) => {
  if (value.length !== 32) throw new Error(`${label} must be exactly 32 bytes`)
  return value
}

export async function deploySettlementContract(
  providers: SettlementProviders,
  usdmColor: Uint8Array,
): Promise<SettlementDeployment> {
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: SETTLEMENT_PRIVATE_STATE_ID,
    initialPrivateState: {},
    args: [require32(usdmColor, 'USDM token color')],
  })

  return {
    contractAddress: deployed.deployTxData.public.contractAddress,
    txId: deployed.deployTxData.public.txId,
    txHash: deployed.deployTxData.public.txHash,
    blockHeight: deployed.deployTxData.public.blockHeight,
  }
}

export async function executeSettlement(
  providers: SettlementProviders,
  contractAddress: string,
  settlementId: Uint8Array,
  amount: bigint,
  recipient: string,
  memoHash: Uint8Array,
): Promise<SettlementExecution> {
  if (amount <= 0n) throw new Error('Settlement amount must be greater than zero')

  const targetState = await withReadTimeout(providers.publicDataProvider.queryContractState(contractAddress as ContractAddress))
  if (!targetState || toHex(ledger(targetState.data).usdmColor) !== MIDNIGHT_USDM_TOKEN_COLOR) {
    throw new Error('Settlement contract is missing or configured for a different USDM token')
  }
  const recipientBytes = midnightRecipientBytes(recipient)
  const found = await findDeployedContract(providers, {
    contractAddress: contractAddress as ContractAddress,
    compiledContract,
    privateStateId: SETTLEMENT_PRIVATE_STATE_ID,
    initialPrivateState: {},
  })

  const txData = await found.callTx.settle(
    require32(settlementId, 'Settlement ID'),
    amount,
    { bytes: recipientBytes },
    require32(memoHash, 'Memo hash'),
  )

  return {
    settlementId: toHex(settlementId),
    contractAddress,
    txId: txData.public.txId,
    txHash: txData.public.txHash,
    blockHeight: txData.public.blockHeight,
    amount: amount.toString(),
    recipient,
    memoHash: toHex(memoHash),
  }
}

/** A separate indexer read at the finalized transaction block verifies every receipt field. */
export async function verifySettlementReceipt(providers: SettlementProviders, execution: SettlementExecution): Promise<void> {
  const state = await withReadTimeout(providers.publicDataProvider.queryContractState(execution.contractAddress as ContractAddress, {
    type: 'blockHeight', blockHeight: execution.blockHeight,
  }))
  if (!state) throw new Error('Settlement block is not available from the indexer yet. Retry receipt verification.')
  assertReceiptMatches(ledger(state.data), {
    id: fromHex(execution.settlementId), color: fromHex(MIDNIGHT_USDM_TOKEN_COLOR), amount: BigInt(execution.amount),
    recipient: midnightRecipientBytes(execution.recipient), memoHash: fromHex(execution.memoHash),
  })
}
