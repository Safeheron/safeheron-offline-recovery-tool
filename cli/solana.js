/* eslint-disable no-await-in-loop */
/* eslint-disable no-underscore-dangle */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-console */
/* eslint-disable camelcase */
const {
  ed25519_get_pubkey_hex,
  ed25519_sign,
} = require('@safeheron/master-key-derive')
const {
  Connection,
  SystemProgram,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} = require('@solana/web3.js')
const {
  createTransferInstruction,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token')
const BigNumber = require('bignumber.js')

const { parseAmount } = require('./utils')

const logExplore = explorer => {
  console.log(
    '--------------------------------------------------------------------------------------------'
  )
  console.log('Open link below to see transaction in Solana explorer')
  console.log(explorer)
  console.log(
    '--------------------------------------------------------------------------------------------'
  )
}

const logReceiptSuccess = explorer => {
  console.log('Transaction sent and confirmed successfully!')
  logExplore(explorer)
}

const logReceiptFail = explorer => {
  console.log('\x1b[31m%s\x1b[0m', 'Transaction confirmation timeout. Please open the blockexplorer to see the transaction information!')
  console.log('\x1b[33m%s\x1b[0m', `
Note: Solana may drop transactions when the blocknetwork is congested. 
If you are unable to see the transaction information on the blockexplorer for a long time (90 seconds), the transaction may have been dropped, try sending the transaction again using the CLI.
  `)
  logExplore(explorer)
}

class CustomVersionedTransaction extends VersionedTransaction {
  async sign(signers) {
    const messageData = this.message.serialize()
    const signerPubkeys = this.message.staticAccountKeys.slice(
      0,
      this.message.header.numRequiredSignatures
    )
    for (const signer of signers) {
      const signerIndex = signerPubkeys.findIndex(pubkey =>
        pubkey.equals(signer.publicKey)
      )
      this.signatures[signerIndex] = await signer.sign(messageData)
    }
  }
}

class MPCSigner {
  constructor(privateKey) {
    const pubHex = ed25519_get_pubkey_hex(privateKey)
    this.publicKey = new PublicKey(new PublicKey(Buffer.from(pubHex, 'hex')))
    this.privateKey = privateKey
  }

  async sign(message) {
    const signatureHex = await ed25519_sign(this.privateKey, message)
    return new Uint8Array(Buffer.from(signatureHex, 'hex'))
  }
}

const createConnectionCluster = (network, rpc) => {
  let endpoints = [rpc, clusterApiUrl('testnet')]
  if (network === 'mainnet') {
    endpoints = [
      rpc,
      clusterApiUrl('mainnet-beta'),
      'https://mainnet.helius-rpc.com/?api-key=efc82eb1-8237-4c46-b915-dee916dd3bd7',
      'https://solana-mainnet.g.alchemy.com/v2/dZLUXuysijJ6qUzN0kX35ixbnfOO8qsj',
    ]
  }
  return endpoints.filter(Boolean).map(endpoint => new Connection(endpoint, 'confirmed'))
}

const sendTransactionByCluster = async (cluster, signer, instructions, network) => {
  const mainConnection = cluster[0]
  const latestBlockhash = await mainConnection.getLatestBlockhash()
  const messageV0 = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 100_000,
      }),
      ...instructions,
    ],
  }).compileToV0Message()
  const transaction = new CustomVersionedTransaction(messageV0)
  await transaction.sign([signer])

  const ps = cluster.map(connection => connection.sendTransaction(transaction, { maxRetries: 30 }))
  const results = await Promise.allSettled(ps)

  const resultFulfilled = results.find(result => result.status === 'fulfilled')
  if (!resultFulfilled) {
    throw results[0]
  }

  const txid = resultFulfilled.value

  const confirmation = await mainConnection.confirmTransaction({
    signature: txid,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    blockhash: latestBlockhash.blockhash,
  })

  const explorer = `https://explorer.solana.com/tx/${txid}${
    network === 'mainnet' ? '' : '?cluster=testnet'
  }`
  if (!confirmation.value.err) {
    logReceiptSuccess(explorer)
  } else {
    logReceiptFail(explorer)
  }
}

const transfer = async config => {
  const { amount, receiver, network, privateKey, rpc } = config

  const cluster = createConnectionCluster(network, rpc)

  const signer = new MPCSigner(privateKey)

  const instructions = [
    SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: new PublicKey(receiver),
      lamports: BigInt(new BigNumber(amount).multipliedBy(LAMPORTS_PER_SOL).toString()),
    }),
  ]

  await sendTransactionByCluster(cluster, signer, instructions, network)
}

const ftTransfer = async config => {
  const { amount, receiver, network, privateKey, rpc, ftoken } = config
  const cluster = createConnectionCluster(network, rpc)
  const mainConnection = cluster[0]

  const mintAddress = new PublicKey(ftoken)

  const info = await mainConnection.getParsedAccountInfo(mintAddress)
  const decimals = info.value?.data?.parsed?.info?.decimals
  if (!decimals) {
    throw new Error('Failed to get token currency precision')
  }

  const signer = new MPCSigner(privateKey)

  const sourceAccountAddress = getAssociatedTokenAddressSync(
    mintAddress,
    signer.publicKey,
  )

  const destinationAccountAddress = getAssociatedTokenAddressSync(
    mintAddress,
    new PublicKey(receiver),
  )

  const instructions = []
  try {
    await getAccount(
      mainConnection,
      destinationAccountAddress
    )
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError || err instanceof TokenInvalidAccountOwnerError) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          signer.publicKey,
          destinationAccountAddress,
          new PublicKey(receiver),
          mintAddress,
        )
      )
    } else {
      throw err
    }
  }

  instructions.push(
    createTransferInstruction(
      sourceAccountAddress,
      destinationAccountAddress,
      signer.publicKey,
      parseAmount(amount, decimals),
    ),
  )
  await sendTransactionByCluster(cluster, signer, instructions, network)
}

const handleException = err => {
  console.log(err)
}

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
