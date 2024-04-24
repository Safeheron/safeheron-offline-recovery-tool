import { PublicKey } from '@solana/web3.js'

function derivedAddress(publicKey: string) {
  return [new PublicKey(Buffer.from(publicKey, 'hex')).toBase58()]
}

export default { derivedAddress }
