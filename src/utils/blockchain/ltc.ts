import wif from 'wif'
import * as bitcoin from 'bitcoinjs-lib'

function derivedAddress(pubkeyHex: string) {
  const p2pkhTestnet = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(pubkeyHex, 'hex'),
    network: {
      ...bitcoin.networks.testnet,
      pubKeyHash: 0x6f,
    }
  }).address || ''

  const p2wpkhTestnet = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(pubkeyHex, 'hex'),
    network: {
      ...bitcoin.networks.testnet,
      bech32: 'tltc',
    },
  }).address || ''

  const p2pkhMainnet = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(pubkeyHex, 'hex'),
    network: {
      ...bitcoin.networks.bitcoin,
      pubKeyHash: 0x30,
    }
  }).address || ''

  const p2wpkhMainnet = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(pubkeyHex, 'hex'),
    network: {
      ...bitcoin.networks.bitcoin,
      bech32: 'ltc',
    },
  }).address || ''

  return [p2pkhTestnet, p2wpkhTestnet, p2pkhMainnet, p2wpkhMainnet]
}

function wifEncodePrivateKey(privateKeyHex: string, isMainnet: boolean) {
  const privateKey = Buffer.from(privateKeyHex.padStart(64, '0'), 'hex')

  const mainnetVersion = 0xb0
  const testnetVersion = 0xef

  return wif.encode(
    isMainnet ? mainnetVersion : testnetVersion,
    privateKey,
    true
  )
}

export default { derivedAddress, wifEncodePrivateKey }
