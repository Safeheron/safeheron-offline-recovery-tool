import * as bitcoin from 'bitcoinjs-lib'
import bs58check from 'bs58check'

// XRP classic addresses use standard base58check (version byte 0x00,
// double-SHA256 checksum) but with a permuted alphabet, so encode with
// bs58check and translate characters from the Bitcoin alphabet.
//
// Alphabet references:
// - Bitcoin: https://en.bitcoin.it/wiki/Base58Check_encoding
// - XRP: https://xrpl.org/docs/references/protocol/data-types/base58-encodings
const BTC_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const XRP_ALPHABET =
  'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'

// XRPL libraries (xrpl.js / ripple-keypairs) expect private keys with a
// 1-byte algorithm prefix: 0x00 for secp256k1, i.e. 66 hex chars.
function formatPrivateKey(hexPrivateKey: string): string {
  return `00${hexPrivateKey}`
}

function derivedAddress(compressedPubkeyHex: string): string[] {
  const pubkeyBuffer = Buffer.from(compressedPubkeyHex, 'hex')
  const accountId = bitcoin.crypto.hash160(pubkeyBuffer)
  const payload = Buffer.concat([Buffer.from([0x00]), accountId])

  const address = bs58check
    .encode(payload)
    .split('')
    .map(c => XRP_ALPHABET[BTC_ALPHABET.indexOf(c)])
    .join('')

  return [address]
}

export default { derivedAddress, formatPrivateKey }
