import { blake2b } from 'blakejs'

const PUBLIC_KEY_SIZE = 32
const SUI_ADDRESS_LENGTH = 32
const SIGNATURE_SCHEME_TO_FLAG = {
  ED25519: 0x00,
  Secp256k1: 0x01,
}

export function normalizeSuiAddress(value: string, forceAdd0x = false) {
  let address = value.toLowerCase()
  if (!forceAdd0x && address.startsWith('0x')) {
    address = address.slice(2)
  }
  return `0x${address.padStart(SUI_ADDRESS_LENGTH * 2, '0')}`
}

function hexToUint8Array(hex: string): Uint8Array {
  let val = hex
  if (hex.startsWith('0x')) {
    val = hex.substring(2)
  }
  if (hex.length % 2 !== 0) {
    val = `0${hex}`
  }
  return new Uint8Array(
    val.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
  )
}

function uint8ArrayToHex(array: Uint8Array): string {
  return array.reduce(
    (str, byte) => str + byte.toString(16).padStart(2, '0'),
    ''
  )
}

export function derivedAddress(publicKey: string) {
  const tmp = new Uint8Array(PUBLIC_KEY_SIZE + 1)
  tmp.set([SIGNATURE_SCHEME_TO_FLAG.ED25519])
  tmp.set(hexToUint8Array(publicKey), 1)
  return [normalizeSuiAddress(
    uint8ArrayToHex(blake2b(tmp, undefined, 32)).slice(
      0,
      SUI_ADDRESS_LENGTH * 2
    )
  )]
}

export default { derivedAddress }
