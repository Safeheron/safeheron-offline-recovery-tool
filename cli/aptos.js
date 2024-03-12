/* eslint-disable max-classes-per-file */
/* eslint-disable no-console */
/* eslint-disable camelcase */
const {
  ed25519_sign,
  ed25519_get_pubkey_hex,
} = require('@safeheron/master-key-derive')
const {
  Aptos,
  Network,
  AptosConfig,
  SigningScheme,
  Ed25519Signature,
  Ed25519PublicKey,
  AccountAuthenticatorEd25519,
  generateSigningMessage,
} = require('@aptos-labs/ts-sdk')
const BigNumber = require('bignumber.js')
const { sha3_256: sha3Hash } = require('@noble/hashes/sha3')
const { bytesToHex, hexToBytes } = require('@noble/hashes/utils')

const { logReceipt } = require('./utils')

class CustomAptos extends Aptos {
  async sign(args) {
    const { signer, transaction } = args

    const message = generateSigningMessage(transaction)

    return signer.signWithAuthenticator(message)
  }
}

class MPCSigner {
  constructor(privateKey) {
    const pubHex = ed25519_get_pubkey_hex(privateKey)
    this.publicKey = new Ed25519PublicKey(Buffer.from(pubHex, 'hex'))
    this.privateKey = privateKey
    this.signingScheme = SigningScheme.Ed25519
    const hash = sha3Hash.create()
    hash.update(hexToBytes(`${pubHex}00`))
    const result = hash.digest()
    this.address = `0x${bytesToHex(result)}`
  }

  async signWithAuthenticator(message) {
    const sigHex = await ed25519_sign(this.privateKey, message)
    const signature = new Ed25519Signature(sigHex)
    return new AccountAuthenticatorEd25519(this.publicKey, signature)
  }
}

const transfer = async config => {
  const { amount, receiver, network, privateKey, rpc } = config

  let aptosConfig

  if (rpc) {
    aptosConfig = new AptosConfig({
      fullnode: rpc,
    })
  } else {
    aptosConfig = new AptosConfig({
      network: network === 'mainnet' ? Network.MAINNET : Network.TESTNET,
    })
  }

  const aptos = new CustomAptos(aptosConfig)

  const signer = new MPCSigner(privateKey)

  console.log('signer address:', signer.address)

  const transaction = await aptos.transferCoinTransaction({
    sender: signer.address,
    recipient: receiver,
    // use BigNumber because "10 ** 8 * 1.1 === 110000000.00000001"
    amount: BigInt(new BigNumber(10 ** 8).multipliedBy(amount).toString()),
  })

  const senderAuthenticator = await aptos.sign({ signer, transaction })
  const pendingTxn = await aptos.transaction.submit.simple({
    transaction,
    senderAuthenticator,
  })

  const response = await aptos.waitForTransaction({
    transactionHash: pendingTxn.hash,
  })
  const explorer = `https://explorer.aptoslabs.com/txn/${response.hash}?network=${network}`
  logReceipt('Aptos', explorer)
}

const ftTransfer = async () => {
  throw new Error('not support')
}

const handleException = err => {
  console.log(err)
}

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
