import { sha3_256 as sha3Hash } from '@noble/hashes/sha3'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

function derivedAddress(publicKey: string) {
  const hash = sha3Hash.create()
  hash.update(hexToBytes(`${publicKey}00`))

  const result = hash.digest()

  return [`0x${bytesToHex(result)}`]
}

export default {
  derivedAddress,
}
