import { withReadTimeout } from '../lib/timeout'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Every reading belongs to one wallet session; failed reads cannot leave spendable stale data. */
export function useWalletBalance<A, B>(api: A | null, read: (api: A) => Promise<B>) {
  const currentApi = useRef(api)
  currentApi.current = api
  const request = useRef(0)
  const pending = useRef<{ api: A; task: Promise<void> } | null>(null)
  const [state, setState] = useState<{ api: A | null; balance: B | null; error: string | null }>({ api: null, balance: null, error: null })
  const refresh = useCallback(async () => {
    if (!api) { ++request.current; setState({ api: null, balance: null, error: null }); return }
    if (pending.current?.api === api) return pending.current.task
    const id = ++request.current
    const task = (async () => {
      try {
        const balance = await withReadTimeout(read(api))
        if (currentApi.current === api && request.current === id) setState({ api, balance, error: null })
      } catch (error) {
        if (currentApi.current === api && request.current === id) {
          setState({ api, balance: null, error: error instanceof Error ? error.message : String(error) })
        }
      }
    })()
    pending.current = { api, task }
    try { await task } finally { if (pending.current?.task === task) pending.current = null }
  }, [api, read])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15_000)
    return () => { window.clearInterval(timer); ++request.current; pending.current = null }
  }, [refresh])
  return { balance: state.api === api ? state.balance : null, error: state.api === api ? state.error : null, refresh }
}
