export type ChainName = 'Cardano' | 'Midnight'

export type SourceFinalityEvidence = {
  kind: 'source-finality'
  chain: ChainName
  txHash: string
  txId?: string
}

export type ViaDeliveryEvidence = {
  kind: 'via-delivery'
  messageId: string
}

export type DestinationArrivalEvidence = {
  kind: 'destination-arrival'
  chain: ChainName
  address: string
  baseline: number
  expectedDelta: number
  target: number
  observed: number
}

export type CompactSettlementEvidence = {
  kind: 'compact-settlement'
  contractAddress: string
  txId: string
}

export type ReceiptEvidence = {
  kind: 'receipt'
  settlementId: string
  txId: string
}

export type EvidenceState<T> =
  | { status: 'idle' }
  | { status: 'pending'; detail?: string }
  | { status: 'verified'; evidence: T }
  | { status: 'unavailable'; reason: string }
  | { status: 'locked'; reason: string }
  | { status: 'failed'; reason: string }

export const unavailableEvidence = <T>(reason: string): EvidenceState<T> => ({
  status: 'unavailable',
  reason,
})

export const lockedEvidence = <T>(reason: string): EvidenceState<T> => ({
  status: 'locked',
  reason,
})
