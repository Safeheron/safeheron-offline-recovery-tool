import wif from 'wif'
import * as bitcoin from 'bitcoinjs-lib'

const WIF_PREFIX_MAINNET = 0x80
const WIF_PREFIX_TESTNET = 0xef

function wifEncodePrivateKey(originPrivateKeyStr: string, isMainnet: boolean): string {
  const privateKeyBuffer = Buffer.from(originPrivateKeyStr, 'hex')
  if (privateKeyBuffer.length !== 32) {
    throw new Error('Invalid private key')
  }
  return wif.encode(
    isMainnet ? WIF_PREFIX_MAINNET : WIF_PREFIX_TESTNET,
    privateKeyBuffer,
    true
  )
}

function derivedAddress(pubkeyHex: string): string[] {
  const pubkey = Buffer.from(pubkeyHex, 'hex')
  const addr1 = bitcoin.payments.p2wpkh({
    pubkey,
    network: bitcoin.networks.bitcoin,
  }).address || ''

  const addr2 = bitcoin.payments.p2wpkh({
    pubkey,
    network: bitcoin.networks.testnet,
  }).address || ''

  const addr3 = bitcoin.payments.p2pkh({
    pubkey,
    network: bitcoin.networks.testnet,
  }).address || ''
  const addr4 = bitcoin.payments.p2pkh({
    pubkey,
    network: bitcoin.networks.bitcoin,
  }).address || ''
  return [addr1, addr2, addr3, addr4]
}

export default {
  wifEncodePrivateKey,
  derivedAddress,
}
