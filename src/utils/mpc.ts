/* eslint-disable max-classes-per-file */
import {
  MasterKeyPair,
  MasterKeyShare,
  Mnemonics,
  SigAlg,
} from '@safeheron/master-key-derive'
import { BN } from 'bn.js'
import { Secp256k1HDKey, Ed25519HDKey } from '@safeheron/crypto-bip32'
import { mnemonicToEntropy } from 'bip39'

import blockchainUtil from './blockchain'
import { UnsupportBlockChainError } from './csv'
import {
  padToLength,
  toCompressedPubKeyHex,
  toUncompressedPubKeyHex,
} from './common'
import {
  CSV_FIELD_BLOCKCHAIN,
  CSV_FIELD_NETWORK,
  CSV_FIELD_ADDRESS,
  CSV_FIELD_ADDR_TYPE,
  CSV_FIELD_HD_PATH,
  CSV_FIELD_PRIVATE_KEY,
  CSV_FIELD_PUBLIC_KEY,
  CSV_FIELD_ALGO,
  SUPPORTED_BLOCKCHAIN_TYPE,
  BITCOIN_CASH_CHAIN,
  BITCOIN_CHAIN,
  BITCOIN_TEST_CHAIN,
  DASH_CHAIN,
  EVM_CHAIN,
  NEAR_CHAIN,
  TRON_CHAIN,
  FIL_CHAIN,
  SUI_CHAIN,
  APTOS_CHAIN,
  SOLANA_CHAIN,
  TON_CHAIN,
  TON_TEST_CHAIN,
  TON_TEST_CHAIN_ALIAS,
  DOGE_CHAIN,
  DOGE_TEST_CHAIN,
  LTC_TEST_CHAIN,
  LTC_CHAIN,
  LIQUID_CHAIN,
  LIQUID_TEST_CHAIN,
} from './const'

export interface MultiAlgoHDKey {
  secp256k1: Secp256k1HDKey
  ed25519: Ed25519HDKey
}

export interface RawCSVRow {
  [key: string]: string
  [CSV_FIELD_HD_PATH]: string
  [CSV_FIELD_NETWORK]: string
  [CSV_FIELD_ADDRESS]: string
  [CSV_FIELD_ADDR_TYPE]: string
  [CSV_FIELD_ALGO]: string
  [CSV_FIELD_BLOCKCHAIN]: string
}

export interface DerivedCSVRow extends RawCSVRow {
  [CSV_FIELD_PUBLIC_KEY]: string
  [CSV_FIELD_PRIVATE_KEY]: string
}

export const recoverHDKeyFromMnemonics = (
  mnemonics: string[],
  chainCode?: string
): MultiAlgoHDKey => {
  if (chainCode) {
    const chaincodeBN = new BN(chainCode, 16)
    const mnemonicHexArray = mnemonics.map(m => mnemonicToEntropy(m))
    const masterKeyshareArray = []
    for (const mnemonicHex of mnemonicHexArray) {
      const keyshare = new BN(mnemonicHex, 16)
      masterKeyshareArray.push(new MasterKeyShare(keyshare, chaincodeBN, true))
    }
    const masterKeyPairSecp256k1 = MasterKeyPair.recoverFromMasterKeyShares(
      masterKeyshareArray,
      SigAlg.ECDSA_SECP256K1
    )

    const ms = mnemonics.map(m => new Mnemonics(m, ''))
    const masterKeyPairSecpEd25519 = MasterKeyPair.recoverFromMnemonics(
      ms,
      SigAlg.EDDSA_ED25519
    )

    const secp256k1 = Secp256k1HDKey.fromExtendedKey(
      masterKeyPairSecp256k1.xprv
    )
    const ed25519 = Ed25519HDKey.fromExtendedKey(masterKeyPairSecpEd25519.xprv)
    return {
      secp256k1,
      ed25519,
    }
  }

  const ms = mnemonics.map(m => new Mnemonics(m, ''))

  const masterKeyPairSecp256k1 = MasterKeyPair.recoverFromMnemonics(
    ms,
    SigAlg.ECDSA_SECP256K1
  )
  const masterKeyPairSecpEd25519 = MasterKeyPair.recoverFromMnemonics(
    ms,
    SigAlg.EDDSA_ED25519
  )

  const secp256k1 = Secp256k1HDKey.fromExtendedKey(masterKeyPairSecp256k1.xprv)
  const ed25519 = Ed25519HDKey.fromExtendedKey(masterKeyPairSecpEd25519.xprv)

  return {
    secp256k1,
    ed25519,
  }
}

