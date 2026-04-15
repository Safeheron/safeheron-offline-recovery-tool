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

describe('expandSortedJsonToTempCsv', () => {
  test('returns totalRows matching computeJsonRowCount', async () => {
    const result = await expandSortedJsonToTempCsv(BASE_JSON)
    expect(result.totalRows).toBe(17)
  })

  test('produces CSV with header and N data rows', async () => {
    const { tempPath } = await expandSortedJsonToTempCsv(BASE_JSON)
    const csv = mockTempFiles.get(tempPath)!
    const lines = csv.trim().split('\n')
    expect(lines.length).toBe(1 + 17) // header + 17 data rows
    expect(lines[0]).toBe('Blockchain Type,Network,Address,Address Type,HD Path,Algorithm')
  })

  test('produces mapping file with one sourceIdx per data row', async () => {
    const { mappingPath, totalRows } = await expandSortedJsonToTempCsv(BASE_JSON)
    const mapping = mockTempFiles.get(mappingPath)!
    const indices = mapping.trim().split('\n').map(Number)
    expect(indices.length).toBe(totalRows)
    // All source indices 0..16 must appear exactly once
    expect([...indices].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 17 }, (_, i) => i)
    )
  })

  test('rows are sorted by (algo, parentPath, lastIndex)', async () => {
    const { tempPath } = await expandSortedJsonToTempCsv(BASE_JSON)
    const csv = mockTempFiles.get(tempPath)!
    const dataLines = csv.trim().split('\n').slice(1)
    // Build sortKey from each line: algo, parentPath (HD Path without last segment), lastIndex
    const keys = dataLines.map(line => {
      const fields = line.split(',')
      const hdPath = fields[4]
      const algo = fields[5]
      const lastSlash = hdPath.lastIndexOf('/')
      const parentPath = hdPath.slice(0, lastSlash)
      const lastIdx = parseInt(hdPath.slice(lastSlash + 1), 10)
      return `${algo}\x00${parentPath}\x00${String(lastIdx).padStart(10, '0')}`
    })
    const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b))
    expect(keys).toEqual(sortedKeys)
  })

  test('Address field is always empty in produced CSV', async () => {
    const { tempPath } = await expandSortedJsonToTempCsv(BASE_JSON)
    const csv = mockTempFiles.get(tempPath)!
    const dataLines = csv.trim().split('\n').slice(1)
    for (const line of dataLines) {
      const fields = line.split(',')
      expect(fields[2]).toBe('') // Address column
    }
  })

  test('mapping and CSV lines stay in 1:1 correspondence', async () => {
    // For each sorted-output-row N, mapping[N] should be its original sourceIdx (0..totalRows-1)
    const { tempPath, mappingPath } = await expandSortedJsonToTempCsv(BASE_JSON)
    const dataLines = mockTempFiles.get(tempPath)!.trim().split('\n').slice(1)
    const indices = mockTempFiles.get(mappingPath)!.trim().split('\n').map(Number)
    expect(dataLines.length).toBe(indices.length)
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
    // Header only, no data rows (trailing newline from header write)
    expect(csv.trim().split('\n').length).toBe(1)
  })
})
