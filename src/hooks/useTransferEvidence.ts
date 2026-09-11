import { useEffect, useState } from 'react'
import { emptyReads, verifyTransport, type Json, type Observation, type TransferIntent, type TransferReads } from '../lib/transferReceipt'

const QUERY = `query TransferReceipt($offset: TransactionOffset!) {
  transactions(offset: $offset) {
    hash block { height hash timestamp }
    unshieldedCreatedOutputs { owner tokenType value }
    unshieldedSpentOutputs { owner tokenType value }
    ... on RegularTransaction { transactionResult { status } fees { paidFees estimatedFees } contractActions { __typename address ... on ContractCall { entryPoint } } }
  }
}`
async function readJson(url: string, signal: AbortSignal, body?: unknown): Promise<any> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!response.ok) throw new Error(`Evidence service returned HTTP ${response.status}`)
  if (!response.headers.get('content-type')?.includes('json')) throw new Error('Evidence endpoint is unavailable; the server must provide the read-only evidence routes')
  const text = await response.text()
  if (text.length > 1_000_000) throw new Error('Evidence response exceeds the supported size')
  return JSON.parse(text)
}
const observation = (provider: string, payload: Json): Observation => ({ provider, observedAt: new Date().toISOString(), payload })

export function useTransferEvidence(intent: TransferIntent | null, sourceHash: string | null) {
  const [reads, setReads] = useState<TransferReads>(emptyReads)
  const [reading, setReading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const evidenceKey = intent && sourceHash
    ? `${intent.submittedAt}:${sourceHash.toLowerCase()}:${revision}`
    : null
  useEffect(() => {
    const controller = new AbortController()
    setReads(emptyReads())
    setReading(false)
    setSettledKey(null)
    if (!intent || !sourceHash || intent.direction !== 'cardano-to-midnight') return () => controller.abort()
    if (!/^[a-fA-F0-9]{64}$/.test(sourceHash)) return () => controller.abort()
    const signal = controller.signal
    setReading(true)
    const collected = emptyReads()
    const update = (key: keyof TransferReads) => { if (!signal.aborted) setReads(current => ({ ...current, [key]: { ...collected[key] } })) }
    const capture = async (key: keyof TransferReads, task: () => Promise<Observation>) => {
      try { collected[key] = { observation: await task(), error: null } }
      catch (error) { collected[key] = { observation: null, error: error instanceof Error ? error.message : 'Evidence service could not be read' } }
      update(key)
    }
    void (async () => {
      await Promise.all([
        capture('source', async () => {
          const [status, info, utxos] = await Promise.all([
            readJson('/koios/tx_status', signal, { _tx_hashes: [sourceHash] }),
            readJson('/koios/tx_info', signal, { _tx_hashes: [sourceHash], _assets: false, _inputs: false }),
            readJson('/koios/tx_utxos', signal, { _tx_hashes: [sourceHash] }),
          ])
          const find = (rows: any) => {
            if (!Array.isArray(rows)) throw new Error('Unexpected Cardano evidence response')
            const row = rows.find(r => r.tx_hash === sourceHash)
            if (!row) throw new Error('Source transaction is not yet indexed on Cardano Preprod')
            return row
          }
          const transaction = find(info)
          return observation('https://preprod.koios.rest/api/v1', { status: find(status), info: { tx_hash: transaction.tx_hash ?? null, valid_contract: transaction.valid_contract ?? null, block_height: transaction.block_height ?? null, block_hash: transaction.block_hash ?? null, tx_timestamp: transaction.tx_timestamp ?? null }, utxos: find(utxos) })
        }),
        capture('transport', async () => {
          const response = await readJson(`/evidence/via/transactions/${sourceHash}`, signal)
          if (response.status !== true || !response.data) throw new Error('VIA has not returned an attributable transaction record')
          return observation('https://scansite.druuu.net/api/v1/transactions/' + sourceHash, response.data)
        }),
      ])
      if (signal.aborted) return
      await capture('destination', async () => {
        if (!collected.transport.observation) throw new Error('Waiting for the VIA destination transaction identifier')
        const via = verifyTransport(collected.transport.observation.payload, sourceHash, intent)
        const response = await readJson('/evidence/midnight', signal, { query: QUERY, variables: { offset: { hash: via.transactionId } } })
        if (response.errors?.length) throw new Error('Preview indexer rejected the transaction evidence query')
        const rows = response.data?.transactions
        if (!Array.isArray(rows)) throw new Error('Unexpected Preview transaction response')
        const row = rows.find((r: any) => r.hash?.replace(/^0x/, '').toLowerCase() === via.transactionId)
        if (!row) throw new Error('VIA-linked transaction is not yet indexed on Midnight Preview')
        return observation('https://indexer.preview.midnight.network/api/v4/graphql', row)
      })
      if (!signal.aborted) {
        setReading(false)
        setSettledKey(evidenceKey)
      }
    })()
    return () => controller.abort()
  }, [intent, sourceHash, revision, evidenceKey])
  return {
    reads,
    reading,
    evidenceKey,
    evidenceSettled: Boolean(evidenceKey) && settledKey === evidenceKey && !reading,
    refresh: () => setRevision(value => value + 1),
  }
}
