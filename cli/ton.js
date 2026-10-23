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
  SendMode,
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
  const fail = reason =>
    new Error(`${reason}. Refusing to guess the jetton precision.`)

  // 1. Read the TEP-64 content cell from the jetton master
  const { stack } = await client.runMethod(
    Address.parse(jettonMasterAddress),
    'get_jetton_data'
  )
  stack.readBigNumber() // total_supply
  stack.readNumber() // mintable
  stack.readAddress() // admin_address
  const content = stack.readCell().beginParse()
  const prefix = content.loadUint(8)

  // 2. Locate the raw decimals value, on-chain or off-chain
  let raw
  let source
  if (prefix === 0x00) {
    source = 'on-chain jetton metadata'
    const dict = content.loadDict(
      Dictionary.Keys.BigUint(256),
      Dictionary.Values.Cell()
    )
    const cell = dict.get(sha256Key('decimals'))
    if (!cell) {
      return 9 // TEP-64: decimals is optional and defaults to 9
    }
    const value = cell.beginParse()
    value.loadUint(8) // snake-format prefix
    raw = value.loadStringTail()
  } else if (prefix === 0x01) {
    const uri = content.loadStringTail()
    source = `off-chain jetton metadata ${uri}`
    if (!isSafeUrl(uri)) {
      throw fail(`Jetton metadata URI is not a public HTTPS URL: ${uri}`)
    }
    let json
    try {
      const res = await fetch(uri)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      json = await res.json()
    } catch (err) {
      throw fail(`Failed to fetch ${source}: ${err.message}`)
    }
    if (json === null || typeof json !== 'object' || !('decimals' in json)) {
      throw fail(`No "decimals" field in ${source}`)
    }
    raw = json.decimals
  } else {
    throw fail(`Unsupported jetton content prefix 0x${prefix.toString(16)}`)
  }

  // 3. Validate: a non-negative integer up to 255 ("0" is a legal precision)
  const text = String(raw).trim()
  if (!/^\d+$/.test(text)) {
    throw fail(`Invalid decimals "${raw}" in ${source}`)
  }
  const decimals = Number(text)
  if (decimals > 255) {
    throw fail(`Unreasonable decimals ${decimals} in ${source}`)
  }
  return decimals
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
    sendMode: SendMode.PAY_GAS_SEPARATELY,
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

  const coins = parseAmount(amount, jettonDecimals)

  const commonBodyCell = beginCell()
    .storeUint(0x0f8a7ea5, 32) // opcode for jetton transfer
    .storeUint(0, 64) // query id
    .storeCoins(coins) // jetton amount in base units (amount * 10^decimals)
    .storeAddress(Address.parse(receiver))
    .storeAddress(Address.parse(sender)) // response destination
    .storeBit(0) // no custom payload
    .storeCoins(toNano('0.01')) // forward amount - if > 0, will send notification message

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
    sendMode: SendMode.PAY_GAS_SEPARATELY,
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
  getJettonDecimals,
}
