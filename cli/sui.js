/* eslint-disable no-console */
/* eslint-disable camelcase */

const {
  ed25519_sign,
  ed25519_get_pubkey_hex,
} = require('@safeheron/master-key-derive')
const BigNumber = require('bignumber.js')

const { parseAmount, logReceipt } = require('./utils')
const { validateCustomRpcUrl } = require('./rpc')

const SUI_ADDRESS_LENGTH = 32 // 32 bytes = 64 hex chars

// Sui Foundation disabled JSON-RPC on public full nodes in July 2026; the
// full node protocol is now gRPC (served over gRPC-Web on the same host).
const DEFAULT_GRPC_URLS = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
}

/**
 * @mysten/sui v2 is ESM-only while the CLI is CommonJS, so the SDK is loaded
 * lazily via dynamic import. The result is cached after the first call.
 */
let sdkPromise = null
const loadSdk = () => {
  if (!sdkPromise) {
    // The imports are awaited one after another on purpose: firing them
    // concurrently (Promise.all) trips Jest's ESM loader with
    // "request for '../bcs/index.mjs' is not in cache".
    // eslint-plugin-import's resolver does not understand package `exports`
    // subpaths, hence the per-line disables.
    sdkPromise = (async () => {
      // eslint-disable-next-line import/no-unresolved
      const grpc = await import('@mysten/sui/grpc')
      // eslint-disable-next-line import/no-unresolved
      const transactions = await import('@mysten/sui/transactions')
      // eslint-disable-next-line import/no-unresolved
      const cryptography = await import('@mysten/sui/cryptography')
      // eslint-disable-next-line import/no-unresolved
      const ed25519 = await import('@mysten/sui/keypairs/ed25519')
      return [grpc, transactions, cryptography, ed25519]
    })().then(([grpc, transactions, cryptography, ed25519]) => {
      class MPCSigner extends cryptography.Signer {
        constructor(privateKey) {
          super()
          const pubHex = ed25519_get_pubkey_hex(privateKey)
          const publicKey = Buffer.from(pubHex, 'hex')
          this.publicKey = new ed25519.Ed25519PublicKey(publicKey)
          this.privateKey = privateKey
        }

        getKeyScheme() {
          return 'ED25519'
        }

        getPublicKey() {
          return this.publicKey
        }

        async sign(bytes) {
          const sigHex = await ed25519_sign(this.privateKey, bytes)
          return Buffer.from(sigHex, 'hex')
        }
      }

      return {
        SuiGrpcClient: grpc.SuiGrpcClient,
        Transaction: transactions.Transaction,
        MPCSigner,
      }
    }).catch(err => {
      // Do not cache a failed load so a retry in the same process can succeed.
      sdkPromise = null
      throw err
    })
  }
  return sdkPromise
}

/**
 * Validate a Sui address: must be 0x-prefixed, exactly 64 hex chars (32 bytes).
 * Rejects short addresses to prevent the SDK from silently zero-padding.
 */
