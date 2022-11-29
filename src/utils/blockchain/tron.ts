import bs58check from 'bs58check'
import CryptoJS from 'crypto-js'

function derivedAddress(uncompressedPubkey: string): string[] {
  const sub = uncompressedPubkey.slice(2)

  const pubKeyhash = `41${sha3(sub, 256, { bytes: true })
    .toString()
    .slice(-40)}`

  const address = bs58check.encode(Buffer.from(pubKeyhash, 'hex'))

  return [address]
}

function sha3(data: string | CryptoJS.lib.WordArray, length = 256, { bytes = false } = {}) {
  let payload = data
  if (bytes && typeof data === 'string') {
    payload = CryptoJS.enc.Hex.parse(data)
  }
  return CryptoJS.SHA3(payload, { outputLength: length })
}

export default {
  derivedAddress,
}
