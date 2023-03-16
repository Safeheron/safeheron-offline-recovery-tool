import blake from 'blakejs'
import base32Encode from 'base32-encode'

function derivedAddress(uncompressedPubkey: string) {
  const payload = blake.blake2b(Buffer.from(uncompressedPubkey, 'hex'), undefined, 20)
  const checksum = blake.blake2b(Buffer.concat([Buffer.from('01', 'hex'), payload]), undefined, 4)
  let address = base32Encode(Buffer.concat([payload, checksum]), 'RFC4648', {
    padding: false,
  })
  address = address.toLowerCase()
  return [`f1${address}`, `t1${address}`]
}

export default {
  derivedAddress,
}
