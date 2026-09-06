import type { SettlementProviders } from '../settlement/providers'

export const COMPACT_SETTLEMENT_COMPILED: boolean = false

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

const notPrepared = () => new Error(
  'Compact browser assets are not prepared. Run npm run contract:browser with Compact 0.31.x before deployment.',
)

export async function deploySettlementContract(
  _providers: SettlementProviders,
  _usdmColor: Uint8Array,
): Promise<SettlementDeployment> {
  throw notPrepared()
}

export async function executeSettlement(
  _providers: SettlementProviders,
  _contractAddress: string,
  _settlementId: Uint8Array,
  _amount: bigint,
  _recipient: string,
  _memoHash: Uint8Array,
): Promise<SettlementExecution> {
  throw notPrepared()
}
