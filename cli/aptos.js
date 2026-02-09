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
  generateSigningMessageForTransaction
} = require('@aptos-labs/ts-sdk')
const BigNumber = require('bignumber.js')
const { sha3_256: sha3Hash } = require('@noble/hashes/sha3')
const { bytesToHex, hexToBytes } = require('@noble/hashes/utils')

const { logReceipt } = require('./utils')

const formatOctasToAPT = (octas) => {
  const octasBigInt = typeof octas === 'bigint' ? octas : BigInt(octas.toString())
  const apt = new BigNumber(octasBigInt.toString()).dividedBy(10 ** 8).toFixed(8)
  return apt
}

class CustomAptos extends Aptos {
  async sign(args) {
    const { signer, transaction } = args

    const message = generateSigningMessageForTransaction(transaction)

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

  const accountAPTAmount = await aptos.getAccountAPTAmount({
    accountAddress: signer.address
  })

  const transferAmount = BigInt(new BigNumber(10 ** 8).multipliedBy(amount).toString())

  const tempTransaction = await aptos.transferCoinTransaction({
    sender: signer.address,
    recipient: receiver,
    amount: transferAmount,
  })

  const { estimatedMaxGasAmount, estimatedGasPrice } = await estimateGasAndCheckBalance({
    aptos,
    signer,
    tempTransaction,
    accountBalance: accountAPTAmount,
    transferAmount,
  })

  const transaction = await aptos.transferCoinTransaction({
    sender: signer.address,
    recipient: receiver,
    amount: transferAmount,
    options: {
      maxGasAmount: Number(estimatedMaxGasAmount),
      gasUnitPrice: Number(estimatedGasPrice),
    }
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

const ftTransfer = async config => {
  const { amount, receiver, network, privateKey, rpc, ftoken } = config

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

  const accountAPTAmount = await aptos.getAccountAPTAmount({
    accountAddress: signer.address
  })

  let decimals
  if (isCoin(ftoken)) {
    decimals = await getCoinDecimals(aptos, ftoken)
  } else {
    decimals = await getFATokenDecimals(aptos, ftoken)
  }

  const transferAmount = BigInt(new BigNumber(10).pow(decimals).multipliedBy(amount).toString())

  let tempTransaction
  if (isCoin(ftoken)) {
    tempTransaction = await aptos.transferCoinTransaction({
      sender: signer.address,
      recipient: receiver,
      amount: transferAmount,
      coinType: ftoken,
    })
  } else {
    tempTransaction = await aptos.transferFungibleAsset({
      amount: transferAmount,
      fungibleAssetMetadataAddress: ftoken,
      recipient: receiver,
      sender: {
        accountAddress: signer.address,
      },
    })
  }

  const { estimatedMaxGasAmount, estimatedGasPrice } = await estimateGasAndCheckBalance({
    aptos,
    signer,
    tempTransaction,
    accountBalance: accountAPTAmount,
  })

  let transaction
  if (isCoin(ftoken)) {
    transaction = await aptos.transferCoinTransaction({
      sender: signer.address,
      recipient: receiver,
      amount: transferAmount,
      coinType: ftoken,
      options: {
        maxGasAmount: Number(estimatedMaxGasAmount),
        gasUnitPrice: Number(estimatedGasPrice),
      }
    })
  } else {
    transaction = await aptos.transferFungibleAsset({
      amount: transferAmount,
      fungibleAssetMetadataAddress: ftoken,
      recipient: receiver,
      sender: {
        accountAddress: signer.address,
      },
      options: {
        maxGasAmount: Number(estimatedMaxGasAmount),
        gasUnitPrice: Number(estimatedGasPrice),
      }
    })
  }

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

const handleException = err => {
  console.log(err)
}

const getCoinDecimals = async (aptos, ftoken) => {
  const [creatorAddress] = ftoken.split('::')

  const coinInfo = await aptos.getAccountResource({
    accountAddress: creatorAddress,
    resourceType: `0x1::coin::CoinInfo<${ftoken}>`,
  })
  return coinInfo.decimals
}

const getFATokenDecimals = async (aptos, ftoken) => {
  const metadata = await aptos.getAccountResource({
    accountAddress: ftoken,
    resourceType: '0x1::fungible_asset::Metadata',
  })
  return metadata.decimals
}

const isCoin = ftoken => {
  return ftoken?.split('::')?.length === 3
}

const estimateGasAndCheckBalance = async ({ aptos, signer, tempTransaction, accountBalance, transferAmount }) => {
  const [simulationResult] = await aptos.transaction.simulate.simple({
    signerPublicKey: signer.publicKey,
    transaction: tempTransaction,
  })

  if (!simulationResult.success) {
    throw new Error(`Transaction simulation failed: ${simulationResult.vm_status}`)
  }

  const gasUsed = BigInt(simulationResult.gas_used.toString())
  const estimatedMaxGasAmount = BigInt(Math.ceil(Number(gasUsed) * 1.2))

  const gasEstimation = await aptos.getGasPriceEstimation()
  const estimatedGasPrice = BigInt(gasEstimation.gas_estimate)

  const maxFee = estimatedMaxGasAmount * estimatedGasPrice

  const balance = BigInt(accountBalance.toString())
  const requiredAmount = transferAmount ? transferAmount + maxFee : maxFee

  if (balance < requiredAmount) {
    const balanceAPT = formatOctasToAPT(balance)
    const requiredAPT = formatOctasToAPT(requiredAmount)
    const feeAPT = formatOctasToAPT(maxFee)

    if (transferAmount) {
      const transferAPT = formatOctasToAPT(transferAmount)
      throw new Error(
        `Insufficient balance: account balance ${balance.toString()} octas (${balanceAPT} APT), ` +
        `required ${requiredAmount.toString()} octas (${requiredAPT} APT), ` +
        `(transfer ${transferAmount.toString()} octas (${transferAPT} APT) + max fee ${maxFee.toString()} octas (${feeAPT} APT))`
      )
    } else {
      throw new Error(
        `Insufficient balance to pay transaction max fee: account APT balance ${balance.toString()} octas (${balanceAPT} APT), ` +
        `required ${maxFee.toString()} octas (${feeAPT} APT) for transaction max fee`
      )
    }
  }

  return { 
    estimatedMaxGasAmount, 
    estimatedGasPrice 
  }
}

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