const isBTCLike = (blockchian: SUPPORTED_BLOCKCHAIN_TYPE): boolean =>
  [BITCOIN_CHAIN, BITCOIN_TEST_CHAIN, DASH_CHAIN, BITCOIN_CASH_CHAIN, LIQUID_CHAIN, LIQUID_TEST_CHAIN].includes(blockchian)
const isFil = (blockchain: SUPPORTED_BLOCKCHAIN_TYPE) =>
  FIL_CHAIN === blockchain
const isLTC = (blockchain: SUPPORTED_BLOCKCHAIN_TYPE) =>
  [LTC_CHAIN, LTC_TEST_CHAIN].includes(blockchain)
const isDoge = (blockchain: SUPPORTED_BLOCKCHAIN_TYPE) =>
  [DOGE_CHAIN, DOGE_TEST_CHAIN].includes(blockchain)

export class ValidateAddressError extends Error {}

/**
 * Select the single correct address from the deriveAddresses result array
 * based on chain type, address type, and network.
 */
const selectAddress = (
  chainType: SUPPORTED_BLOCKCHAIN_TYPE,
  derived: string[],
  addrType: string,
  network: string,
): string => {
  const isMainnet = network === 'mainnet'
  switch (chainType) {
    case BITCOIN_CHAIN:
    case BITCOIN_TEST_CHAIN:
      // [p2wpkh_mainnet, p2wpkh_testnet, p2pkh_testnet, p2pkh_mainnet]
      if (addrType === 'P2WPKH') return derived[isMainnet ? 0 : 1]
      return derived[isMainnet ? 3 : 2]
    case BITCOIN_CASH_CHAIN:
      // [legacyP2PKH, cashAddr]
      return addrType === 'P2PKH_CASH' ? derived[1] : derived[0]
    case LTC_CHAIN:
    case LTC_TEST_CHAIN:
      // [p2pkhTestnet, p2wpkhTestnet, p2pkhMainnet, p2wpkhMainnet]
      if (addrType === 'P2WPKH') return derived[isMainnet ? 3 : 1]
      return derived[isMainnet ? 2 : 0]
    case DOGE_CHAIN:
    case DOGE_TEST_CHAIN:
      // [p2pkhTestnet, p2pkhMainnet]
      return derived[isMainnet ? 1 : 0]
    case LIQUID_CHAIN:
    case LIQUID_TEST_CHAIN:
      // [p2pkhTestnet, p2pkhMainnet, p2wpkhTestnet, p2pwkhMainnet]
      if (addrType === 'P2WPKH') return derived[isMainnet ? 3 : 2]
      return derived[isMainnet ? 1 : 0]
    case TON_CHAIN:
      // [mainnet, testnet]
      return derived[0]
    case TON_TEST_CHAIN:
    case TON_TEST_CHAIN_ALIAS:
      // [mainnet, testnet]
      return derived[1]
    default:
      return derived[0]
  }
}

