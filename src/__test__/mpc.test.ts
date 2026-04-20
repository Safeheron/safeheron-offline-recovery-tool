import { describe, expect, test } from '@jest/globals'

import { recoverHDKeyFromMnemonics, recoverDerivedCSV, createDeriveCache, ValidateAddressError, LRUMap } from '../utils/mpc'
import type { RawCSVRow } from '../utils/mpc'
import { padToLength } from '../utils/common'

const mnemonics = [
  'source pistol cable finish account glide aware escape extend guilt assist corn camera pen crash avocado economy betray blouse planet negative labor vote zoo',
  'vivid sadness color between damage chaos tobacco gasp gorilla divert where vintage income surprise only abstract decline shine clay push supply endorse luggage wild',
  'inherit wage uphold lion clog fire heart crash detect sad invest bonus entire immense begin youth perfect lawsuit announce sorry black kitchen item lucky'
]
const chaincode = '1d59b896d3878849efb1c5935866ff75b3db7c3e7e14b4d4d31f06761d121d47'
const recovery = [
  {
    path: 'm/44/666/0/0/0',
    algo: 'secp256k1',
    privateKey: '2c56bfe160a964acc8d70668b834eefba8e4e9246d51e2dac4a9c9de567d4711'
  },
  {
    path: 'm/44/666/1/0/0',
    algo: 'secp256k1',
    privateKey: 'fd9421d488352d44327597127d39adbaac5beeffc56695db1ca046e730bf8b4c'
  },
  {
    path: 'm/44/666/2/0/0',
    algo: 'secp256k1',
    privateKey: '6d6fe96e934f0fd0dfcfd7987c55e20a24b222f8918a4e5de01cb0a3ee03a99f'
  },
  {
    path: 'm/44/666/3/0/0',
    algo: 'ed25519',
    privateKey: '04c26c4bd03dcfaeb8c33b7db908f6aa95411a7e352a8e835686585fdf84cbf9'
  },
  {
    path: 'm/44/666/4/0/0',
    algo: 'ed25519',
    privateKey: '0ba412500f60bf5cf7b788c10a4230bf3fef9421d60eb3e5a710e972748231e8'
  },
  {
    path: 'm/44/666/5/0/0',
    algo: 'ed25519',
    privateKey: '09d561fc3f9996d12614daa30adfce5e278c69c9abca1fb9e7f45541f30c34b7'
  }
]

const mnemonicsV2 = [
  'turtle stone jacket logic canal thing project hub dash issue remove same beauty hospital finish brush pear hire follow dinner industry release general flock',
  'swim such enlist acoustic warm enrich weekend milk asthma pistol equip man whip hammer sponsor essence test token pudding ethics cliff light fine outdoor',
  'heavy suffer taste bag dawn furnace feed stuff shaft rally armor ginger urban anxiety split country antenna erase burst grass cricket cream broom sail'
]
const recoveryV2 = [
  {
    path: 'm/44/666/0/0/0',
    algo: 'secp256k1',
    privateKey: '4a2d52e8a7466e5b451c74944381ebcf92cf447f5ca76959a9850e18a342a4f3'
  },
  {
    path: 'm/44/666/1/0/0',
    algo: 'secp256k1',
    privateKey: 'ad284a7aae7ea805dd6fa86cd6e39296ad89c919958e2b77b36bace47e691ee8'
  },
  {
    path: 'm/44/666/2/0/0',
    algo: 'secp256k1',
    privateKey: '5d5a14e50e178aeb59bef2006ed2aa5778678ee5d042b2231f5b10d4b6f1a46b'
  },
  {
    path: 'm/44/666/3/0/0',
    algo: 'ed25519',
    privateKey: '070243ac1ae13e5861b5d58539d0bdafe0014aa3cd32a657cbf36c573cbac332'
  },
  {
    path: 'm/44/666/4/0/0',
    algo: 'ed25519',
    privateKey: '01046f634ba37ea1dd23a9b091688703206ab4573d0fd416d9cf8b6cac4b8b91'
  },
  {
    path: 'm/44/666/5/0/0',
    algo: 'ed25519',
    privateKey: '0ed9a62e23bd62ef10bcb6d64dfc053a79e9673ae4ab600923955b0077795065'
  }
]

describe('Recover HDkey from mnemonics', () => {
  test('have chaincode', () => {
    const {
      secp256k1,
      ed25519,
    } = recoverHDKeyFromMnemonics(mnemonics, chaincode)

    recovery.forEach(rItem => {
      const { algo } = rItem
      let childHDKey
      if (algo === 'secp256k1') {
        childHDKey = secp256k1.derive(rItem.path)
      } else {
        childHDKey = ed25519.derive(rItem.path)
      }
      const childPrivKeyHex = padToLength(childHDKey.privateKey.toString(16), 32)
      expect(childPrivKeyHex).toEqual(rItem.privateKey)
    })
  })
  test('no chaincode', () => {
    const {
      secp256k1,
      ed25519,
    } = recoverHDKeyFromMnemonics(mnemonicsV2)
    recoveryV2.forEach(rItem => {
      const { algo } = rItem
      let childHDKey
      if (algo === 'secp256k1') {
        childHDKey = secp256k1.derive(rItem.path)
      } else {
        childHDKey = ed25519.derive(rItem.path)
      }
      const childPrivKeyHex = padToLength(childHDKey.privateKey.toString(16), 32)
      expect(childPrivKeyHex).toEqual(rItem.privateKey)
    })
  })
})

