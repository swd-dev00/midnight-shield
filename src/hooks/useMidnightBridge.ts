import { useCallback, useState } from 'react'
import { bridgeUSDM } from '@via-labs-tech/usdm-bridge'

export const MIDNIGHT_BRIDGE_STEPS = ['joining', 'proving', 'confirming'] as const
export type MidnightBridgeStep = (typeof MIDNIGHT_BRIDGE_STEPS)[number] | 'idle' | 'done'

export function useMidnightBridge(wallet: string | null) {
  const [step, setStep] = useState<MidnightBridgeStep>('idle')
  const [result, setResult] = useState<{ txId: string; txHash: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bridge = useCallback(async (amount: string, recipient: string) => {
    if (!wallet) throw new Error('Connect a Midnight wallet first')
    setError(null)
    setResult(null)
    try {
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
  }, [wallet])

  return { bridge, step, result, error }
}
