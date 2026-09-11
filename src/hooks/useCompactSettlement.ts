import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api'
import type { MidnightWalletApi } from '@via-labs-tech/usdm-bridge'
import {
  MIDNIGHT_NETWORK_ID,
  MIDNIGHT_SETTLEMENT_CONTRACT_ADDRESS,
  MIDNIGHT_USDM_TOKEN_COLOR,
} from '../config'
import { createBrowserSettlementProviders, type SettlementProviders } from '../settlement/providers'
import {
  COMPACT_SETTLEMENT_COMPILED,
  deploySettlementContract,
  executeSettlement,
  verifySettlementReceipt,
  type SettlementDeployment,
  type SettlementExecution,
} from '../settlement/contract'
import { usdmToBaseUnits } from '../lib/amount'

export type CompactSettlementStatus =
  | 'idle'
  | 'deploying'
  | 'deployed'
  | 'settling'
  | 'verified'
  | 'failed'

const hexToBytes = (hex: string): Uint8Array => {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Expected an even-length hexadecimal value')
  }
  return Uint8Array.from(hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [])
}

const random32 = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32))

const sha256 = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))

export function useCompactSettlement(
  api: MidnightWalletApi | null,
  networkId: string | null,
  walletAddress: string | null,
  enabled = true,
) {
  const actionLock = useRef(false)
  const providersRef = useRef<SettlementProviders | null>(null)
  const [assetsReady, setAssetsReady] = useState(false)
  const [receiptStatus, setReceiptStatus] = useState<'idle' | 'checking' | 'verified' | 'unavailable'>('idle')
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const settlementIdRef = useRef<Uint8Array | null>(null)
  useEffect(() => { providersRef.current = null }, [api, networkId])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void Promise.all(['zkir/settle.zkir', 'keys/settle.prover', 'keys/settle.verifier'].map(async file => {
      const response = await fetch(`/managed/usdm-settlement/${file}`, { method: 'HEAD', cache: 'no-store' })
      return response.ok && !response.headers.get('content-type')?.includes('text/html') && Number(response.headers.get('content-length')) > 0
    })).then(results => { if (!cancelled) setAssetsReady(results.every(Boolean)) }).catch(() => { if (!cancelled) setAssetsReady(false) })
    return () => { cancelled = true }
  }, [enabled])
  const [status, setStatus] = useState<CompactSettlementStatus>('idle')
  const [deployment, setDeployment] = useState<SettlementDeployment | null>(null)
  const [execution, setExecution] = useState<SettlementExecution | null>(null)
  const [error, setError] = useState<string | null>(null)

  const contractAddress = deployment?.contractAddress || MIDNIGHT_SETTLEMENT_CONTRACT_ADDRESS || null
  const compiledReady = COMPACT_SETTLEMENT_COMPILED === true && assetsReady
  const networkReady = Boolean(api && networkId === MIDNIGHT_NETWORK_ID)

  const ensureProviders = useCallback(async (): Promise<SettlementProviders> => {
    if (!api) throw new Error('Connect a Midnight wallet before Compact execution')
    if (networkId !== MIDNIGHT_NETWORK_ID) {
      throw new Error(
        `Midnight network mismatch: Compact settlement requires "${MIDNIGHT_NETWORK_ID}"; ` +
        `wallet reported "${networkId ?? 'unknown'}".`,
      )
    }
    if (!compiledReady) {
      throw new Error('Compact browser assets are not prepared. Run npm run contract:browser first.')
    }

    if ((await api.getConfiguration()).networkId !== MIDNIGHT_NETWORK_ID) throw new Error('Midnight network changed: reconnect on Preview')
    if ((await api.getUnshieldedAddress()).unshieldedAddress !== walletAddress) throw new Error('Midnight account changed: reconnect before settlement')
    if (!providersRef.current) {
      providersRef.current = await createBrowserSettlementProviders(api as unknown as ConnectedAPI)
    }
    return providersRef.current
  }, [api, compiledReady, networkId, walletAddress])

  const deploy = useCallback(async () => {
    if (actionLock.current || contractAddress) return null
    actionLock.current = true
    setError(null)
    setStatus('deploying')
    try {
      const providers = await ensureProviders()
      const result = await deploySettlementContract(
        providers,
        hexToBytes(MIDNIGHT_USDM_TOKEN_COLOR),
      )
      setDeployment(result)
      setStatus('deployed')
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStatus('failed')
      return null
    }
    finally { actionLock.current = false }
  }, [ensureProviders, contractAddress])

  const settle = useCallback(async (
    amount: string,
    recipient: string,
    memo: string,
  ) => {
    if (actionLock.current || execution) return null
    actionLock.current = true
    setReceiptStatus('idle')
    setReceiptError(null)
    setError(null)
    setExecution(null)
    setStatus('settling')
    try {
      const providers = await ensureProviders()
      if (!contractAddress) {
        throw new Error('Deploy the Compact settlement contract on Midnight Preview first')
      }

      const result = await executeSettlement(
        providers,
        contractAddress,
        settlementIdRef.current ??= random32(),
        usdmToBaseUnits(amount),
        recipient,
        await sha256(memo),
      )
      setExecution(result)
      setStatus('verified')
      setReceiptStatus('checking')
      try {
        await verifySettlementReceipt(providers, result)
        setReceiptStatus('verified')
      } catch (err) {
        setReceiptStatus('unavailable')
        setReceiptError(err instanceof Error ? err.message : String(err))
      }
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStatus('failed')
      return null
    }
    finally { actionLock.current = false }
  }, [contractAddress, ensureProviders, execution])

  const verifyReceipt = useCallback(async () => {
    if (!execution || actionLock.current) return
    actionLock.current = true
    setReceiptStatus('checking')
    setReceiptError(null)
    try {
      await verifySettlementReceipt(await ensureProviders(), execution)
      setReceiptStatus('verified')
    } catch (err) {
      setReceiptStatus('unavailable')
      setReceiptError(err instanceof Error ? err.message : String(err))
    } finally { actionLock.current = false }
  }, [ensureProviders, execution])

  const reset = useCallback(() => {
    if (actionLock.current) return
    settlementIdRef.current = null
    setReceiptStatus('idle')
    setReceiptError(null)
    setStatus(contractAddress ? 'deployed' : 'idle')
    setExecution(null)
    setError(null)
  }, [contractAddress])

  return useMemo(() => ({
    receiptStatus, receiptError, verifyReceipt,
    compiledReady,
    networkReady,
    contractAddress,
    status,
    deployment,
    execution,
    error,
    deploy,
    settle,
    reset,
  }), [receiptStatus, receiptError, verifyReceipt, compiledReady, contractAddress, deploy, deployment, error, execution, networkReady, reset, settle, status])
}
