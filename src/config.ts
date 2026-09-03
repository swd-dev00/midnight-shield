/** Competition demo pair: Cardano Preprod ↔ Midnight Preview. */
export const NETWORK_LABEL = 'Cardano Preprod ↔ Midnight Preview'
export const MIDNIGHT_NETWORK_ID = 'preview'

/** tUSDM on Cardano Preprod (policy id + asset name). */
export const CARDANO_USDM_UNIT = 'e675b46e4d2242c991a8932a99db3044e80515ae14b4c4ccf6b3f4c90014df10745553444d'
/** USDM token color on Midnight Preview. */
export const MIDNIGHT_USDM_TOKEN_COLOR = '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73'

/** Midnight wallets can inject a Cardano stub that cannot sign Cardano transactions. */
export const NOT_CARDANO = /1am|midnight|mnlace/i

export const cardanoExplorerTxUrl = (txHash: string): string =>
  `https://preprod.cardanoscan.io/transaction/${txHash}`

export const viaScanUrl = 'https://scan.vialabs.tech'
