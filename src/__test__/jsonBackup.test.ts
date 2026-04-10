import { expect, test, describe } from '@jest/globals'

import {
  tokenizeItemString,
  expandRanges,
  convertJsonBackupToRows,
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
// convertJsonBackupToRows
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

describe('convertJsonBackupToRows', () => {
  test('returns an array of RawCSVRow objects', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
  })

  test('every row has the required CSV fields', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    for (const row of rows) {
      expect(row).toHaveProperty('HD Path')
      expect(row).toHaveProperty('Network')
      expect(row).toHaveProperty('Address')
      expect(row).toHaveProperty('Address Type')
      expect(row).toHaveProperty('Algorithm')
      expect(row).toHaveProperty('Blockchain Type')
    }
  })

  test('Address field is always empty string', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    for (const row of rows) {
      expect(row.Address).toBe('')
    }
  })

  test('HD Path follows m/44/{path2}/{account}/{change}/{addressIdx} format', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    for (const row of rows) {
      expect(row['HD Path']).toMatch(/^m\/44\/\d+\/\d+\/\d+\/\d+$/)
    }
  })

  test('secp256k1 group: TRON/mainnet/DEFAULT/secp256k1', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    const row = rows.find(r => r['Blockchain Type'] === 'TRON')!
    expect(row.Network).toBe('mainnet')
    expect(row.Algorithm).toBe('secp256k1')
    expect(row['Address Type']).toBe('DEFAULT')
    expect(row['HD Path']).toBe('m/44/666/3/0/0')
  })

  test('ed25519 group: TON/mainnet/V4R2/ed25519', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    const row = rows.find(r => r['Blockchain Type'] === 'TON')!
    expect(row.Network).toBe('mainnet')
    expect(row.Algorithm).toBe('ed25519')
    expect(row['Address Type']).toBe('V4R2')
    expect(row['HD Path']).toBe('m/44/666/3/0/0')
  })

  test('Address Type P2PKH mapped correctly for BTC_TESTNET', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    const p2pkhRows = rows.filter(
      r =>
        r['Blockchain Type'] === 'Bitcoin Testnet' &&
        r['Address Type'] === 'P2PKH'
    )
    // accounts {0,3,4} × addr {0} = 3 rows, plus account 2 × addrs {0,1,2} = 3 rows → 6 total
    expect(p2pkhRows.length).toBe(6)
  })

  test('Address Type P2WPKH mapped correctly for BTC_TESTNET', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    const p2wpkhRows = rows.filter(
      r =>
        r['Blockchain Type'] === 'Bitcoin Testnet' &&
        r['Address Type'] === 'P2WPKH'
    )
    // accounts {0,3,4} × addr {0} = 3 rows
    expect(p2wpkhRows.length).toBe(3)
  })

  test('multi-account range [[0,0],[3,4]] expands to accounts 0, 3, 4', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    const p2wpkhPaths = rows
      .filter(
        r =>
          r['Blockchain Type'] === 'Bitcoin Testnet' &&
          r['Address Type'] === 'P2WPKH'
      )
      .map(r => r['HD Path'])
    expect(p2wpkhPaths).toContain('m/44/666/0/0/0')
    expect(p2wpkhPaths).toContain('m/44/666/3/0/0')
    expect(p2wpkhPaths).toContain('m/44/666/4/0/0')
    expect(p2wpkhPaths).not.toContain('m/44/666/1/0/0')
    expect(p2wpkhPaths).not.toContain('m/44/666/2/0/0')
  })

  test('address range [[0,2]] expands to 3 addresses', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    const paths = rows
      .filter(
        r =>
          r['Blockchain Type'] === 'Bitcoin Testnet' &&
          r['HD Path'].startsWith('m/44/666/2/')
      )
      .map(r => r['HD Path'])
    expect(paths).toContain('m/44/666/2/0/0')
    expect(paths).toContain('m/44/666/2/0/1')
    expect(paths).toContain('m/44/666/2/0/2')
  })

  test('continuous account range [[0,4]] expands to 5 rows for EVM', () => {
    const rows = convertJsonBackupToRows(BASE_JSON)
    const evmRows = rows.filter(r => r['Blockchain Type'] === 'EVM')
    expect(evmRows.length).toBe(5)
    const paths = evmRows.map(r => r['HD Path'])
    for (let i = 0; i <= 4; i++) expect(paths).toContain(`m/44/666/${i}/0/0`)
  })

  test('total row count matches sum of all expanded items', () => {
    // secp256k1: TRX(1) + BTC_P2PKH_single(3) + BTC_P2PKH_multi(3) + BTC_P2WPKH(3) + EVM(5) = 15
    // ed25519:   TON(1) + NEAR(1) = 2
    // Total = 17
    const rows = convertJsonBackupToRows(BASE_JSON)
    expect(rows.length).toBe(17)
  })

  test('multi-range path3 and path5 expand correctly end-to-end', () => {
    // path3: [[0,2],[5,5]] → accounts [0,1,2,5]  (4 accounts)
    // path5: [[0,0],[3,4],[9,9]] → addresses [0,3,4,9]  (4 addresses)
    // total: 4 × 4 = 16 rows
    const json = JSON.stringify({
      metadata: {
        v: 'v1',
        time: 0,
        totalWallets: '1',
        checksum: '',
        network: ['mainnet'],
        algorithm: ['secp256k1'],
        at: ['DEFAULT'],
        tp: '{blockchain},{network},{type},{at},{path2},{path3},{path4},{path5}',
        blockchain: ['TRON'],
        type: ['NON-UTXO'],
      },
      data: [
        { 0: { item: ['0,0,1,0,666,[[0,2],[5,5]],0,[[0,0],[3,4],[9,9]]'] } },
      ],
    })
    const rows = convertJsonBackupToRows(json)
    expect(rows.length).toBe(16)
    const paths = rows.map(r => r['HD Path'])
    expect(paths).toContain('m/44/666/0/0/0')
    expect(paths).toContain('m/44/666/0/0/3')
    expect(paths).toContain('m/44/666/0/0/9')
    expect(paths).toContain('m/44/666/2/0/4')
    expect(paths).toContain('m/44/666/5/0/9')
  })

  test('blockchain types are all in SUPPORTED_BLOCKCHAIN (case-insensitive)', () => {
    const { SUPPORTED_BLOCKCHAIN } = require('../utils/const')
    const rows = convertJsonBackupToRows(BASE_JSON)
    for (const row of rows) {
      expect(SUPPORTED_BLOCKCHAIN).toContain(
        row['Blockchain Type'].toLowerCase()
      )
    }
  })
})
