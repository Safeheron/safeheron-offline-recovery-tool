/* eslint-disable no-console */
/* eslint-disable camelcase */
process.env.NEAR_NO_LOGS = true
process.env.NO_DEPRECATION = '*'

const nearAPI = require('near-api-js')
const sha256 = require('js-sha256')
const {
  ed25519_sign,
  ed25519_get_pubkey_hex,
} = require('@safeheron/master-key-derive')
const { TypedError } = require('near-api-js/lib/providers')

const { parseAmount, logReceipt } = require('./utils')
const { validateCustomRpcUrl } = require('./rpc')

const { parseNearAmount, formatNearAmount } = nearAPI.utils.format

// A typical NEP-141 token asks for ~0.00125 NEAR to register a receiver.
// The contract itself reports the minimum, so a malicious token could demand
// any amount and it would be paid straight to that contract. Cap it.
const MAX_STORAGE_DEPOSIT_NEAR = '0.1'

const patchNearProvider = near => {
  const provider = near?.connection?.provider
  if (!provider || provider.__safeheronPatchedSendJsonRpc) {
    return near
  }

  const originalSendJsonRpc = provider.sendJsonRpc.bind(provider)
  provider.sendJsonRpc = async (method, params) => {
    const result = await originalSendJsonRpc(method, params)
    if (
      method === 'broadcast_tx_commit' &&
      result?.status?.SuccessValue === '' &&
      result?.transaction?.hash
    ) {
      result.status.SuccessValue = Buffer.from(
        result.transaction.hash,
        'utf8'
      ).toString('base64')
    }
    return result
  }
  provider.__safeheronPatchedSendJsonRpc = true
  return near
}

class MPCSigner extends nearAPI.Signer {
  constructor(privateKey) {
    super()
    const pubHex = ed25519_get_pubkey_hex(privateKey)
    const encodedPubKey = nearAPI.utils.serialize.base_encode(
      Buffer.from(pubHex, 'hex')
    )
    const publicKey = nearAPI.utils.PublicKey.fromString(encodedPubKey)
    this.publicKey = publicKey
    this.privateKey = privateKey
  }

  getPublicKey() {
    return this.publicKey
  }

  async signMessage(message) {
    const hash = new Uint8Array(sha256.sha256.array(message))
    const sigHex = await ed25519_sign(this.privateKey, hash)
    const { publicKey } = this
    return {
      signature: Buffer.from(sigHex, 'hex'),
      publicKey,
    }
  }
}

const createAccount = async config => {
  const { sender, network, privateKey, rpc } = config
  const rpcEndpoint = validateCustomRpcUrl(rpc)
  let nodeUrl
  if (network === 'mainnet') {
    nodeUrl = 'https://free.rpc.fastnear.com'
  } else {
    nodeUrl = 'https://test.rpc.fastnear.com'
  }
  const near = await nearAPI.connect({
    networkId: network,
    nodeUrl: rpcEndpoint || nodeUrl,
    signer: new MPCSigner(privateKey),
  })
  patchNearProvider(near)
  return near.account(sender)
}

const transfer = async config => {
  const { amount, receiver, network } = config
  const account = await createAccount(config)
  const amt = nearAPI.utils.format.parseNearAmount(String(amount))
  const result = await account.sendMoney(receiver, amt)
  const explorer =
    network === 'testnet'
      ? `https://testnet.nearblocks.io/txns/${result.transaction.hash}`
      : `https://nearblocks.io/txns/${result.transaction.hash}`
  logReceipt('NEAR', explorer)
}

const ftTransfer = async config => {
  const { receiver, ftoken, amount, network } = config
  const account = await createAccount(config)
  const contract = new nearAPI.Contract(account, ftoken, {
    viewMethods: [
      'storage_balance_of',
      'ft_metadata',
      'storage_balance_bounds',
    ],
    changeMethods: ['ft_transfer', 'storage_deposit'],
  })

  const [balance, metadata] = await Promise.all([
    contract.storage_balance_of({ account_id: receiver }),
    contract.ft_metadata(),
  ])
  if (!balance) {
    const bound = await contract.storage_balance_bounds()
    const deposit = String(bound?.min ?? '')
    if (!/^\d+$/.test(deposit)) {
      throw new Error(
        `Token contract ${ftoken} returned an invalid storage deposit: ${deposit}`
      )
    }
    const depositNear = formatNearAmount(deposit)
    if (BigInt(deposit) > BigInt(parseNearAmount(MAX_STORAGE_DEPOSIT_NEAR))) {
      throw new Error(
        `Token contract ${ftoken} requires a ${depositNear} NEAR storage deposit to register ${receiver}, above the ${MAX_STORAGE_DEPOSIT_NEAR} NEAR limit. Aborted.`
      )
    }
    const notice = `Receiver ${receiver} is not registered with ${ftoken}. A one-time storage deposit of ${depositNear} NEAR will be paid from your account to the token contract.`
    if (config.confirm) {
      if (!(await config.confirm(notice))) {
        throw new Error('Storage deposit declined. No transaction was sent.')
      }
    } else {
      console.log(notice)
    }
    await contract.storage_deposit({
      args: {
        account_id: receiver,
      },
      amount: deposit,
    })
  }
  const hash = await contract.ft_transfer({
    args: {
      receiver_id: receiver,
      amount: parseAmount(amount, metadata.decimals).toString(),
    },
    amount: 1,
  })
  if (hash) {
    const explorer =
      network === 'testnet'
        ? `https://testnet.nearblocks.io/txns/${hash}`
        : `https://nearblocks.io/txns/${hash}`
    logReceipt('NEAR', explorer)
  }
}

const handleException = err => {
  if (err instanceof TypedError && err.type === 'RetriesExceeded') {
    return 'RPC connection failed. Please try again later or change the RPC URL (nodeUrl)'
  }
  return err?.message
}

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