function validateSuiAddress(address) {
  if (typeof address !== 'string' || !address.startsWith('0x')) {
    throw new Error(`Invalid Sui address: must start with 0x. Got: ${address}`)
  }
  const hex = address.slice(2)
  if (hex.length !== SUI_ADDRESS_LENGTH * 2) {
    throw new Error(
      `Invalid Sui address: expected ${SUI_ADDRESS_LENGTH * 2} hex chars after 0x, got ${hex.length}. Address: ${address}`
    )
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid Sui address: contains non-hex characters. Address: ${address}`)
  }
}

const getClient = (SuiGrpcClient, network, rpc) => {
  const baseUrl = validateCustomRpcUrl(rpc) || DEFAULT_GRPC_URLS[network]
  if (!baseUrl) {
    throw new Error(`Unsupported Sui network: ${network}`)
  }
  return new SuiGrpcClient({ network, baseUrl })
}

/**
 * Execute a signed transaction and return its digest, failing loudly if the
 * chain reports an execution error instead of printing a receipt for a
 * transaction that did not do what the user asked.
 */
const executeAndVerify = async (client, tx, signer) => {
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
  })
  // v2 returns a discriminated union: { $kind: 'Transaction' } on success,
  // { $kind: 'FailedTransaction' } when the chain executed it but it aborted.
  if (result.$kind === 'FailedTransaction') {
    const failed = result.FailedTransaction
    const reason =
      failed.status?.error?.message || JSON.stringify(failed.status?.error)
    throw new Error(
      `Transaction ${failed.digest} failed on-chain: ${reason}`
    )
  }
  if (result.$kind !== 'Transaction' || !result.Transaction?.digest) {
    throw new Error(
      `Unexpected execution result from node: ${JSON.stringify(result).slice(0, 300)}`
    )
  }
  return result.Transaction.digest
}

const transfer = async config => {
  const { amount, receiver, network, privateKey, rpc } = config
  validateSuiAddress(receiver)
  const { SuiGrpcClient, Transaction, MPCSigner } = await loadSdk()
  const client = getClient(SuiGrpcClient, network, rpc)
  const signer = new MPCSigner(privateKey)
  const tx = new Transaction()
  const [coin] = tx.splitCoins(tx.gas, [
    tx.pure.u64(parseAmount(amount, 9).toFixed(0)),
  ])
  tx.transferObjects([coin], receiver)
  const digest = await executeAndVerify(client, tx, signer)
  const explorer = `https://suiscan.xyz/${network}/tx/${digest}`
  logReceipt('SUI', explorer)
}

const ftTransfer = async config => {
  const { amount, receiver, network, privateKey, ftoken, rpc } = config
  validateSuiAddress(receiver)

  const { SuiGrpcClient, Transaction, MPCSigner } = await loadSdk()
  const client = getClient(SuiGrpcClient, network, rpc)
  const signer = new MPCSigner(privateKey)
  const [coinMetadata, objects] = await Promise.all([
    getCoinMetadata(client, ftoken),
    getTargetCoinObjects(client, ftoken, signer.toSuiAddress()),
  ])
  const bigIntAmount = parseAmount(amount, coinMetadata.decimals)
  const len = objects.length
  if (len === 0) {
    throw new Error('Insufficient balance')
  }

  const tx = new Transaction()

  let bigIntBalance = new BigNumber(objects[0].balance)

  const primaryCoinInput = tx.object(objects[0].objectId)

  if (bigIntBalance.isLessThan(bigIntAmount)) {
    let idx = 1
    while (bigIntBalance.isLessThan(bigIntAmount) && idx < len) {
      bigIntBalance = bigIntBalance.plus(objects[idx].balance)
      idx += 1
    }
    if (bigIntBalance.isLessThan(bigIntAmount)) {
      throw new Error('Insufficient balance')
    }

    tx.mergeCoins(
      primaryCoinInput,
      objects.slice(1, idx).map(coin => tx.object(coin.objectId))
    )
  }

  const coin = tx.splitCoins(primaryCoinInput, [
    tx.pure.u64(bigIntAmount.toFixed(0)),
  ])
  tx.transferObjects([coin], receiver)
  const digest = await executeAndVerify(client, tx, signer)
  const explorer = `https://suiscan.xyz/${network}/tx/${digest}`
  logReceipt('SUI', explorer)
}

const handleException = err => err?.message

/**
 * Collect every coin object of `ftoken` owned by `owner`, following the
 * gRPC cursor so a wallet with many small coins is not truncated to one page.
 */
const getTargetCoinObjects = async (client, ftoken, owner) => {
  const objects = []
  let cursor = null
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await client.listCoins({
      owner,
      coinType: ftoken,
      cursor,
    })
    objects.push(...res.objects)
    cursor = res.hasNextPage ? res.cursor : null
  } while (cursor)

  // Largest balance first so the fewest coin objects need merging.
  return objects.sort((a, b) => {
    const diff = BigInt(b.balance) - BigInt(a.balance)
    if (diff === 0n) return 0
    return diff > 0n ? 1 : -1
  })
}

const getCoinMetadata = async (client, ftoken) => {
  const { coinMetadata } = await client.getCoinMetadata({
    coinType: ftoken,
  })
  if (!coinMetadata) {
    throw new Error(
      `Failed to get coin metadata for ${ftoken}. The CoinMetadata object may not be shared or frozen.`
    )
  }
  return coinMetadata
}

module.exports = {
  transfer,
  ftTransfer,
  handleException,
}
