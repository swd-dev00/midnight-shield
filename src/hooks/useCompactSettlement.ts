import { useCallback, useMemo, useRef, useState } from 'react'
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
  type SettlementDeployment,
  type SettlementExecution,
} from '../generated/settlementContract'

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

const usdmToBaseUnits = (amount: string): bigint => {
  const normalized = amount.trim()
  if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) {
    throw new Error('USDM amount must have at most 6 decimal places')
  }
  const [whole, fraction = ''] = normalized.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}

const random32 = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32))

const sha256 = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))

export function useCompactSettlement(
  api: MidnightWalletApi | null,
  networkId: string | null,
) {
  const providersRef = useRef<SettlementProviders | null>(null)
  const [status, setStatus] = useState<CompactSettlementStatus>('idle')
  const [deployment, setDeployment] = useState<SettlementDeployment | null>(null)
  const [execution, setExecution] = useState<SettlementExecution | null>(null)
  const [error, setError] = useState<string | null>(null)

  const contractAddress = deployment?.contractAddress || MIDNIGHT_SETTLEMENT_CONTRACT_ADDRESS || null
  const compiledReady = COMPACT_SETTLEMENT_COMPILED === true
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

    if (!providersRef.current) {
      providersRef.current = await createBrowserSettlementProviders(api as unknown as ConnectedAPI)
    }
    return providersRef.current
  }, [api, compiledReady, networkId])

  const deploy = useCallback(async () => {
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
  }, [ensureProviders])

  const settle = useCallback(async (
    amount: string,
    recipient: string,
    memo: string,
  ) => {
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
        random32(),
        usdmToBaseUnits(amount),
        recipient,
        await sha256(memo),
      )
      setExecution(result)
      setStatus('verified')
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStatus('failed')
      return null
    }
  }, [contractAddress, ensureProviders])

  const reset = useCallback(() => {
    setStatus(contractAddress ? 'deployed' : 'idle')
    setExecution(null)
    setError(null)
  }, [contractAddress])

  return useMemo(() => ({
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
  }), [compiledReady, contractAddress, deploy, deployment, error, execution, networkReady, reset, settle, status])
}
