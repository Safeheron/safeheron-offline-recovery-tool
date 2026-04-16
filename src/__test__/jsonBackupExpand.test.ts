import { expect, test, describe, beforeEach } from '@jest/globals'

// In-memory filesystem mock for Tauri file I/O.
// Variables referenced inside jest.mock() factory must be prefixed with `mock`.
const mockTempFiles: Map<string, string> = new Map()
const mockState = { counter: 0 }

jest.mock('../utils/tauriFileIO', () => ({
  getTempPath: async () => {
    mockState.counter++
    const p = `/tmp/test-${mockState.counter}.csv`
    mockTempFiles.set(p, '')
    return p
  },
  writeFileChunk: async (path: string, content: string, append: boolean) => {
    const prev = append ? mockTempFiles.get(path) ?? '' : ''
    mockTempFiles.set(path, prev + content)
  },
}))

// eslint-disable-next-line import/first
import { expandSortedJsonToTempCsv } from '../utils/jsonBackup'

beforeEach(() => {
  mockTempFiles.clear()
  mockState.counter = 0
})

// Reusable fixture — 17 rows total, mixed algorithms and address types.
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

/**
 * Parse a data row from the expanded CSV: `<sourceIdx>\t<csvFields>`.
 */
function parseDataRow(line: string): { sourceIdx: number; fields: string[] } {
  const tabIdx = line.indexOf('\t')
  const sourceIdx = parseInt(line.slice(0, tabIdx), 10)
  const csvLine = line.slice(tabIdx + 1)
  return { sourceIdx, fields: csvLine.split(',') }
}

describe('expandSortedJsonToTempCsv', () => {
  test('returns totalRows matching computeJsonRowCount', async () => {
    const result = await expandSortedJsonToTempCsv(BASE_JSON)
    expect(result.totalRows).toBe(17)
  })

  test('produces CSV with header (no prefix) and N tab-prefixed data rows', async () => {
    const { tempPath } = await expandSortedJsonToTempCsv(BASE_JSON)
    const csv = mockTempFiles.get(tempPath)!
    const lines = csv.trim().split('\n')
    expect(lines.length).toBe(1 + 17)
    // Header: plain CSV, no tab.
    expect(lines[0]).toBe('Blockchain Type,Network,Address,Address Type,HD Path,Algorithm')
    expect(lines[0].includes('\t')).toBe(false)
    // Data rows: start with "<sourceIdx>\t".
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).toMatch(/^\d+\t/)
    }
  })

  test('inline sourceIdx values cover [0..totalRows-1] exactly once', async () => {
    const { tempPath, totalRows } = await expandSortedJsonToTempCsv(BASE_JSON)
    const dataLines = mockTempFiles.get(tempPath)!.trim().split('\n').slice(1)
    const indices = dataLines.map(l => parseDataRow(l).sourceIdx)
    expect(indices.length).toBe(totalRows)
    expect([...indices].sort((a, b) => a - b)).toEqual(
      Array.from({ length: totalRows }, (_, i) => i)
    )
  })

  test('rows are sorted by (algo, parentPath, lastIndex)', async () => {
    const { tempPath } = await expandSortedJsonToTempCsv(BASE_JSON)
    const dataLines = mockTempFiles.get(tempPath)!.trim().split('\n').slice(1)
    // Account and address are padded so string comparison matches numeric order.
    const keys = dataLines.map(line => {
      const { fields } = parseDataRow(line)
      const hdPath = fields[4]
      const algo = fields[5]
      const parts = hdPath.split('/')
      const paddedParent = `m/44/${parts[2]}/${parts[3].padStart(10, '0')}/${parts[4]}`
      return `${algo}\x00${paddedParent}\x00${parts[5].padStart(10, '0')}`
    })
    const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b))
    expect(keys).toEqual(sortedKeys)
  })

  test('Address field is always empty in produced CSV', async () => {
    const { tempPath } = await expandSortedJsonToTempCsv(BASE_JSON)
    const dataLines = mockTempFiles.get(tempPath)!.trim().split('\n').slice(1)
    for (const line of dataLines) {
      expect(parseDataRow(line).fields[2]).toBe('')
    }
  })

  test('empty data returns zero rows but still writes header', async () => {
    const emptyJson = JSON.stringify({
      metadata: {
        v: 'v1',
        network: [],
        algorithm: [],
        at: [],
        blockchain: [],
      },
      data: [],
    })
    const { tempPath, totalRows } = await expandSortedJsonToTempCsv(emptyJson)
    expect(totalRows).toBe(0)
    const csv = mockTempFiles.get(tempPath)!
    expect(csv.trim().split('\n').length).toBe(1)
  })
})
