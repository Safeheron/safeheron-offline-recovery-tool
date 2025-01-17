import { Buffer } from 'buffer'

import blake from 'blakejs'
import base32Encode from 'base32-encode'

function formatPrivateKey(hexPrivateKey: string) {
  const base64Priv = Buffer.from(hexPrivateKey, 'hex').toString('base64')

  const typedPriv = {
    Type: 'secp256k1',
    PrivateKey: base64Priv
  }
  const hexTypedPriv = Buffer.from(JSON.stringify(typedPriv)).toString('hex')

  return hexTypedPriv
}

function derivedAddress(uncompressedPubkey: string) {
  // @ts-ignore
  const payload = blake.blake2b(Buffer.from(uncompressedPubkey, 'hex'), undefined, 20)
  // @ts-ignore
  const checksum = blake.blake2b(Buffer.concat([Buffer.from('01', 'hex'), payload]), undefined, 4)
  let address = base32Encode(Buffer.concat([payload, checksum]), 'RFC4648', {
    padding: false,
  })
  let addressWithPadding = base32Encode(Buffer.concat([payload, checksum]), 'RFC4648', {
    padding: true,
  })
  address = address.toLowerCase()
  addressWithPadding = addressWithPadding.toLowerCase()
  return [`f1${address}`, `t1${address}`, `f1${addressWithPadding}`, `t1${addressWithPadding}`]
}

export default {
  formatPrivateKey,
  derivedAddress,
}
