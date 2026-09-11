import { hasArrived } from '../lib/delivery'
import { useCallback, useEffect, useRef, useState } from 'react'

export type DeliveryEvidenceStatus = 'idle' | 'armed' | 'watching' | 'verified' | 'unavailable' | 'paused'

type DeliveryEvidenceSnapshot = {
  baseline: number
  expectedDelta: number
  target: number
}

const POLL_MS = 4_000

export function useDeliveryEvidence(
  destinationBalance: number | null | undefined,
  refreshDestination: () => Promise<void>,
) {
  const [status, setStatus] = useState<DeliveryEvidenceStatus>('idle')
  const [snapshot, setSnapshot] = useState<DeliveryEvidenceSnapshot | null>(null)
  const [verifiedBalance, setVerifiedBalance] = useState<number | null>(null)
  const [observedAt, setObservedAt] = useState<string | null>(null)
  const refreshRef = useRef(refreshDestination)

  useEffect(() => {
    refreshRef.current = refreshDestination
  }, [refreshDestination])

  const reset = useCallback(() => {
    setStatus('idle')
    setSnapshot(null)
    setVerifiedBalance(null)
    setObservedAt(null)
  }, [])

  const arm = useCallback((expectedDelta: number, canObserve: boolean) => {
    setVerifiedBalance(null)
    setObservedAt(null)

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
    setStatus((current) => current === 'armed' || current === 'paused' ? 'watching' : current)
  }, [])

  useEffect(() => {
    if (status !== 'watching' || !snapshot || destinationBalance == null) return

    if (hasArrived(destinationBalance, snapshot.target)) {
      setVerifiedBalance(destinationBalance)
      setObservedAt(new Date().toISOString())
      setStatus('verified')
    }
  }, [destinationBalance, snapshot, status])

  useEffect(() => {
    if (status !== 'watching') return

    let cancelled = false
    let inFlight = false
    const poll = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        await refreshRef.current()
      } catch {
        // Evidence stays in watching state; bridge errors are handled separately.
      } finally { inFlight = false }
    }

    void poll()
    const deadline = window.setTimeout(() => setStatus(current => current === 'watching' ? 'paused' : current), 180_000)
    const timer = window.setInterval(() => void poll(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.clearTimeout(deadline)
    }
  }, [status])

  return {
    status,
    snapshot,
    verifiedBalance,
    observedAt,
    arm,
    watch,
    reset,
  }
}
