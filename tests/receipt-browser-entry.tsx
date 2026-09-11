import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TransferReceipt } from '../src/components/TransferReceipt'
import { intent, sourceHash, source, transport, destination } from './receipt-fixture.mjs'
import '../src/styles.css'
const scenario = new URLSearchParams(location.search).get('scenario') || 'success'
// Isolated fixture server only. Every evidence fetch is intercepted; no wallets or real chain calls.
window.fetch = async (url, options) => {
  const path = String(url)
  if (scenario === 'delayed') await new Promise(resolve => setTimeout(resolve, 800))
  let payload: unknown
  if (path === '/koios/tx_status') payload = [source().status]
  else if (path === '/koios/tx_info') payload = [source().info]
  else if (path === '/koios/tx_utxos') payload = [source().utxos]
  else if (path.startsWith('/evidence/via/transactions/')) {
    if (scenario === 'unavailable') return new Response('unavailable', { status: 503 })
    payload = { status: true, data: transport() }
  } else if (path === '/evidence/midnight') {
    const row = destination()
    if (scenario === 'mismatch') row.unshieldedCreatedOutputs[0].value = '1000000'
    payload = { data: { transactions: [row] } }
  } else throw new Error('Unexpected fixture request: ' + path)
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
function Fixture() {
  const [active, setActive] = useState(true)
  return <main className="app-shell"><p>ISOLATED QA FIXTURE — no wallet or actual transfer</p><button type="button" onClick={() => setActive(false)}>Clear fixture intent</button><TransferReceipt intent={active ? intent : null} sourceHash={active ? sourceHash : null} acceptedAt={active ? '2026-09-10T10:00:20.000Z' : null} balanceObservation={null} /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
