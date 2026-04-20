import { expect, test, describe } from '@jest/globals'

import {
  tokenizeItemString,
  expandRanges,
  parseItemDescriptors,
  computeJsonRowCount,
  validateJsonBackup,
  InvalidFormatError,
  UnsupportedVersionError,
} from '../utils/jsonBackup'

// ---------------------------------------------------------------------------
// tokenizeItemString
// ---------------------------------------------------------------------------

describe('tokenizeItemString', () => {
  test('simple item with single-element ranges', () => {
    expect(tokenizeItemString('0,0,1,0,666,[[3,3]],0,[[0,0]]')).toEqual([
      '0',
      '0',
      '1',
      '0',
      '666',
      '[[3,3]]',
      '0',
      '[[0,0]]',
    ])
  })

  test('item with two-range path3 and path5', () => {
    expect(
      tokenizeItemString('0,1,0,1,0,[[0,7],[9,9]],0,[[0,0],[2,5]]')
    ).toEqual(['0', '1', '0', '1', '0', '[[0,7],[9,9]]', '0', '[[0,0],[2,5]]'])
  })

  test('item with three-range path3 and path5', () => {
    expect(
      tokenizeItemString(
        '0,0,1,0,666,[[0,2],[5,6],[10,12]],0,[[0,0],[3,4],[9,9]]'
      )
    ).toEqual([
      '0',
      '0',
      '1',
      '0',
      '666',
      '[[0,2],[5,6],[10,12]]',
      '0',
      '[[0,0],[3,4],[9,9]]',
    ])
  })

  test('does not split on commas inside brackets', () => {
    const tokens = tokenizeItemString('27,1,0,3,666,[[3,3]],0,[[0,2]]')
    expect(tokens).toHaveLength(8)
    expect(tokens[5]).toBe('[[3,3]]')
    expect(tokens[7]).toBe('[[0,2]]')
  })
})

// ---------------------------------------------------------------------------
// expandRanges
// ---------------------------------------------------------------------------

describe('expandRanges', () => {
  test('single element range [[3,3]]', () => {
    expect(expandRanges([[3, 3]])).toEqual([3])
  })

  test('multi-element range [[0,2]]', () => {
    expect(expandRanges([[0, 2]])).toEqual([0, 1, 2])
  })

  test('two disjoint ranges [[0,7],[9,9]]', () => {
    expect(
      expandRanges([
        [0, 7],
        [9, 9],
      ])
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9])
  })

  test('three disjoint ranges [[0,2],[5,6],[10,12]]', () => {
    expect(
      expandRanges([
        [0, 2],
        [5, 6],
        [10, 12],
      ])
    ).toEqual([0, 1, 2, 5, 6, 10, 11, 12])
  })

  test('empty ranges array', () => {
    expect(expandRanges([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

// Minimal self-contained JSON covering both algorithm groups and multiple address types.
// Blockchain names use CSV-style names directly (same as in real JSON backups).
// secp256k1 (key "0"):
//   item 0: TRON mainnet DEFAULT account=3 addr=0               → 1 row
//   item 1: Bitcoin Testnet testnet P2PKH  accounts={0,3,4}     → 3 rows
//   item 2: Bitcoin Testnet testnet P2PKH  account=2 addrs=0-2  → 3 rows
//   item 3: Bitcoin Testnet testnet P2WPKH accounts={0,3,4}     → 3 rows
//   item 4: EVM mainnet DEFAULT accounts=0-4                    → 5 rows
// ed25519 (key "1"):
//   item 5: TON mainnet V4R2 account=3                          → 1 row
//   item 6: NEAR mainnet DEFAULT account=3                      → 1 row
// Total: 17 rows
const BASE_JSON = JSON.stringify({
  metadata: {
    v: 'v1',
    time: 0,
    totalWallets: '2',
    checksum: '',
    network: ['mainnet', 'testnet'],
    algorithm: ['secp256k1', 'ed25519'],
    at: ['DEFAULT', 'P2PKH', 'P2PKH_CASH', 'P2WPKH', 'V4R2'],
    tp: '{blockchain},{network},{type},{at},{path2},{path3},{path4},{path5}',
    blockchain: ['TRON', 'Bitcoin Testnet', 'EVM', 'TON', 'NEAR'],
    type: ['UTXO', 'NON-UTXO'],
  },
  data: [
    {
      0: {
        item: [
          '0,0,1,0,666,[[3,3]],0,[[0,0]]',
          '1,1,0,1,666,[[0,0],[3,4]],0,[[0,0]]',
          '1,1,0,1,666,[[2,2]],0,[[0,2]]',
          '1,1,0,3,666,[[0,0],[3,4]],0,[[0,0]]',
          '2,0,1,0,666,[[0,4]],0,[[0,0]]',
        ],
      },
      1: {
        item: [
          '3,0,1,4,666,[[3,3]],0,[[0,0]]',
          '4,0,1,0,666,[[3,3]],0,[[0,0]]',
        ],
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// parseItemDescriptors
// ---------------------------------------------------------------------------

describe('parseItemDescriptors', () => {
  test('returns correct number of items', () => {
    const { items } = parseItemDescriptors(BASE_JSON)
    expect(items.length).toBe(7)
  })
  test('accountCount and addrCount match expanded sizes', () => {
    const { items } = parseItemDescriptors(BASE_JSON)
    expect(items[1].accountCount).toBe(3)
    expect(items[1].addrCount).toBe(1)
    expect(items[2].accountCount).toBe(1)
    expect(items[2].addrCount).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// computeJsonRowCount
// ---------------------------------------------------------------------------

describe('computeJsonRowCount', () => {
  test('sums account x addr counts across all items', () => {
    expect(computeJsonRowCount(BASE_JSON)).toBe(17)
  })
})

// ---------------------------------------------------------------------------
// validateJsonBackup
// ---------------------------------------------------------------------------

describe('validateJsonBackup', () => {
  test('throws InvalidFormatError for null', () => {
    expect(() => validateJsonBackup(null)).toThrow(InvalidFormatError)
  })

  test('throws InvalidFormatError for non-object', () => {
    expect(() => validateJsonBackup('string')).toThrow(InvalidFormatError)
    expect(() => validateJsonBackup(123)).toThrow(InvalidFormatError)
  })

  test('throws InvalidFormatError for missing metadata', () => {
    expect(() => validateJsonBackup({ data: [] })).toThrow(InvalidFormatError)
  })

  test('throws InvalidFormatError for missing data', () => {
    expect(() => validateJsonBackup({ metadata: { v: 'v1' } })).toThrow(InvalidFormatError)
  })

  test('throws UnsupportedVersionError for unsupported version', () => {
    expect(() => validateJsonBackup({ metadata: { v: 'v99' }, data: [] })).toThrow(UnsupportedVersionError)
  })

  test('does not throw for valid v1 backup', () => {
    expect(() => validateJsonBackup({
      metadata: { v: 'v1', blockchain: [], network: [], algorithm: [], at: [] },
      data: [],
    })).not.toThrow()
  })
})
