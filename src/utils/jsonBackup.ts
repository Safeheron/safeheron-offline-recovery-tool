/* eslint-disable max-classes-per-file */
import { RawCSVRow } from './mpc'
import { CSV_FIELD_ADDR_TYPE } from './const'

export class InvalidFormatError extends Error {
  constructor() {
    super('Invalid JSON backup format')
    this.name = 'InvalidFormatError'
  }
}

export class UnsupportedVersionError extends Error {
  constructor(version: string) {
    super(version)
    this.name = 'UnsupportedVersionError'
  }
}

const SUPPORTED_VERSIONS = ['v1']

/**
 * Validate a parsed JSON backup object.
 * Throws typed errors so callers can show specific messages.
 */
export function validateJsonBackup(json: unknown): void {
  if (
    typeof json !== 'object' ||
    json === null ||
    !('metadata' in json) ||
    !('data' in json)
  ) {
    throw new InvalidFormatError()
  }

  const { metadata } = json as { metadata: Record<string, unknown>; data: unknown }

  if (!SUPPORTED_VERSIONS.includes(metadata.v as string)) {
    throw new UnsupportedVersionError(String(metadata.v ?? ''))
  }
}

/**
 * Split an item string by top-level commas only (ignores commas inside [...]).
 * e.g. "0,0,1,0,666,[[3,3]],0,[[0,0]]" → ["0","0","1","0","666","[[3,3]]","0","[[0,0]]"]
 */
export function tokenizeItemString(s: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '[') depth++
    else if (c === ']') depth--
    else if (c === ',' && depth === 0) {
      tokens.push(s.slice(start, i).trim())
      start = i + 1
    }
  }
  tokens.push(s.slice(start).trim())
  return tokens
}

/**
 * Expand an array of [start, end] ranges into a flat list of integers.
 * e.g. [[0, 2]] → [0, 1, 2]
 * e.g. [[0, 7], [9, 9]] → [0, 1, 2, 3, 4, 5, 6, 7, 9]
 */
export function expandRanges(ranges: number[][]): number[] {
  const result: number[] = []
  for (const [start, end] of ranges) {
    for (let i = start; i <= end; i++) {
      result.push(i)
    }
  }
  return result
}

/**
 * Convert a compressed JSON backup file to RawCSVRow[].
 * Address field will be empty string — the JSON backup does not store addresses.
 *
 * Template (metadata.tp): {blockchain},{network},{type},{at},{path2},{path3},{path4},{path5}
 * - blockchain, network, type, at: indices into the corresponding metadata arrays
 * - path2: coinType
 * - path3: [[accountStart, accountEnd], ...] — account index ranges
 * - path4: change (typically 0)
 * - path5: [[addrStart, addrEnd], ...] — address index ranges
 *
 * The outer key of each wallet entry is the algorithm index into metadata.algorithm.
 */
export function convertJsonBackupToRows(jsonText: string): RawCSVRow[] {
  let json: unknown
  try {
    json = JSON.parse(jsonText)
  } catch {
    throw new InvalidFormatError()
  }
  validateJsonBackup(json)
  const { metadata, data } = json as { metadata: Record<string, any>; data: any }
  const {
    blockchain: blockchainDict,
    network: networkDict,
    algorithm: algorithmDict,
  } = metadata

  const rows: RawCSVRow[] = []

  for (const walletEntry of data as Record<string, { item: string[] }>[]) {
    for (const algoIdxStr of Object.keys(walletEntry)) {
      const algoIdx = parseInt(algoIdxStr, 10)
      const algoName = algorithmDict[algoIdx] as string
      const { item } = walletEntry[algoIdxStr]

      for (const itemStr of item) {
        const tokens = tokenizeItemString(itemStr)
        // tokens: [blockchain_idx, network_idx, type_idx, at_idx, path2, path3, path4, path5]
        const blockchainIdx = parseInt(tokens[0], 10)
        const networkIdx = parseInt(tokens[1], 10)
        // tokens[2] = type_idx (UTXO/NON-UTXO) — not needed for recovery
        const atIdx = parseInt(tokens[3], 10)
        const path2 = parseInt(tokens[4], 10)
        const path3Ranges: number[][] = JSON.parse(tokens[5])
        const path4 = parseInt(tokens[6], 10)
        const path5Ranges: number[][] = JSON.parse(tokens[7])

        const csvBlockchain = blockchainDict[blockchainIdx] as string
        const networkName = networkDict[networkIdx] as string
        const addrType = (metadata.at as string[])[atIdx]

        const accountIndices = expandRanges(path3Ranges)
        const addressIndices = expandRanges(path5Ranges)

        for (const accountIdx of accountIndices) {
          for (const addressIdx of addressIndices) {
            rows.push({
              'HD Path': `m/44/${path2}/${accountIdx}/${path4}/${addressIdx}`,
              Network: networkName,
              Address: '',
              [CSV_FIELD_ADDR_TYPE]: addrType,
              Algorithm: algoName,
              'Blockchain Type': csvBlockchain,
            })
          }
        }
      }
    }
  }

  return rows
}
