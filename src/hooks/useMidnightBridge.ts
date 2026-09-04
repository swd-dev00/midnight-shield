import { useCallback, useEffect, useState } from 'react'
import { bridgeUSDM } from '@via-labs-tech/usdm-bridge'

export const MIDNIGHT_BRIDGE_STEPS = ['joining', 'proving', 'confirming'] as const
export type MidnightBridgeStep = (typeof MIDNIGHT_BRIDGE_STEPS)[number] | 'idle' | 'done'
export type MidnightZkAssetsStatus = 'checking' | 'ready' | 'missing'

type MidnightZkAssetsManifest = {
  package: string
  version: string
  route: string
  fileCount: number
  files?: string[]
}

const MIDNIGHT_ZK_MANIFEST = '/artifacts/midnight/.via-assets-ready.json'

export function useMidnightBridge(wallet: string | null) {
  const [step, setStep] = useState<MidnightBridgeStep>('idle')
  const [result, setResult] = useState<{ txId: string; txHash: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zkAssetsStatus, setZkAssetsStatus] = useState<MidnightZkAssetsStatus>('checking')
  const [zkAssetsManifest, setZkAssetsManifest] = useState<MidnightZkAssetsManifest | null>(null)

  const checkZkAssets = useCallback(async () => {
    setZkAssetsStatus('checking')
    try {
      const response = await fetch(MIDNIGHT_ZK_MANIFEST, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const manifest = await response.json() as MidnightZkAssetsManifest
      if (
        manifest.package !== '@via-labs-tech/usdm-bridge' ||
        manifest.route !== '/artifacts/midnight' ||
        !Number.isFinite(manifest.fileCount) ||
        manifest.fileCount <= 0
      ) {
        throw new Error('Invalid VIA ZK asset manifest')
      }
      setZkAssetsManifest(manifest)
      setZkAssetsStatus('ready')
      return true
    } catch {
      setZkAssetsManifest(null)
      setZkAssetsStatus('missing')
      return false
    }
  }, [])

  useEffect(() => {
    void checkZkAssets()
  }, [checkZkAssets])

  const bridge = useCallback(async (amount: string, recipient: string) => {
    if (!wallet) throw new Error('Connect a Midnight wallet first')
    setError(null)
    setResult(null)
    try {
      const assetsReady = await checkZkAssets()
      if (!assetsReady) {
        throw new Error(
          'MIDNIGHT_ZK_ASSETS_MISSING: Browser proving requires VIA ZK assets at /artifacts/midnight.',
        )
      }

      const { txId, txHash } = await bridgeUSDM({
        direction: 'midnight-to-cardano', amount, recipient, wallet,
        onStatus: (status) => setStep(status as MidnightBridgeStep),
      })
      const value = { txId: txId!, txHash }
      setResult(value)
      setStep('done')
      return value
    } catch (err) {
      setStep('idle')
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [checkZkAssets, wallet])

  return {
    bridge,
    step,
    result,
    error,
    zkAssetsStatus,
    zkAssetsManifest,
    checkZkAssets,
  }
}