import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const managed = path.join(root, 'contracts', 'managed', 'usdm-settlement')
const generatedContract = path.join(managed, 'contract', 'index.js')
const publicManaged = path.join(root, 'public', 'managed', 'usdm-settlement')
const adapterPath = path.join(root, 'src', 'generated', 'settlementContract.ts')

try {
  await access(generatedContract)
} catch {
  throw new Error(
    `Compact output not found at ${generatedContract}. Run npm run contract:compile with Compact 0.31.x first.`,
  )
}

await mkdir(path.dirname(publicManaged), { recursive: true })
await rm(publicManaged, { recursive: true, force: true })
await cp(managed, publicManaged, { recursive: true })
await mkdir(path.dirname(adapterPath), { recursive: true })

const adapter = `import { CompiledContract } from '@midnight-ntwrk/compact-js'
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime'
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts'
import { encodeUserAddress } from '@midnight-ntwrk/midnight-js-protocol/ledger'
import { toHex } from '@midnight-ntwrk/midnight-js-utils'
import { Contract } from '../../contracts/managed/usdm-settlement/contract/index.js'
import {
  SETTLEMENT_PRIVATE_STATE_ID,
  type SettlementProviders,
} from '../settlement/providers'

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
}

const compiledContract = CompiledContract.make(
  'ViaUsdmSettlement',
  Contract,
).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets('managed/usdm-settlement'),
)

const require32 = (value: Uint8Array, label: string) => {
  if (value.length !== 32) throw new Error(\`${'${label}'} must be exactly 32 bytes\`)
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

  const found = await findDeployedContract(providers, {
    contractAddress: contractAddress as ContractAddress,
    compiledContract,
    privateStateId: SETTLEMENT_PRIVATE_STATE_ID,
    initialPrivateState: {},
  })

  const txData = await found.callTx.settle(
    require32(settlementId, 'Settlement ID'),
    amount,
    encodeUserAddress(recipient),
    require32(memoHash, 'Memo hash'),
  )

  return {
    settlementId: toHex(settlementId),
    contractAddress,
    txId: txData.public.txId,
    txHash: txData.public.txHash,
    blockHeight: txData.public.blockHeight,
  }
}
`

await writeFile(adapterPath, adapter, 'utf8')
console.log(`Prepared browser Compact assets at ${publicManaged}`)
console.log(`Generated typed browser adapter at ${adapterPath}`)
