import bs58check from 'bs58check'
import { keccak_256 as keccak256 } from '@noble/hashes/sha3'

function derivedAddress(uncompressedPubkey: string): string[] {
  const sub = uncompressedPubkey.slice(2)

  const pubKeyhash = `41${keccak256Hex(sub).slice(-40)}`

  const address = bs58check.encode(Buffer.from(pubKeyhash, 'hex'))

  return [address]
}

function keccak256Hex(hex: string) {
  const payload = new Uint8Array(Buffer.from(hex, 'hex'))
  return Buffer.from(keccak256(payload)).toString('hex')
}

export default {
  derivedAddress,
}
