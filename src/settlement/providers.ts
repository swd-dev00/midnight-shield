import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api'
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider'
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider'
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider'
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id'
import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime'
import { CostModel, Transaction } from '@midnight-ntwrk/midnight-js-protocol/ledger'
import type {
  MidnightProvider,
  MidnightProviders,
  PrivateStateProvider,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js-types'
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-utils'
import { MIDNIGHT_NETWORK_ID } from '../config'

export const SETTLEMENT_PRIVATE_STATE_ID = 'viaSettlementState' as const
export type SettlementPrivateState = Record<string, never>
export type SettlementProviders = MidnightProviders<'settle', typeof SETTLEMENT_PRIVATE_STATE_ID, SettlementPrivateState>

function inMemoryPrivateStateProvider(): PrivateStateProvider<typeof SETTLEMENT_PRIVATE_STATE_ID, SettlementPrivateState> {
  const states = new Map<typeof SETTLEMENT_PRIVATE_STATE_ID, SettlementPrivateState>()
  const signingKeys = new Map<ContractAddress, SigningKey>()

  return {
    setContractAddress: () => {},
    set: async (id, state) => { states.set(id, state) },
    get: async (id) => states.get(id) ?? null,
    remove: async (id) => { states.delete(id) },
    clear: async () => { states.clear() },
    setSigningKey: async (address, key) => { signingKeys.set(address, key) },
    getSigningKey: async (address) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address) => { signingKeys.delete(address) },
    clearSigningKeys: async () => { signingKeys.clear() },
    exportPrivateStates: async () => { throw new Error('Private-state export is not supported by the session provider') },
    importPrivateStates: async () => { throw new Error('Private-state import is not supported by the session provider') },
    exportSigningKeys: async () => { throw new Error('Signing-key export is not supported by the session provider') },
    importSigningKeys: async () => { throw new Error('Signing-key import is not supported by the session provider') },
  }
}

export async function createBrowserSettlementProviders(api: ConnectedAPI): Promise<SettlementProviders> {
  const configuration = await api.getConfiguration()
  if (configuration.networkId !== MIDNIGHT_NETWORK_ID) {
    throw new Error(
      `Midnight network mismatch: settlement requires "${MIDNIGHT_NETWORK_ID}"; ` +
      `wallet reported "${configuration.networkId}".`,
    )
  }

  setNetworkId(configuration.networkId)

  const publicDataProvider = indexerPublicDataProvider(
    configuration.indexerUri,
    configuration.indexerWsUri,
  )

  const zkConfigProvider = new FetchZkConfigProvider<'settle'>(
    window.location.origin,
    fetch.bind(window),
  )

  const proofProvider = await dappConnectorProofProvider(
    api,
    zkConfigProvider,
    CostModel.initialCostModel(),
  )

  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = await api.getShieldedAddresses()

  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shieldedEncryptionPublicKey,
    balanceTx: async (tx) => {
      const { tx: balancedHex } = await api.balanceUnsealedTransaction(
        toHex(tx.serialize()),
        {},
      )
      return Transaction.deserialize(
        'signature',
        'proof',
        'binding',
        fromHex(balancedHex),
      )
    },
  }

  const midnightProvider: MidnightProvider = {
    submitTx: async (tx) => {
      await api.submitTransaction(toHex(tx.serialize()))
      const [txId] = tx.identifiers()
      if (!txId) throw new Error('Midnight transaction was submitted without an identifier')
      return txId
    },
  }

  return {
    privateStateProvider: inMemoryPrivateStateProvider(),
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  }
}
