export interface FriendlyError {
  title: string
  guidance: string
  technical: string
}

export function explainBridgeError(raw: string): FriendlyError {
  const message = raw || 'Unknown bridge error'
  const value = message.toLowerCase()

  if (value.includes('cardano') && value.includes('network')) return {
    title: 'Cardano needs the Preprod network',
    guidance: 'Switch the Cardano wallet to Preprod, then start a new intent and reconnect. Mainnet funds cannot be used on this sprint route.',
    technical: message,
  }

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
    guidance: 'Check your wallet transaction history before starting another intent. Approve the wallet request only when the displayed transaction matches your intent.',
    technical: message,
  }

  if (value.includes('wallet') || value.includes('connect')) return {
    title: 'A wallet connection needs attention',
    guidance: 'Reconnect the required wallet and confirm Midnight is on Preview for the VIA testnet route.',
    technical: message,
  }

  return {
    title: 'The intent did not complete',
    guidance: 'The outcome may be uncertain. Check your wallet and source transaction history before starting another intent. No transaction is automatically retried.',
    technical: message,
  }
}
