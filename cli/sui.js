/* eslint-disable no-console */
/* eslint-disable camelcase */

const {
  TransactionBlock,
  JsonRpcProvider,
  SignerWithProvider,
  toSerializedSignature,
  Ed25519PublicKey,
  Connection,
} = require('@mysten/sui.js')
const {
  ed25519_sign,
  ed25519_get_pubkey_hex,
} = require('@safeheron/master-key-derive')
const { blake2b } = require('blakejs')
const BigNumber = require('bignumber.js')

const { parseAmount, logReceipt } = require('./utils')

const mainnetConnection = new Connection({
  fullnode: 'https://sui-mainnet-rpc.allthatnode.com',
})

const testnetConnection = new Connection({
  fullnode: 'https://sui-testnet-rpc.allthatnode.com',
})

class MPCSigner extends SignerWithProvider {
  constructor(privateKey, provider) {
    super(provider)
    const pubHex = ed25519_get_pubkey_hex(privateKey)
    const publicKey = Buffer.from(pubHex, 'hex')
    this.publicKey = new Ed25519PublicKey(publicKey)
    this.privateKey = privateKey
  }

  getAddress() {
    return this.publicKey.toSuiAddress()
  }

  async signData(data) {
    const digest = blake2b(data, undefined, 32)
    const sigHex = await ed25519_sign(this.privateKey, digest)

    return toSerializedSignature({
      signatureScheme: 'ED25519',
      signature: Buffer.from(sigHex, 'hex'),
      pubKey: this.publicKey,
    })
  }
}

const transfer = async config => {
  const { amount, receiver, network, privateKey } = config
  const signer = new MPCSigner(
    privateKey,
    new JsonRpcProvider(
      network === 'mainnet' ? mainnetConnection : testnetConnection
    )
  )
  const tx = new TransactionBlock()
  const [coin] = tx.splitCoins(tx.gas, [tx.pure(parseAmount(amount, 9))])
  tx.transferObjects([coin], tx.pure(receiver))
  const result = await signer.signAndExecuteTransactionBlock({
    transactionBlock: tx,
  })
  const explorer = `https://suiexplorer.com/txblock/${result.digest}?network=${network}`
  logReceipt('SUI', explorer)
}

const ftTransfer = async config => {
  const { amount, receiver, network, privateKey, ftoken } = config

  const provider = new JsonRpcProvider(
    network === 'mainnet' ? mainnetConnection : testnetConnection
  )
  const signer = new MPCSigner(privateKey, provider)
  const [coinMetadata, objects] = await Promise.all([
    getCoinMetadata(provider, ftoken),
    getTargetCoinObjects(provider, ftoken, signer.getAddress())
  ])
  const bigIntAmount = parseAmount(amount, coinMetadata.decimals)
  const len = objects.length
  if (len === 0) {
    throw new Error('Insufficient balance')
  }

  const tx = new TransactionBlock()

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

    tx.mergeCoins(primaryCoinInput, objects.slice(1, idx).map(coin => tx.object(coin.coinObjectId)))
  }

  const coin = tx.splitCoins(primaryCoinInput, [tx.pure(bigIntAmount)])
  tx.transferObjects([coin], tx.pure(receiver))
  const result = await signer.signAndExecuteTransactionBlock({
    transactionBlock: tx,
  })
  const explorer = `https://suiexplorer.com/txblock/${result.digest}?network=${network}`
  logReceipt('SUI', explorer)
}

const handleException = err => {
  console.log(err)
}

const getTargetCoinObjects = async (provider, ftoken, owner) => {
  const res = await provider.getCoins({
    owner,
    coinType: ftoken,
  })
  const coinObjects = res.data
    .sort((a, b) => b.balance - a.balance)
  return coinObjects
}

const getCoinMetadata = async (provider, ftoken) => {
  const metadata = await provider.getCoinMetadata({
    coinType: ftoken,
  })
  return metadata
}

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
