import * as bitcoin from 'bitcoinjs-lib'

const BCHJS = require('@psf/bch-js')

const bchjs = new BCHJS()

function derivedAddress(pubkeyHex: string): string[] {
  const pubkey = Buffer.from(pubkeyHex, 'hex')
  const legacyAddr = bitcoin.payments.p2pkh({
    pubkey,
    network: bitcoin.networks.bitcoin,
  }).address
  const cashAddr = bchjs.Address.toCashAddress(legacyAddr)

  return [legacyAddr, cashAddr]
}

export default { derivedAddress }
