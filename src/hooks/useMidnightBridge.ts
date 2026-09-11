import { useCallback, useState } from 'react'
import { bridgeUSDM } from '@via-labs-tech/usdm-bridge'

export const MIDNIGHT_BRIDGE_STEPS = ['joining', 'proving', 'confirming'] as const
export type MidnightBridgeStep = (typeof MIDNIGHT_BRIDGE_STEPS)[number] | 'idle' | 'done'

export function useMidnightBridge(wallet: string | null) {
  const [phases, setPhases] = useState<{ phase: string; startedAt: string; durationMs: number | null; outcome: string }[]>([])
  const [step, setStep] = useState<MidnightBridgeStep>('idle')
  const [result, setResult] = useState<{ txId: string; txHash: string } | null>(null)
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bridge = useCallback(async (amount: string, recipient: string) => {
    if (!wallet) throw new Error('Connect a Midnight wallet first')
    setError(null)
    setPhases([])
    const trace: { phase: string; startedAt: string; durationMs: number | null; outcome: string }[] = []
    let phaseStart = performance.now()
    const closePhase = (outcome: string) => {
      const last = trace.at(-1)
      if (last && last.outcome === 'running') {
        last.durationMs = Math.max(0, Math.round(performance.now() - phaseStart)); last.outcome = outcome
      }
      setPhases(trace.map(entry => ({ ...entry })))
    }
    const observePhase = (status: string) => {
      if (!MIDNIGHT_BRIDGE_STEPS.includes(status as typeof MIDNIGHT_BRIDGE_STEPS[number])) return
      if (trace.at(-1)?.phase === status) return
      closePhase('completed'); phaseStart = performance.now()
      trace.push({ phase: status, startedAt: new Date().toISOString(), durationMs: null, outcome: 'running' })
      setPhases(trace.map(entry => ({ ...entry })))
      setStep(status as MidnightBridgeStep)
    }
    setAcceptedAt(null)
    setResult(null)
    try {
      const response = await fetch('/artifacts/midnight/.via-assets-ready.json', { cache: 'no-store' })
      if (!response.ok) throw new Error('VIA proving assets unavailable. Restart the app after preparing the Preview assets.')
      const manifest = await response.json()
      if (manifest.network !== 'preview' || manifest.version !== '1.2.0' || manifest.route !== '/artifacts/midnight' || !Array.isArray(manifest.files) || !manifest.files.length) {
        throw new Error('VIA Preview proving asset manifest is invalid')
      }
      const { txId, txHash } = await bridgeUSDM({
        direction: 'midnight-to-cardano', amount, recipient, wallet,
        onStatus: observePhase,
      })
      const value = { txId: txId!, txHash }
      closePhase('completed')
      setResult(value)
      setAcceptedAt(new Date().toISOString())
      setStep('done')
      return value
    } catch (err) {
      closePhase('interrupted')
      setStep('idle')
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [wallet])

  const reset = useCallback(() => { setPhases([]); setAcceptedAt(null); setStep('idle'); setError(null); setResult(null) }, [])

  return { phases, reset, bridge, acceptedAt, step, result, error }
}
