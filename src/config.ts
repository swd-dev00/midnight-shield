/** Competition demo pair: Cardano Preprod ↔ Midnight Preview. */
export const NETWORK_LABEL = 'Cardano Preprod ↔ Midnight Preview'
export const MIDNIGHT_NETWORK_ID = 'preview'

/** tUSDM on Cardano Preprod (policy id + asset name). */
export const CARDANO_USDM_UNIT = 'e675b46e4d2242c991a8932a99db3044e80515ae14b4c4ccf6b3f4c90014df10745553444d'
/** USDM token color on Midnight Preview. */
export const MIDNIGHT_USDM_TOKEN_COLOR = '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73'

/**
 * Filled only after a real Compact deployment exists on Midnight Preview.
 * The UI must not imply application settlement is available while this is empty.
 */
export const MIDNIGHT_SETTLEMENT_CONTRACT_ADDRESS =
  import.meta.env.VITE_MIDNIGHT_SETTLEMENT_CONTRACT_ADDRESS?.trim() ?? ''

/** Midnight wallets can inject a Cardano stub that cannot sign Cardano transactions. */
export const NOT_CARDANO = /1am|midnight|mnlace/i

export const cardanoExplorerTxUrl = (txHash: string): string =>
  `https://preprod.cardanoscan.io/transaction/${txHash}`

const VIA_SCAN = 'https://scan.vialabs.tech'

/** VIA Scan expects Midnight-source hashes with 0x and Cardano-source hashes bare. */
export const viaScanTxUrl = (txHash: string, source: 'cardano' | 'midnight'): string => {
  const bare = txHash.startsWith('0x') ? txHash.slice(2) : txHash
  const normalized = source === 'midnight' ? `0x${bare}` : bare
  return `${VIA_SCAN}/tx/${normalized}`
}

export const viaScanUrl = VIA_SCAN
