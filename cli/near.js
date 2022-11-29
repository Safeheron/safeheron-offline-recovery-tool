/* eslint-disable no-console */
/* eslint-disable camelcase */
const nearAPI = require('near-api-js')
const sha256 = require('js-sha256')
const fetch = require('node-fetch')
const {
  ed25519_sign,
  ed25519_get_pubkey_hex,
} = require('@safeheron/master-key-derive')

// solve the near-js-api function_call only returns SuccessValue
// this is a hack that may break with near-api-js upgrades
const patchFetch = () => {
  const originFetch = global.fetch

  global.fetch = async (...args) => {
    let method
    try {
      method = JSON.parse(args[1].body).method
    } catch (err) { /* empty */ }
    if (method === 'broadcast_tx_commit') {
      const res = await originFetch(...args)
      const json = await res.json()
      if (json?.result?.status?.SuccessValue === '' && json?.result?.transaction?.hash) {
        json.result.status.SuccessValue = Buffer.from(json.result.transaction.hash, 'utf8').toString('base64')
      }
      return new fetch.Response(JSON.stringify(json), res)
    }
    return originFetch(...args)
  }
}

patchFetch()

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
  const { sender, network, privateKey } = config
  const near = await nearAPI.connect({
    networkId: network,
    nodeUrl: `https://rpc.${network}.near.org`,
    walletUrl: `https://wallet.${network}.near.org`,
    helperUrl: `https://helper.${network}.near.org`,
    signer: new MPCSigner(privateKey),
  })
  return near.account(sender)
}

const transfer = async config => {
  const { amount, receiver, network } = config
  const account = await createAccount(config)
  const amt = nearAPI.utils.format.parseNearAmount(String(amount))
  const result = await account.sendMoney(receiver, amt)
  console.log('A transactions has been successfully sent!')
  console.log(
    '--------------------------------------------------------------------------------------------'
  )
  console.log('Open link below to see transaction in NEAR explorer')
  console.log(`https://explorer.${network}.near.org/transactions/${result.transaction.hash}`)
  console.log(
    '--------------------------------------------------------------------------------------------'
  )
}

const ftTransfer = async config => {
  const { receiver, ftoken, amount, network } = config
  const account = await createAccount(config)
  const contract = new nearAPI.Contract(account, ftoken, {
    viewMethods: ['storage_balance_of', 'ft_metadata', 'storage_balance_bounds'],
    changeMethods: ['ft_transfer', 'storage_deposit']
  })

  const [balance, metadata] = await Promise.all([
    contract.storage_balance_of({ account_id: receiver }),
    contract.ft_metadata(),
  ])
  if (!balance) {
    const bound = await contract.storage_balance_bounds()
    await contract.storage_deposit({
      args: {
        account_id: receiver,
      },
      amount: bound.min,
    })
  }
  const hash = await contract.ft_transfer({
    args: {
      receiver_id: receiver,
      amount: String(10 ** metadata.decimals * amount),
    },
    amount: 1,
  })
  if (hash) {
    console.log('A transactions has been successfully sent!')
    console.log(
      '--------------------------------------------------------------------------------------------'
    )
    console.log('Open link below to see transaction in NEAR explorer')
    console.log(`https://explorer.${network}.near.org/transactions/${hash}`)
    console.log(
      '--------------------------------------------------------------------------------------------'
    )
  }
}

module.exports = {
  transfer,
  ftTransfer,
}
