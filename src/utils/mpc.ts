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
import {
  padToLength,
  toCompressedPubKeyHex,
  toUncompressedPubKeyHex,
} from './common'
import {
  CSV_FIELD_BLOCKCHAIN,
  CSV_FIELD_NETWORK,
  CSV_FIELD_ADDRESS,
  CSV_REQUIRED_FIELD,
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
  [CSV_REQUIRED_FIELD]: string
  [CSV_FIELD_NETWORK]: string
  [CSV_FIELD_ADDRESS]: string
  [CSV_FIELD_ALGO]: string
  [CSV_FIELD_BLOCKCHAIN]: SUPPORTED_BLOCKCHAIN_TYPE
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

const validateAddress = (
  chainType: SUPPORTED_BLOCKCHAIN_TYPE,
  publicKeyPoint: any,
  pubhex: string,
  address: string,
  row: number
) => {
  let derivedAddress: string[] = []
  let newAddress = address
  switch (chainType) {
    case EVM_CHAIN:
      newAddress = address.toLowerCase()
      derivedAddress = blockchainUtil.ethereum
        .derivedAddress(pubhex)
        .map((add: string) => add.toLowerCase())
      break
    case BITCOIN_CHAIN:
    case BITCOIN_TEST_CHAIN:
      derivedAddress = blockchainUtil.bitcoin.derivedAddress(pubhex)
      break
    case BITCOIN_CASH_CHAIN:
      derivedAddress = blockchainUtil.bitcoincash.derivedAddress(pubhex)
      break
    case DOGE_CHAIN:
    case DOGE_TEST_CHAIN:
      derivedAddress = blockchainUtil.doge.derivedAddress(pubhex)
      break
    case LTC_CHAIN:
    case LTC_TEST_CHAIN:
      derivedAddress = blockchainUtil.ltc.derivedAddress(pubhex)
      break
    case DASH_CHAIN:
      derivedAddress = blockchainUtil.dash.derivedAddress(pubhex)
      break
    case TRON_CHAIN:
      derivedAddress = blockchainUtil.tron.derivedAddress(
        toUncompressedPubKeyHex(publicKeyPoint)
      )
      break
    case NEAR_CHAIN:
      derivedAddress = blockchainUtil.near.derivedAddress(pubhex)
      break
    case FIL_CHAIN:
      derivedAddress = blockchainUtil.filecoin.derivedAddress(
        toUncompressedPubKeyHex(publicKeyPoint)
      )
      break
    case SUI_CHAIN:
      derivedAddress = blockchainUtil.sui.derivedAddress(pubhex)
      break
    case APTOS_CHAIN:
      derivedAddress = blockchainUtil.aptos.derivedAddress(pubhex)
      break
    case SOLANA_CHAIN:
      derivedAddress = blockchainUtil.solana.derivedAddress(pubhex)
      break
    case TON_CHAIN:
    case TON_TEST_CHAIN:
      derivedAddress = blockchainUtil.ton.derivedAddress(pubhex)
      break
    case LIQUID_CHAIN:
    case LIQUID_TEST_CHAIN:
      derivedAddress = blockchainUtil.liquid.derivedAddress(pubhex)
      break
    default:
      break
  }
  if (!derivedAddress.includes(newAddress)) {
    const msg = `derived address: ${JSON.stringify(
      derivedAddress
    )}, expected address: ${newAddress}`
    throw new ValidateAddressError(msg)
  }
}

export const recoverDerivedCSV = (
  csv: RawCSVRow[],
  hdkey: MultiAlgoHDKey
): DerivedCSVRow[] => {
  const res = csv.map((item, index) => {
    const path = item[CSV_REQUIRED_FIELD]
    const network = item[CSV_FIELD_NETWORK]
    const address = item[CSV_FIELD_ADDRESS]
    const algo = item[CSV_FIELD_ALGO]
    const blockchain = item[
      CSV_FIELD_BLOCKCHAIN
    ].toLowerCase() as SUPPORTED_BLOCKCHAIN_TYPE

    let childKey
    let priv
    let compressedPubKey
    if (algo === 'ed25519') {
      childKey = hdkey.ed25519.derive(path)
      compressedPubKey = childKey.publicKeyAsHex
      priv = childKey.privateKeyAsHex
    } else {
      childKey = hdkey.secp256k1.derive(path)
      compressedPubKey = toCompressedPubKeyHex(childKey.publicKey)
      priv = padToLength(childKey.privateKey.toString(16), 32)
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

    validateAddress(
      blockchain,
      childKey.publicKey,
      compressedPubKey,
      address,
      index + 2
    )

    return {
      ...item,
      'Private Key': privateKey,
      'Public Key': compressedPubKey,
    }
  })
  return res
}
