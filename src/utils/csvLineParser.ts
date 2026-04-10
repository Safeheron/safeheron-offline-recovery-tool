import {
  CSV_REQUIRED_FIELD,
  CSV_FIELD_BLOCKCHAIN,
  CSV_FIELD_NETWORK,
  CSV_FIELD_ADDRESS,
  CSV_FIELD_ADDR_TYPE,
  CSV_FIELD_ALGO,
  SUPPORTED_BLOCKCHAIN,
  SUPPORTED_BLOCKCHAIN_TYPE,
} from './const'
import { MissRequiredFieldError, UnsupportBlockChainError } from './csv'
import { RawCSVRow } from './mpc'

export interface CsvHeaderInfo {
  columns: string[]
  hdPathIdx: number
  blockchainIdx: number
  networkIdx: number
  addressIdx: number
  addrTypeIdx: number
  algoIdx: number
}

const REQUIRED_COLUMNS = [
  CSV_REQUIRED_FIELD,
  CSV_FIELD_BLOCKCHAIN,
  CSV_FIELD_NETWORK,
  CSV_FIELD_ADDRESS,
]

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles: "field with , comma", "field with ""escaped"" quotes"
 */
export function splitCsvFields(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote ""
          current += '"'
          i += 2
        } else {
          // End of quoted field
          inQuotes = false
          i += 1
        }
      } else {
        current += ch
        i += 1
      }
    } else if (ch === '"') {
      inQuotes = true
      i += 1
    } else if (ch === ',') {
      fields.push(current.trim())
      current = ''
      i += 1
    } else {
      current += ch
      i += 1
    }
  }
  fields.push(current.trim())
  return fields
}

export function parseCsvHeader(headerLine: string): CsvHeaderInfo {
  const columns = splitCsvFields(headerLine)

  const missing = REQUIRED_COLUMNS.filter(f => !columns.includes(f))
  if (missing.length > 0) {
    throw new MissRequiredFieldError(missing.join(' | '))
  }

  return {
    columns,
    hdPathIdx: columns.indexOf(CSV_REQUIRED_FIELD),
    blockchainIdx: columns.indexOf(CSV_FIELD_BLOCKCHAIN),
    networkIdx: columns.indexOf(CSV_FIELD_NETWORK),
    addressIdx: columns.indexOf(CSV_FIELD_ADDRESS),
    addrTypeIdx: columns.indexOf(CSV_FIELD_ADDR_TYPE),
    algoIdx: columns.indexOf(CSV_FIELD_ALGO),
  }
}

export function parseCsvLine(line: string, header: CsvHeaderInfo): RawCSVRow {
  const values = splitCsvFields(line)

  const blockchain = values[header.blockchainIdx] || ''
  if (!SUPPORTED_BLOCKCHAIN.includes(blockchain.toLowerCase() as SUPPORTED_BLOCKCHAIN_TYPE)) {
    throw new UnsupportBlockChainError(blockchain)
  }

  const row: Record<string, string> = {}
  header.columns.forEach((col, i) => {
    row[col] = values[i] || ''
  })

  return row as unknown as RawCSVRow
}

/**
 * Escape a value for CSV output. Wraps in quotes if it contains comma, quote, or newline.
 */
export function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
