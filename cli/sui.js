/* eslint-disable no-console */
/* eslint-disable camelcase */

const { Transaction } = require('@mysten/sui/transactions')
const { SuiClient, getFullnodeUrl } = require('@mysten/sui/client')
const { Signer } = require('@mysten/sui/cryptography')
const { Ed25519PublicKey } = require('@mysten/sui/keypairs/ed25519')
const {
  ed25519_sign,
  ed25519_get_pubkey_hex,
} = require('@safeheron/master-key-derive')
const BigNumber = require('bignumber.js')

const { parseAmount, logReceipt } = require('./utils')
const { validateCustomRpcUrl } = require('./rpc')

const SUI_ADDRESS_LENGTH = 32 // 32 bytes = 64 hex chars

/**
 * Validate a Sui address: must be 0x-prefixed, exactly 64 hex chars (32 bytes).
 * Rejects short addresses to prevent the SDK from silently zero-padding.
 */
function validateSuiAddress(address) {
  if (typeof address !== 'string' || !address.startsWith('0x')) {
    throw new Error(`Invalid Sui address: must start with 0x. Got: ${address}`)
  }
  const hex = address.slice(2)
  if (hex.length !== SUI_ADDRESS_LENGTH * 2) {
    throw new Error(
      `Invalid Sui address: expected ${SUI_ADDRESS_LENGTH * 2} hex chars after 0x, got ${hex.length}. Address: ${address}`
    )
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid Sui address: contains non-hex characters. Address: ${address}`)
  }
}

class MPCSigner extends Signer {
  constructor(privateKey) {
    super()
    const pubHex = ed25519_get_pubkey_hex(privateKey)
    const publicKey = Buffer.from(pubHex, 'hex')
    this.publicKey = new Ed25519PublicKey(publicKey)
    this.privateKey = privateKey
  }

  getKeyScheme() {
    return 'ED25519'
  }

  getPublicKey() {
    return this.publicKey
  }

  async sign(bytes) {
    const sigHex = await ed25519_sign(this.privateKey, bytes)
    return Buffer.from(sigHex, 'hex')
  }
}

const getClient = (network, rpc) => {
  const url = validateCustomRpcUrl(rpc) || getFullnodeUrl(network)
  return new SuiClient({ url })
}

const transfer = async config => {
  const { amount, receiver, network, privateKey, rpc } = config
  validateSuiAddress(receiver)
  const client = getClient(network, rpc)
  const signer = new MPCSigner(privateKey)
  const tx = new Transaction()
  const [coin] = tx.splitCoins(tx.gas, [
    tx.pure.u64(parseAmount(amount, 9).toFixed(0)),
  ])
  tx.transferObjects([coin], receiver)
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
  })
  const explorer = `https://suiscan.xyz/${network}/tx/${result.digest}`
  logReceipt('SUI', explorer)
}

const ftTransfer = async config => {
  const { amount, receiver, network, privateKey, ftoken, rpc } = config
  validateSuiAddress(receiver)

  const client = getClient(network, rpc)
  const signer = new MPCSigner(privateKey)
  const [coinMetadata, objects] = await Promise.all([
    getCoinMetadata(client, ftoken),
    getTargetCoinObjects(client, ftoken, signer.toSuiAddress()),
  ])
  const bigIntAmount = parseAmount(amount, coinMetadata.decimals)
  const len = objects.length
  if (len === 0) {
    throw new Error('Insufficient balance')
  }

  const tx = new Transaction()

  let bigIntBalance = new BigNumber(objects[0].balance)

  const primaryCoinInput = tx.object(objects[0].coinObjectId)

  if (bigIntBalance.isLessThan(bigIntAmount)) {
    let idx = 1
    while (bigIntBalance.isLessThan(bigIntAmount) && idx < len) {
      bigIntBalance = bigIntBalance.plus(objects[idx].balance)
      idx += 1
    }
    if (bigIntBalance.isLessThan(bigIntAmount)) {
      throw new Error('Insufficient balance')
    }

    tx.mergeCoins(
      primaryCoinInput,
      objects.slice(1, idx).map(coin => tx.object(coin.coinObjectId))
    )
  }

  const coin = tx.splitCoins(primaryCoinInput, [
    tx.pure.u64(bigIntAmount.toFixed(0)),
  ])
  tx.transferObjects([coin], receiver)
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
  })
  const explorer = `https://suiscan.xyz/${network}/tx/${result.digest}`
  logReceipt('SUI', explorer)
}

const handleException = err => err?.message

const getTargetCoinObjects = async (client, ftoken, owner) => {
  const res = await client.getCoins({
    owner,
    coinType: ftoken,
  })
  const coinObjects = res.data.sort((a, b) => b.balance - a.balance)
  return coinObjects
}

const getCoinMetadata = async (client, ftoken) => {
  const metadata = await client.getCoinMetadata({
    coinType: ftoken,
  })
  if (!metadata) {
    throw new Error(
      `Failed to get coin metadata for ${ftoken}. The CoinMetadata object may not be shared or frozen.`
    )
  }
  return metadata
}

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
