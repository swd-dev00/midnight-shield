export interface FriendlyError {
  title: string
  guidance: string
  technical: string
}

export function explainBridgeError(raw: string): FriendlyError {
  const message = raw || 'Unknown bridge error'
  const value = message.toLowerCase()

  if (value.includes('network mismatch') || (value.includes('preview') && value.includes('preprod'))) return {
    title: 'Midnight is on the wrong test network',
    guidance: 'VIA testnet pairs Cardano Preprod with Midnight Preview. Switch the Midnight wallet to Preview, let it sync, then reconnect. DUST generated on Midnight Pre-Prod cannot fund the Preview leg.',
    technical: message,
  }

  if (value.includes('dust')) return {
    title: 'Midnight needs execution capacity',
    guidance: 'Your Midnight Preview wallet does not currently have enough DUST capacity for this action. Add Preview DUST capacity, then retry the same intent.',
    technical: message,
  }

  if (value.includes('insufficient') || value.includes('balance')) return {
    title: 'The source wallet cannot fund this intent',
    guidance: 'Reduce the USDM amount or fund the source wallet, then retry. Network fees also require the source chain fee asset.',
    technical: message,
  }

  if (value.includes('reject') || value.includes('denied') || value.includes('4001')) return {
    title: 'Authorization was not completed',
    guidance: 'Nothing was sent. Re-run the intent and approve the wallet request when you are ready.',
    technical: message,
  }

  if (value.includes('wallet') || value.includes('connect')) return {
    title: 'A wallet connection needs attention',
    guidance: 'Reconnect the required wallet and confirm Midnight is on Preview for the VIA testnet route.',
    technical: message,
  }

  return {
    title: 'The intent did not complete',
    guidance: 'Your funds were not intentionally retried. Inspect the technical detail, correct the issue, then authorize again.',
    technical: message,
  }
}
