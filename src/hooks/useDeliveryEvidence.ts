import { useCallback, useEffect, useRef, useState } from 'react'

export type DeliveryEvidenceStatus = 'idle' | 'armed' | 'watching' | 'verified' | 'unavailable'

type DeliveryEvidenceSnapshot = {
  baseline: number
  expectedDelta: number
  target: number
}

const EPSILON_USDM = 0.000001
const POLL_MS = 4_000

export function useDeliveryEvidence(
  destinationBalance: number | null | undefined,
  refreshDestination: () => Promise<void>,
) {
  const [status, setStatus] = useState<DeliveryEvidenceStatus>('idle')
  const [snapshot, setSnapshot] = useState<DeliveryEvidenceSnapshot | null>(null)
  const [verifiedBalance, setVerifiedBalance] = useState<number | null>(null)
  const refreshRef = useRef(refreshDestination)

  useEffect(() => {
    refreshRef.current = refreshDestination
  }, [refreshDestination])

  const reset = useCallback(() => {
    setStatus('idle')
    setSnapshot(null)
    setVerifiedBalance(null)
  }, [])

  const arm = useCallback((expectedDelta: number, canObserve: boolean) => {
    setVerifiedBalance(null)

    if (!canObserve || destinationBalance == null || !Number.isFinite(expectedDelta) || expectedDelta <= 0) {
      setSnapshot(null)
      setStatus('unavailable')
      return false
    }

    const baseline = destinationBalance
    setSnapshot({ baseline, expectedDelta, target: baseline + expectedDelta })
    setStatus('armed')
    return true
  }, [destinationBalance])

  const watch = useCallback(() => {
    setStatus((current) => current === 'armed' ? 'watching' : current)
  }, [])

  useEffect(() => {
    if (status !== 'watching' || !snapshot || destinationBalance == null) return

    if (destinationBalance + EPSILON_USDM >= snapshot.target) {
      setVerifiedBalance(destinationBalance)
      setStatus('verified')
    }
  }, [destinationBalance, snapshot, status])

  useEffect(() => {
    if (status !== 'watching') return

    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        await refreshRef.current()
      } catch {
        // Evidence stays in watching state; bridge errors are handled separately.
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [status])

  return {
    status,
    snapshot,
    verifiedBalance,
    arm,
    watch,
    reset,
  }
}
