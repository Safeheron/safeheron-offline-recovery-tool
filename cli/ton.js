/* eslint-disable camelcase */
const crypto = require('crypto')

const {
  ed25519_get_pubkey_hex,
  ed25519_sign,
} = require('@safeheron/master-key-derive')
const {
  Dictionary,
  WalletContractV4,
  TonClient,
  internal,
  beginCell,
  Address,
  toNano,
  external,
  storeMessage,
  comment,
} = require('@ton/ton')
const fetch = require('node-fetch')

const { logReceipt, parseAmount, startTaskPolling } = require('./utils')
const { isSafeUrl, validateCustomRpcUrl } = require('./rpc')

const getUserJettonWalletAddress = async (
  userAddress,
  jettonMasterAddress,
  client
) => {
  const userAddressCell = beginCell()
    .storeAddress(Address.parse(userAddress))
    .endCell()

  const response = await client.runMethod(
    Address.parse(jettonMasterAddress),
    'get_wallet_address',
    [{ type: 'slice', cell: userAddressCell }]
  )

  return response.stack.readAddress()
}

const sha256Key = name => {
  const hash = crypto.createHash('sha256').update(name).digest()
  return BigInt(`0x${hash.toString('hex')}`)
}

const getJettonDecimals = async (client, jettonMasterAddress) => {
  const fallbackDecimals = 9
  const result = await client.runMethod(
    Address.parse(jettonMasterAddress),
    'get_jetton_data'
  )

  result.stack.readBigNumber() // total_supply
  result.stack.readNumber() // mintable
  result.stack.readAddress() // admin_address
  const jettonContent = result.stack.readCell()

  const slice = jettonContent.beginParse()
  const prefix = slice.loadUint(8)

  if (prefix === 0x00) {
    // on-chain TEP-64 content
    const dict = slice.loadDict(
      Dictionary.Keys.BigUint(256),
      Dictionary.Values.Cell()
    )
    const decimalsCell = dict.get(sha256Key('decimals'))
    if (decimalsCell) {
      try {
        const s = decimalsCell.beginParse()
        s.loadUint(8) // snake prefix
        return parseInt(s.loadStringTail()) || fallbackDecimals
      } catch {
        return fallbackDecimals
      }
    }
  } else if (prefix === 0x01) {
    // off-chain: fetch the metadata URI
    const uri = slice.loadStringTail()
    if (!isSafeUrl(uri)) {
      return fallbackDecimals
    }
    try {
      const res = await fetch(uri)
      const json = await res.json()
      return parseInt(json.decimals) || fallbackDecimals
    } catch {
      return fallbackDecimals
    }
  }

  return fallbackDecimals // fallback
}

const mpcSigner = async (cell, privateKey) => {
  const hash = cell.hash()
  const signatureHex = await ed25519_sign(privateKey, hash.toString('hex'))
  return Buffer.from(signatureHex, 'hex')
}

const publicRPC = {
  mainnet: 'https://toncenter.com/api/v2/jsonRPC',
  testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
}

const transfer = async config => {
  const { amount, receiver, network, privateKey, rpc, memo } = config
  const rpcEndpoint = validateCustomRpcUrl(rpc)

  const pubHex = ed25519_get_pubkey_hex(privateKey)

  const client = new TonClient({
    endpoint: rpcEndpoint || publicRPC[network],
  })

  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: Buffer.from(pubHex, 'hex'),
  })

  const contract = client.open(wallet)

  const seqno = await contract.getSeqno()
  const parsedReceiver = Address.parseFriendly(receiver)

  const internalMessage = internal({
    value: amount,
    to: parsedReceiver.address,
    body: memo,
    bounce: parsedReceiver.isBounceable,
  })

  const body = await contract.createTransfer({
    seqno,
    signer: cell => mpcSigner(cell, privateKey),
    messages: [internalMessage],
  })

  const isDeployed = await client.isContractDeployed(wallet.address)

  const externalMessage = external({
    to: wallet.address,
    init: isDeployed ? undefined : wallet.init,
    body,
  })

  const externalMessageCell = beginCell()
    .store(storeMessage(externalMessage))
    .endCell()

  const hash = externalMessageCell.hash().toString('hex')
  await client.sendFile(externalMessageCell.toBoc())

  const confirmed = await startTaskPolling(
    async () => (await contract.getSeqno()) > seqno,
    3,
    60
  )

  const explorer =
    network === 'testnet'
      ? `https://testnet.tonviewer.com/transaction/${hash}`
      : `https://tonviewer.com/transaction/${hash}`

  logReceipt('TON', explorer)
  if (!confirmed) {
    console.log(
      'Note: Transaction confirmation timed out. The transaction may still be processing.'
    )
  }
}

const ftTransfer = async config => {
  const { amount, receiver, network, privateKey, rpc, ftoken, memo } = config
  const rpcEndpoint = validateCustomRpcUrl(rpc)

  const pubHex = ed25519_get_pubkey_hex(privateKey)

  const client = new TonClient({
    endpoint: rpcEndpoint || publicRPC[network],
  })

  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: Buffer.from(pubHex, 'hex'),
  })

  const contract = client.open(wallet)
  const seqno = await contract.getSeqno()

  const sender = wallet.address.toString()

  const jettonWalletAddress = await getUserJettonWalletAddress(
    sender,
    ftoken,
    client
  )

  const jettonDecimals = await getJettonDecimals(client, ftoken)

  const coins = parseAmount(amount, Number(jettonDecimals || 9))

  const commonBodyCell = beginCell()
    .storeUint(0x0f8a7ea5, 32) // opcode for jetton transfer
    .storeUint(0, 64) // query id
    .storeCoins(coins) // jetton amount, amount * 10^9, note: usdt is 10^6
    .storeAddress(Address.parse(receiver))
    .storeAddress(Address.parse(sender)) // response destination
    .storeBit(0) // no custom payload
    .storeCoins(toNano(0.01)) // forward amount - if > 0, will send notification message

  let messageBodyCell
  if (memo) {
    messageBodyCell = commonBodyCell
      .storeBit(1) // we store forwardPayload as a reference, set 1 and uncomment next line for have a comment
      .storeRef(comment(memo))
      .endCell()
  } else {
    messageBodyCell = commonBodyCell.storeBit(0).endCell()
  }

  const internalMessage = internal({
    to: jettonWalletAddress,
    value: toNano('0.1'),
    bounce: true,
    body: messageBodyCell,
  })

  const body = await wallet.createTransfer({
    seqno,
    signer: cell => mpcSigner(cell, privateKey),
    messages: [internalMessage],
  })

  const isDeployed = await client.isContractDeployed(wallet.address)

  const externalMessage = external({
    to: wallet.address,
    init: isDeployed ? undefined : wallet.init,
    body,
  })

  const externalMessageCell = beginCell()
    .store(storeMessage(externalMessage))
    .endCell()
  const signedTransaction = externalMessageCell.toBoc()

  const hash = externalMessageCell.hash().toString('hex')
  await client.sendFile(signedTransaction)

  const confirmed = await startTaskPolling(
    async () => (await contract.getSeqno()) > seqno,
    3,
    60
  )

  const explorer =
    network === 'testnet'
      ? `https://testnet.tonviewer.com/transaction/${hash}`
      : `https://tonviewer.com/transaction/${hash}`

  logReceipt('TON', explorer)
  if (!confirmed) {
    console.log(
      'Note: Transaction confirmation timed out. The transaction may still be processing.'
    )
  }
}

const handleException = err => err?.message

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
