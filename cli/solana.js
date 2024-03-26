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
} = require('@solana/web3.js')
const {
  createTransferInstruction,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  TokenInvalidMintError,
  TokenInvalidOwnerError,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token')

const { logReceipt } = require('./utils')

const solanaLogReceipt = explorer => {
  logReceipt('Solana', explorer)
  console.log('\x1b[33m%s', `
Note: This does not mean that the transfer transaction was successfully confirmed. 
Solana may drop transactions when the blocknetwork is congested. 
If you never see the transaction information on the blockexplorer, please retry.
  `)
}

const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
)

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
)

const getOrCreateAssociatedTokenAccount = async (
  connection,
  payer,
  mint,
  owner,
  allowOwnerOffCurve,
  commitment,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
) => {
  const associatedToken = getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve || false,
    programId,
    associatedTokenProgramId
  )
  let account
  try {
    account = await getAccount(
      connection,
      associatedToken,
      commitment,
      programId
    )
  } catch (error) {
    if (
      error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountOwnerError
    ) {
      try {
        const instructions = [
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            associatedToken,
            owner,
            mint,
            programId,
            associatedTokenProgramId
          ),
        ]

        const latestBlockhash = await connection.getLatestBlockhash('confirmed')
        const messageV0 = new TransactionMessage({
          payerKey: payer.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions,
        }).compileToV0Message()

        const transaction = new CustomVersionedTransaction(messageV0)
        await transaction.sign([payer])
        const txid = await connection.sendTransaction(transaction, {
          maxRetries: 5,
        })
        await connection.confirmTransaction({
          signature: txid,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        })
      } catch (err) {
        // ...
      }
      account = await getAccount(
        connection,
        associatedToken,
        commitment,
        programId
      )
    } else {
      throw error
    }
  }

  if (!account.mint.equals(mint)) throw new TokenInvalidMintError()
  if (!account.owner.equals(owner)) throw new TokenInvalidOwnerError()

  return account
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

const createConnection = (network, rpc) => {
  let connection
  if (rpc) {
    connection = new Connection(rpc)
  } else {
    connection = new Connection(
      network === 'mainnet'
        ? clusterApiUrl('mainnet-beta')
        : clusterApiUrl('testnet')
    )
  }
  return connection
}

const transfer = async config => {
  const { amount, receiver, network, privateKey, rpc } = config

  const connection = createConnection(network, rpc)

  const signer = new MPCSigner(privateKey)

  const instructions = [
    SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: new PublicKey(receiver),
      lamports: Number(amount) * LAMPORTS_PER_SOL,
    }),
  ]
  const latestBlockhash = await connection.getLatestBlockhash('finalized')
  const messageV0 = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message()
  const transaction = new CustomVersionedTransaction(messageV0)
  await transaction.sign([signer])
  const txid = await connection.sendTransaction(transaction, { maxRetries: 5 })
  const explorer = `https://explorer.solana.com/tx/${txid}${
    network === 'mainnet' ? '' : '?cluster=devnet'
  }`
  solanaLogReceipt(explorer)
}

const ftTransfer = async config => {
  const { amount, receiver, network, privateKey, rpc, ftoken } = config
  const connection = createConnection(network, rpc)

  const mintAddress = new PublicKey(ftoken)

  const info = await connection.getParsedAccountInfo(mintAddress)
  const decimals = info.value?.data?.parsed?.info?.decimals
  if (!decimals) {
    throw new Error('Failed to get token currency precision')
  }

  const signer = new MPCSigner(privateKey)

  const sourceAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    signer,
    mintAddress,
    signer.publicKey
  )

  const destinationAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    signer,
    mintAddress,
    new PublicKey(receiver)
  )

  const instructions = [
    createTransferInstruction(
      sourceAccount.address,
      destinationAccount.address,
      signer.publicKey,
      amount * 10 ** decimals
    ),
  ]
  const latestBlockhash = await connection.getLatestBlockhash('finalized')
  const messageV0 = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message()
  const transaction = new CustomVersionedTransaction(messageV0)
  await transaction.sign([signer])
  const txid = await connection.sendTransaction(transaction, { maxRetries: 10 })
  const explorer = `https://explorer.solana.com/tx/${txid}${
    network === 'mainnet' ? '' : '?cluster=devnet'
  }`
  solanaLogReceipt(explorer)
}

const handleException = err => {
  console.log(err)
}

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