describe('createDeriveCache', () => {
  test('returns object with empty Maps', () => {
    const cache = createDeriveCache()
    expect(cache.parentKeyCache).toBeInstanceOf(Map)
    expect(cache.childKeyCache).toBeInstanceOf(Map)
    expect(cache.parentKeyCache.size).toBe(0)
    expect(cache.childKeyCache.size).toBe(0)
  })
})

describe('recoverDerivedCSV', () => {
  const hdKey = recoverHDKeyFromMnemonics(mnemonics, chaincode)

  const makeRow = (path: string, algo: string, blockchain = 'EVM'): RawCSVRow => ({
    'HD Path': path,
    'Blockchain Type': blockchain,
    Network: 'mainnet',
    Address: '',
    'Address Type': 'DEFAULT',
    Algorithm: algo,
  })

  test('returns correct number of rows', () => {
    const rows: RawCSVRow[] = [
      makeRow('m/44/666/0/0/0', 'secp256k1'),
      makeRow('m/44/666/1/0/0', 'secp256k1'),
    ]
    const result = recoverDerivedCSV(rows, hdKey)
    expect(result).toHaveLength(2)
  })

  test('result rows have Public Key and Private Key', () => {
    const rows: RawCSVRow[] = [makeRow('m/44/666/0/0/0', 'secp256k1')]
    const result = recoverDerivedCSV(rows, hdKey)
    expect(result[0]['Public Key']).toBeTruthy()
    expect(result[0]['Private Key']).toBeTruthy()
  })

  test('Private Key matches known fixture', () => {
    const rows: RawCSVRow[] = [makeRow('m/44/666/0/0/0', 'secp256k1')]
    const result = recoverDerivedCSV(rows, hdKey)
    expect(result[0]['Private Key']).toBe(recovery[0].privateKey)
  })

  test('derives Address when input is empty', () => {
    const rows: RawCSVRow[] = [makeRow('m/44/666/0/0/0', 'secp256k1')]
    const result = recoverDerivedCSV(rows, hdKey)
    expect(result[0].Address).toBeTruthy()
    expect(result[0].Address.startsWith('0x')).toBe(true)
  })

  test('cache produces identical results', () => {
    const cache = createDeriveCache()
    const rows: RawCSVRow[] = [makeRow('m/44/666/0/0/0', 'secp256k1')]
    const result1 = recoverDerivedCSV(rows, hdKey, cache)
    const result2 = recoverDerivedCSV(rows, hdKey, cache)
    expect(result1).toEqual(result2)
    expect(cache.parentKeyCache.size).toBeGreaterThan(0)
    expect(cache.childKeyCache.size).toBeGreaterThan(0)
  })

  test('throws ValidateAddressError for wrong address', () => {
    const rows: RawCSVRow[] = [{
      'HD Path': 'm/44/666/0/0/0',
      'Blockchain Type': 'EVM',
      Network: 'mainnet',
      Address: '0x0000000000000000000000000000000000000000',
      'Address Type': 'DEFAULT',
      Algorithm: 'secp256k1',
    }]
    expect(() => recoverDerivedCSV(rows, hdKey)).toThrow(ValidateAddressError)
  })
})

describe('LRUMap', () => {
  test('is instanceof Map', () => {
    const lru = new LRUMap(3)
    expect(lru).toBeInstanceOf(Map)
  })

  test('get and set work like Map', () => {
    const lru = new LRUMap<string, number>(10)
    lru.set('a', 1)
    lru.set('b', 2)
    expect(lru.get('a')).toBe(1)
    expect(lru.get('b')).toBe(2)
    expect(lru.get('c')).toBeUndefined()
    expect(lru.size).toBe(2)
  })

  test('evicts oldest entry when over capacity', () => {
    const lru = new LRUMap<string, number>(3)
    lru.set('a', 1)
    lru.set('b', 2)
    lru.set('c', 3)
    // Full — next insert evicts oldest ('a')
    lru.set('d', 4)
    expect(lru.size).toBe(3)
    expect(lru.get('a')).toBeUndefined()
    expect(lru.get('b')).toBe(2)
    expect(lru.get('d')).toBe(4)
  })

  test('get refreshes recency so entry is not evicted', () => {
    const lru = new LRUMap<string, number>(3)
    lru.set('a', 1)
    lru.set('b', 2)
    lru.set('c', 3)
    // Touch 'a' — now 'b' is oldest
    lru.get('a')
    lru.set('d', 4)
    expect(lru.get('a')).toBe(1) // survived
    expect(lru.get('b')).toBeUndefined() // evicted
  })

  test('set on existing key updates value and refreshes recency', () => {
    const lru = new LRUMap<string, number>(3)
    lru.set('a', 1)
    lru.set('b', 2)
    lru.set('c', 3)
    // Update 'a' — now 'b' is oldest
    lru.set('a', 100)
    lru.set('d', 4)
    expect(lru.get('a')).toBe(100)
    expect(lru.get('b')).toBeUndefined()
    expect(lru.size).toBe(3)
  })

  test('capacity 1 always holds only the last entry', () => {
    const lru = new LRUMap<string, number>(1)
    lru.set('a', 1)
    lru.set('b', 2)
    expect(lru.size).toBe(1)
    expect(lru.get('a')).toBeUndefined()
    expect(lru.get('b')).toBe(2)
  })
})
