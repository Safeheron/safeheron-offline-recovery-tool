import {
  CSV_FIELD_HD_PATH,
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
  CSV_FIELD_HD_PATH,
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
    hdPathIdx: columns.indexOf(CSV_FIELD_HD_PATH),
    blockchainIdx: columns.indexOf(CSV_FIELD_BLOCKCHAIN),
    networkIdx: columns.indexOf(CSV_FIELD_NETWORK),
    addressIdx: columns.indexOf(CSV_FIELD_ADDRESS),
    addrTypeIdx: columns.indexOf(CSV_FIELD_ADDR_TYPE),
    algoIdx: columns.indexOf(CSV_FIELD_ALGO),
  }
}

export interface ParseCsvLineOptions {
  /** Skip Address non-empty validation (JSON backup rows have no address) */
  skipAddressCheck?: boolean
}

export function parseCsvLine(line: string, header: CsvHeaderInfo, options?: ParseCsvLineOptions): RawCSVRow {
  const values = splitCsvFields(line)

  // Reject rows shorter than the header — missing columns would silently
  // become empty strings, potentially causing wrong key derivation.
  if (values.length < header.columns.length) {
    throw new MissRequiredFieldError(
      `row has ${values.length} fields, expected ${header.columns.length}`
    )
  }

  // Validate required fields
  const skipFields = options?.skipAddressCheck ? [CSV_FIELD_ADDRESS] : []
  const missFields = REQUIRED_COLUMNS.filter(f => {
    if (skipFields.includes(f)) return false
    const idx = header.columns.indexOf(f)
    return idx < 0 || !values[idx]?.trim()
  })
  if (missFields.length > 0) {
    throw new MissRequiredFieldError(missFields.join(' | '))
  }

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

/**
 * Split text into CSV logical lines, respecting quoted fields that contain newlines.
 * Returns [completeLines[], leftover] where leftover may contain an incomplete quoted field.
 */
export function splitCsvLines(text: string): [string[], string] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '""'
          i += 1
        } else {
          inQuotes = false
          current += ch
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
      current += ch
    } else if (ch === '\n') {
      lines.push(current.replace(/\r$/, ''))
      current = ''
    } else {
      current += ch
    }
  }

  return [lines, current]
}