const deriveAddresses = (
  chainType: SUPPORTED_BLOCKCHAIN_TYPE,
  publicKeyPoint: any,
  pubhex: string,
): string[] => {
  switch (chainType) {
    case EVM_CHAIN:
      return blockchainUtil.ethereum.derivedAddress(pubhex)
    case BITCOIN_CHAIN:
    case BITCOIN_TEST_CHAIN:
      return blockchainUtil.bitcoin.derivedAddress(pubhex)
    case BITCOIN_CASH_CHAIN:
      return blockchainUtil.bitcoincash.derivedAddress(pubhex)
    case DOGE_CHAIN:
    case DOGE_TEST_CHAIN:
      return blockchainUtil.doge.derivedAddress(pubhex)
    case LTC_CHAIN:
    case LTC_TEST_CHAIN:
      return blockchainUtil.ltc.derivedAddress(pubhex)
    case DASH_CHAIN:
      return blockchainUtil.dash.derivedAddress(pubhex)
    case TRON_CHAIN:
      return blockchainUtil.tron.derivedAddress(
        toUncompressedPubKeyHex(publicKeyPoint)
      )
    case NEAR_CHAIN:
      return blockchainUtil.near.derivedAddress(pubhex)
    case FIL_CHAIN:
      return blockchainUtil.filecoin.derivedAddress(
        toUncompressedPubKeyHex(publicKeyPoint)
      )
    case SUI_CHAIN:
      return blockchainUtil.sui.derivedAddress(pubhex)
    case APTOS_CHAIN:
      return blockchainUtil.aptos.derivedAddress(pubhex)
    case SOLANA_CHAIN:
      return blockchainUtil.solana.derivedAddress(pubhex)
    case TON_CHAIN:
    case TON_TEST_CHAIN:
    case TON_TEST_CHAIN_ALIAS:
      return blockchainUtil.ton.derivedAddress(pubhex)
    case LIQUID_CHAIN:
    case LIQUID_TEST_CHAIN:
      return blockchainUtil.liquid.derivedAddress(pubhex)
    default:
      // Reached when a row's Blockchain Type isn't in SUPPORTED_BLOCKCHAIN.
      // Backstop check — the worker's parseCsvLine also rejects unsupported chains.
      throw new UnsupportBlockChainError(String(chainType))
  }
}

const validateAddress = (
  chainType: SUPPORTED_BLOCKCHAIN_TYPE,
  publicKeyPoint: any,
  pubhex: string,
  address: string,
) => {
  const derived = deriveAddresses(chainType, publicKeyPoint, pubhex)
  if (chainType === EVM_CHAIN) {
    const match = derived.some(d => d.toLowerCase() === address.toLowerCase())
    if (!match) {
      const msg = `derived address: ${JSON.stringify(derived)}, expected address: ${address}`
      throw new ValidateAddressError(msg)
    }
  } else if (!derived.includes(address)) {
    const msg = `derived address: ${JSON.stringify(derived)}, expected address: ${address}`
    throw new ValidateAddressError(msg)
  }
}

/**
 * Parse HD path "m/44/666/3/0/5" into parent path "m/44/666/3/0" and last index 5.
 * Used for intermediate path caching: derive parent once, then deriveChild for each address.
 */
function splitPath(path: string): { parentPath: string; lastIndex: number } {
  const lastSlash = path.lastIndexOf('/')
  return {
    parentPath: path.slice(0, lastSlash),
    lastIndex: parseInt(path.slice(lastSlash + 1), 10),
  }
}

/**
 * Map subclass that evicts the least-recently-used entry when over capacity.
 * On `get`, hit entries are moved to the end (most recent). On `set`, if the
 * map is full the oldest entry is evicted before the new one is inserted.
 *
 * Extends Map so existing tests (`instanceof Map`) and callers continue to
 * work; only `get` and `set` are overridden to track recency.
 */
export class LRUMap<K, V> extends Map<K, V> {
  private readonly maxEntries: number

  constructor(maxEntries: number) {
    super()
    this.maxEntries = maxEntries
  }

  override get(key: K): V | undefined {
    const value = super.get(key)
    if (value !== undefined) {
      // Refresh recency by deleting + re-inserting.
      super.delete(key)
      super.set(key, value)
    }
    return value
  }

  override set(key: K, value: V): this {
    if (super.has(key)) {
      super.delete(key)
    } else if (super.size >= this.maxEntries) {
      const oldestKey = super.keys().next().value
      if (oldestKey !== undefined) super.delete(oldestKey)
    }
    return super.set(key, value)
  }
}

// Cache sizes picked so per-worker cache stays ~10MB regardless of total rows.
// Entry ≈ 700B; 10K + 5K entries ≈ 10MB.
const CHILD_CACHE_MAX = 10_000
const PARENT_CACHE_MAX = 5_000

export interface DeriveCache {
  parentKeyCache: Map<string, any>
  childKeyCache: Map<string, { childKey: any; priv: string; compressedPubKey: string }>
}

