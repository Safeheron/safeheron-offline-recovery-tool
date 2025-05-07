import * as bitcoin from 'bitcoinjs-lib'
import wif from 'wif'

function derivedAddress(pubkeyHex: string) {
  const p2pkhTestnet = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(pubkeyHex, 'hex'),
    network: {
      ...bitcoin.networks.testnet,
      pubKeyHash: 0x71,
    },
  }).address || ''

  const p2pkhMainnet = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(pubkeyHex, 'hex'),
    network: {
      ...bitcoin.networks.bitcoin,
      pubKeyHash: 0x1E,
    },
  }).address || ''

  return [p2pkhTestnet, p2pkhMainnet]
}

function wifEncodePrivateKey(privateKeyHex: string, isMainnet: boolean) {
  const privateKey = Buffer.from(privateKeyHex.padStart(64, '0'), 'hex')

  const mainnetVersion = 0x9e
  const testnetVersion = 0xf1

  return wif.encode(
    isMainnet ? mainnetVersion : testnetVersion,
    privateKey,
    true
  )
}

export default { derivedAddress, wifEncodePrivateKey }
