import { expect, test, describe } from '@jest/globals'

import {
  parseCsvHeader,
  parseCsvLine,
  splitCsvFields,
  splitCsvLines,
  escapeCsvField,
} from '../utils/csvLineParser'

const header = 'Account Name,Blockchain Type,Network,Address,Address Type,HD Path,Algorithm'

// ---------------------------------------------------------------------------
// parseCsvHeader
// ---------------------------------------------------------------------------

describe('parseCsvHeader', () => {
  test('extracts column indices', () => {
    const info = parseCsvHeader(header)
    expect(info.columns).toEqual([
      'Account Name',
      'Blockchain Type',
      'Network',
      'Address',
      'Address Type',
      'HD Path',
      'Algorithm',
    ])
    expect(info.hdPathIdx).toBe(5)
    expect(info.blockchainIdx).toBe(1)
    expect(info.networkIdx).toBe(2)
    expect(info.addressIdx).toBe(3)
    expect(info.addrTypeIdx).toBe(4)
    expect(info.algoIdx).toBe(6)
  })

  test('throws on missing HD Path', () => {
    expect(() => parseCsvHeader('Account Name,Blockchain Type,Network,Address,Address Type')).toThrow('HD Path')
  })

  test('throws on missing Blockchain Type', () => {
    expect(() => parseCsvHeader('Account Name,Network,Address,HD Path')).toThrow('Blockchain Type')
  })

  test('throws on missing multiple fields', () => {
    expect(() => parseCsvHeader('Account Name,Address Type')).toThrow('HD Path')
  })
})

// ---------------------------------------------------------------------------
// parseCsvLine — normal cases
// ---------------------------------------------------------------------------

describe('parseCsvLine', () => {
  const info = parseCsvHeader(header)

  test('parses a valid data line', () => {
    const row = parseCsvLine('钱包 1,EVM,mainnet,0xABC123,DEFAULT,m/44/666/0/0/0,secp256k1', info)
    expect(row['HD Path']).toBe('m/44/666/0/0/0')
    expect(row['Blockchain Type']).toBe('EVM')
    expect(row.Network).toBe('mainnet')
    expect(row.Address).toBe('0xABC123')
    expect(row['Address Type']).toBe('DEFAULT')
    expect(row.Algorithm).toBe('secp256k1')
  })

  test('preserves Account Name', () => {
    const row = parseCsvLine('钱包 1,EVM,mainnet,0xABC123,DEFAULT,m/44/666/0/0/0,secp256k1', info)
    expect(row['Account Name']).toBe('钱包 1')
  })

  test('trims whitespace', () => {
    const row = parseCsvLine(' 钱包 1 , EVM ,mainnet, 0xABC ,DEFAULT, m/44/666/0/0/0 , secp256k1 ', info)
    expect(row['Blockchain Type']).toBe('EVM')
    expect(row['HD Path']).toBe('m/44/666/0/0/0')
  })

  test('handles quoted fields with commas', () => {
    const row = parseCsvLine('"钱包,1",EVM,mainnet,0xABC,DEFAULT,m/44/666/0/0/0,secp256k1', info)
    expect(row['Account Name']).toBe('钱包,1')
  })

  test('handles quoted fields with escaped quotes', () => {
    const row = parseCsvLine('"钱包""1""",EVM,mainnet,0xABC,DEFAULT,m/44/666/0/0/0,secp256k1', info)
    expect(row['Account Name']).toBe('钱包"1"')
  })
})

// ---------------------------------------------------------------------------
// parseCsvLine — error cases
// ---------------------------------------------------------------------------

describe('parseCsvLine errors', () => {
  const info = parseCsvHeader(header)

  test('throws on unsupported blockchain', () => {
    expect(() => parseCsvLine('钱包,Cosmos,mainnet,0xABC,DEFAULT,m/44/666/0/0/0,secp256k1', info)).toThrow('Cosmos')
  })

  test('throws on empty Address (required field)', () => {
    expect(() => parseCsvLine('钱包,EVM,mainnet,,DEFAULT,m/44/666/0/0/0,secp256k1', info)).toThrow('Address')
  })

  test('throws on empty HD Path (required field)', () => {
    expect(() => parseCsvLine('钱包,EVM,mainnet,0xABC,DEFAULT,,secp256k1', info)).toThrow('HD Path')
  })

  test('throws on empty Network (required field)', () => {
    expect(() => parseCsvLine('钱包,EVM,,0xABC,DEFAULT,m/44/666/0/0/0,secp256k1', info)).toThrow('Network')
  })

  test('throws on empty Blockchain Type (required field)', () => {
    expect(() => parseCsvLine('钱包,,mainnet,0xABC,DEFAULT,m/44/666/0/0/0,secp256k1', info)).toThrow('Blockchain Type')
  })

  test('throws on multiple missing required fields', () => {
    expect(() => parseCsvLine('钱包,,,,DEFAULT,m/44/666/0/0/0,secp256k1', info)).toThrow('Blockchain Type')
  })
})

// ---------------------------------------------------------------------------
// splitCsvFields
// ---------------------------------------------------------------------------

describe('splitCsvFields', () => {
  test('simple comma-separated', () => {
    expect(splitCsvFields('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  test('quoted field with comma', () => {
    expect(splitCsvFields('"a,b",c')).toEqual(['a,b', 'c'])
  })

  test('quoted field with escaped quote', () => {
    expect(splitCsvFields('"a""b",c')).toEqual(['a"b', 'c'])
  })

  test('empty fields', () => {
    expect(splitCsvFields('a,,c')).toEqual(['a', '', 'c'])
  })

  test('quoted empty string', () => {
    expect(splitCsvFields('"",a')).toEqual(['', 'a'])
  })

  test('trims whitespace around fields', () => {
    expect(splitCsvFields(' a , b , c ')).toEqual(['a', 'b', 'c'])
  })
})

// ---------------------------------------------------------------------------
// splitCsvLines
// ---------------------------------------------------------------------------

describe('splitCsvLines', () => {
  test('simple newlines', () => {
    const [lines, leftover] = splitCsvLines('a,b\nc,d\n')
    expect(lines).toEqual(['a,b', 'c,d'])
    expect(leftover).toBe('')
  })

  test('CRLF line endings', () => {
    const [lines, leftover] = splitCsvLines('a,b\r\nc,d\r\n')
    expect(lines).toEqual(['a,b', 'c,d'])
    expect(leftover).toBe('')
  })

  test('quoted field with newline inside', () => {
    const [lines, leftover] = splitCsvLines('"a\nb",c\nd,e\n')
    expect(lines).toEqual(['"a\nb",c', 'd,e'])
    expect(leftover).toBe('')
  })

  test('incomplete quoted field becomes leftover', () => {
    const [lines, leftover] = splitCsvLines('a,b\n"incomplete')
    expect(lines).toEqual(['a,b'])
    expect(leftover).toBe('"incomplete')
  })

  test('no trailing newline — last line is leftover', () => {
    const [lines, leftover] = splitCsvLines('a,b\nc,d')
    expect(lines).toEqual(['a,b'])
    expect(leftover).toBe('c,d')
  })
})

// ---------------------------------------------------------------------------
// escapeCsvField
// ---------------------------------------------------------------------------

describe('escapeCsvField', () => {
  test('plain value unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello')
  })

  test('wraps value with comma in quotes', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"')
  })

  test('wraps value with quote and escapes it', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
  })

  test('wraps value with newline', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
  })

  test('empty string unchanged', () => {
    expect(escapeCsvField('')).toBe('')
  })
})
