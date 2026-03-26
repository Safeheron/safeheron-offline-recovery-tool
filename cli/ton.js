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

const { logReceipt, parseAmount } = require('./utils')

const isSafeUrl = url => {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') {
    return false
  }

  if (parsed.port && parsed.port !== '443') {
    return false
  }

  const hostname = parsed.hostname.toLowerCase()

  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]'
  ) {
    return false
  }

  // Check IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    if (
      a === 127 || // 127.0.0.0/8
      a === 10 || // 10.0.0.0/8
      a === 0 || // 0.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254) // 169.254.0.0/16 link-local
    ) {
      return false
    }
  }

  // Check IPv6 private ranges (bracketed in URLs)
  if (hostname.startsWith('[')) {
    const ipv6 = hostname.slice(1, -1).toLowerCase()
    if (
      ipv6 === '::1' ||
      ipv6.startsWith('fc') ||
      ipv6.startsWith('fd') ||
      ipv6.startsWith('fe80')
    ) {
      return false
    }
  }

  return true
}

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

  const pubHex = ed25519_get_pubkey_hex(privateKey)

  const client = new TonClient({
    endpoint: rpc || publicRPC[network],
  })

  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: Buffer.from(pubHex, 'hex'),
  })

  const contract = client.open(wallet)

  const seqno = await contract.getSeqno()

  const internalMessage = internal({
    value: amount,
    to: receiver,
    body: memo,
  })

  const body = await contract.createTransfer({
    seqno,
    signer: cell => mpcSigner(cell, privateKey),
    messages: [internalMessage],
  })

  const externalMessage = external({
    to: wallet.address,
    init: false,
    body,
  })

  const externalMessageCell = beginCell()
    .store(storeMessage(externalMessage))
    .endCell()

  const hash = externalMessageCell.hash().toString('hex')
  await client.sendFile(externalMessageCell.toBoc())

  const explorer =
    network === 'testnet'
      ? `https://testnet.tonviewer.com/transaction/${hash}`
      : `https://tonviewer.com/transaction/${hash}`

  logReceipt('TON', explorer)
}

const ftTransfer = async config => {
  const { amount, receiver, network, privateKey, rpc, ftoken, memo } = config

  const pubHex = ed25519_get_pubkey_hex(privateKey)

  const client = new TonClient({
    endpoint: rpc || publicRPC[network],
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

  const externalMessage = external({
    to: wallet.address,
    init: false,
    body,
  })

  const externalMessageCell = beginCell()
    .store(storeMessage(externalMessage))
    .endCell()
  const signedTransaction = externalMessageCell.toBoc()

  const hash = externalMessageCell.hash().toString('hex')
  await client.sendFile(signedTransaction)

  const explorer =
    network === 'testnet'
      ? `https://testnet.tonviewer.com/transaction/${hash}`
      : `https://tonviewer.com/transaction/${hash}`

  logReceipt('TON', explorer)
}

const handleException = err => {
  console.log(err)
}

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