export function createDeriveCache(): DeriveCache {
  return {
    parentKeyCache: new LRUMap(PARENT_CACHE_MAX),
    childKeyCache: new LRUMap(CHILD_CACHE_MAX),
  }
}

export const recoverDerivedCSV = (
  csv: RawCSVRow[],
  hdkey: MultiAlgoHDKey,
  cache?: DeriveCache
): DerivedCSVRow[] => {
  const parentKeyCache = cache?.parentKeyCache ?? new Map<string, any>()
  const childKeyCache = cache?.childKeyCache ?? new Map<string, { childKey: any; priv: string; compressedPubKey: string }>()

  const res = csv.map(item => {
    const path = item[CSV_FIELD_HD_PATH]
    const network = item[CSV_FIELD_NETWORK]
    const address = item[CSV_FIELD_ADDRESS]
    const algo = item[CSV_FIELD_ALGO]
    const blockchain = item[
      CSV_FIELD_BLOCKCHAIN
    ].toLowerCase() as SUPPORTED_BLOCKCHAIN_TYPE

    const cacheKey = `${algo}:${path}`
    let childKey
    let priv
    let compressedPubKey

    const cached = childKeyCache.get(cacheKey)
    if (cached) {
      childKey = cached.childKey
      priv = cached.priv
      compressedPubKey = cached.compressedPubKey
    } else {
      const { parentPath, lastIndex } = splitPath(path)
      const parentCacheKey = `${algo}:${parentPath}`

      // Get or derive parent key
      let parentKey = parentKeyCache.get(parentCacheKey)
      if (!parentKey) {
        parentKey = algo === 'ed25519'
          ? hdkey.ed25519.derive(parentPath)
          : hdkey.secp256k1.derive(parentPath)
        parentKeyCache.set(parentCacheKey, parentKey)
      }

      // Derive only the last level from parent
      childKey = parentKey.deriveChild(lastIndex)

      if (algo === 'ed25519') {
        compressedPubKey = childKey.publicKeyAsHex
        priv = childKey.privateKeyAsHex
      } else {
        compressedPubKey = toCompressedPubKeyHex(childKey.publicKey)
        priv = padToLength(childKey.privateKey.toString(16), 32)
      }
      childKeyCache.set(cacheKey, { childKey, priv, compressedPubKey })
    }

    let privateKey = priv
    if (isBTCLike(blockchain)) {
      privateKey = blockchainUtil.bitcoin.wifEncodePrivateKey(
        priv,
        network === 'mainnet'
      )
    } else if (isFil(blockchain)) {
      privateKey = blockchainUtil.filecoin.formatPrivateKey(priv)
    } else if (isLTC(blockchain)) {
      privateKey = blockchainUtil.ltc.wifEncodePrivateKey(
        priv,
        network === 'mainnet'
      )
    } else if (isDoge(blockchain)) {
      privateKey = blockchainUtil.doge.wifEncodePrivateKey(
        priv,
        network === 'mainnet'
      )
    }

    let outputAddress = address
    if (address) {
      validateAddress(
        blockchain,
        childKey.publicKey,
        compressedPubKey,
        address,
      )
    } else {
      const derived = deriveAddresses(blockchain, childKey.publicKey, compressedPubKey)
      outputAddress = selectAddress(blockchain, derived, item[CSV_FIELD_ADDR_TYPE], network)
    }

    const result: Record<string, string> = {}
    const accountName = (item as Record<string, string>)['Account Name']
    if (accountName !== undefined) result['Account Name'] = accountName
    result[CSV_FIELD_BLOCKCHAIN] = item[CSV_FIELD_BLOCKCHAIN]
    result[CSV_FIELD_NETWORK] = network
    result[CSV_FIELD_ADDRESS] = outputAddress
    result[CSV_FIELD_ADDR_TYPE] = item[CSV_FIELD_ADDR_TYPE]
    result[CSV_FIELD_HD_PATH] = path
    result[CSV_FIELD_ALGO] = algo
    result[CSV_FIELD_PUBLIC_KEY] = compressedPubKey
    result[CSV_FIELD_PRIVATE_KEY] = privateKey
    return result as unknown as DerivedCSVRow
  })
  return res
}
