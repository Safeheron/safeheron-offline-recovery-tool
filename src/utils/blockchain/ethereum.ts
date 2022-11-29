import { ethers } from 'ethers'

function derivedAddress(pubkeyHex: string): string[] {
  let payload = pubkeyHex
  if (!pubkeyHex.startsWith('0x')) {
    payload = `0x${pubkeyHex}`
  }
  const address = ethers.utils.computeAddress(payload)
  return [address]
}

export default {
  derivedAddress,
}
