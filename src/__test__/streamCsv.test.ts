import { expect, test } from '@jest/globals'

import {
  parseCsvHeader,
  parseCsvLine,
} from '../utils/csvLineParser'

const header = 'Account Name,Blockchain Type,Network,Address,Address Type,HD Path,Algorithm'

test('parseCsvHeader extracts column indices', () => {
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

test('parseCsvHeader throws on missing required field', () => {
  const noHdPath = 'Account Name,Blockchain Type,Network,Address,Address Type'
  expect(() => parseCsvHeader(noHdPath)).toThrow('HD Path')
})

test('parseCsvLine parses a data line into RawCSVRow', () => {
  const info = parseCsvHeader(header)
  const line = '钱包 1,EVM,mainnet,0xABC123,DEFAULT,m/44/666/0/0/0,secp256k1'
  const row = parseCsvLine(line, info)
  expect(row['HD Path']).toBe('m/44/666/0/0/0')
  expect(row['Blockchain Type']).toBe('EVM')
  expect(row.Network).toBe('mainnet')
  expect(row.Address).toBe('0xABC123')
  expect(row['Address Type']).toBe('DEFAULT')
  expect(row.Algorithm).toBe('secp256k1')
})

test('parseCsvLine preserves Account Name as extra field', () => {
  const info = parseCsvHeader(header)
  const line = '钱包 1,EVM,mainnet,0xABC123,DEFAULT,m/44/666/0/0/0,secp256k1'
  const row = parseCsvLine(line, info)
  expect((row as any)['Account Name']).toBe('钱包 1')
})

test('parseCsvLine trims whitespace from fields', () => {
  const info = parseCsvHeader(header)
  const line = ' 钱包 1 , EVM ,mainnet, 0xABC ,DEFAULT, m/44/666/0/0/0 , secp256k1 '
  const row = parseCsvLine(line, info)
  expect(row['Blockchain Type']).toBe('EVM')
  expect(row['HD Path']).toBe('m/44/666/0/0/0')
  expect(row.Algorithm).toBe('secp256k1')
})

test('parseCsvLine throws on unsupported blockchain', () => {
  const info = parseCsvHeader(header)
  const line = '钱包 1,Cosmos,mainnet,0xABC,DEFAULT,m/44/666/0/0/0,secp256k1'
  expect(() => parseCsvLine(line, info)).toThrow('Cosmos')
})
