/* eslint-disable camelcase */
const {
  ed25519_get_pubkey_hex,
  ed25519_sign,
} = require('@safeheron/master-key-derive')
const {
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

const { logReceipt, startTaskPolling, parseAmount } = require('./utils')

const onTransaction = (client, sender, receiver, amount, network) =>
  startTaskPolling(
    async () => {
      const txs = await client.getTransactions(receiver, { limit: 3 })
      const targetTx = txs.find(tx => {
        const src = tx?.inMessage?.info?.src?.toString?.()
        const coins = tx?.inMessage?.info?.value?.coins
        return src === sender && coins === toNano(amount)
      })
      if (targetTx) {
        const hash = targetTx.hash().toString('hex')
        const explorer =
          network === 'testnet'
            ? `https://testnet.tonviewer.com/transaction/${hash}`
            : `https://tonviewer.com/transaction/${hash}`
        logReceipt('TON', explorer)
        return true
      }
      return false
    },
    5,
    60
  )

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

// const getJettonDecimals = async (jettonMasterAddress, client) => {
//   const response = await client.runMethod(
//     Address.parse(jettonMasterAddress),
//     'get_jetton_data'
//   )

//   return response.stack.readNumber()
// }

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

  const transferV4Cell = await contract.createTransfer({
    seqno,
    signer: cell => mpcSigner(cell, privateKey),
    messages: [internalMessage],
  })

  await contract.send(transferV4Cell)

  const sender = wallet.address.toString()

  return onTransaction(client, sender, receiver, amount, network)
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

  const jettonWalletAddress = await getUserJettonWalletAddress(sender, ftoken, client)

  // TODO: 从链上获取 Jetton 精度
  // const jettonDecimals = await getJettonDecimals(ftoken, client)

  const commonBodyCell = beginCell()
    .storeUint(0x0f8a7ea5, 32) // opcode for jetton transfer
    .storeUint(0, 64) // query id
    .storeCoins(parseAmount(amount, 6)) // jetton amount, amount * 10^9, note: usdt is 10^6
    .storeAddress(Address.parse(receiver))
    .storeAddress(Address.parse(sender)) // response destination
    .storeBit(0) // no custom payload
    .storeCoins(0) // forward amount - if > 0, will send notification message

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
