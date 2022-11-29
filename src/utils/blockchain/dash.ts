import * as bitcoin from 'bitcoinjs-lib'

function derivedAddress(pubkeyHex: string): string[] {
  const pubkeyBuffer = Buffer.from(pubkeyHex, 'hex')
  const pubkeyHash160 = bitcoin.crypto.hash160(pubkeyBuffer)

  const mainnetAddr = bitcoin.address.toBase58Check(pubkeyHash160, 0x4c)
  const testnetAddr = bitcoin.address.toBase58Check(pubkeyHash160, 0x8c)

  return [mainnetAddr, testnetAddr]
}

export default { derivedAddress }
