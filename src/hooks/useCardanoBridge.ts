import { useCallback, useState } from 'react'
import { bridgeUSDM } from '@via-labs-tech/usdm-bridge'

export const CARDANO_BRIDGE_STEPS = ['building', 'completing', 'signing', 'submitting', 'confirming'] as const
export type CardanoBridgeStep = (typeof CARDANO_BRIDGE_STEPS)[number] | 'idle' | 'done'

export function useCardanoBridge(wallet: string | null) {
  const [step, setStep] = useState<CardanoBridgeStep>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bridge = useCallback(async (amount: string, recipient: string) => {
    if (!wallet) throw new Error('Connect a Cardano wallet first')
    setError(null)
    setTxHash(null)
    try {
      const { txHash } = await bridgeUSDM({
        direction: 'cardano-to-midnight', amount, recipient, wallet,
        onStatus: (status) => setStep(status as CardanoBridgeStep),
      })
      setTxHash(txHash)
      setStep('done')
      return txHash
    } catch (err) {
      setStep('idle')
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [wallet])

  return { bridge, step, txHash, error }
}
