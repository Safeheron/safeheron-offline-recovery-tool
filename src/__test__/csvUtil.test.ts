import { expect, test } from '@jest/globals'

import { csvParse, csvStringify, sanitizeCsvValue, MissDataError, MissRequiredFieldError, UnsupportBlockChainError } from '../utils/csv'

const csvStrWithWhitespace =
`Account Name,Blockchain Type,Network,Address,Address Type,HD Path
钱包 1, EVM ,mainnet,0xd1f642c3d03f16549194eAee4067F80A8475f5A5,DEFAULT,m/44/666/0/0/0
钱包 1,Bitcoin,testnet,mowfuk1wB8ViPjM7QdzWt2d6VW7Ex5fS1S,P2PKH,m/44/666/0/0/0
钱包 1,Bitcoin,testnet,tb1qt3km5chpmh3gz4cmad6egqkj3tpwwyw93muzsa,P2WPKH,m/44/666/0/0/0
钱包 1,Dash,mainnet,yUkATtfHmMw87JPd7oekwfWuk8abXQaTu3,P2PKH,m/44/666/0/0/0
钱包 1,TRON,testnet,TV7PEemMu6oB4MuZN49YJrYtCdrneUxAHo,DEFAULT,m/44/666/0/0/0
钱包 2,EVM,mainnet,0x250C14604742C5759d1ce50ccbFc1C3A904314AC,DEFAULT,m/44/666/1/0/0

`

const csvStr =
`Account Name,Blockchain Type,Network,Address,Address Type,HD Path
钱包 1,EVM,mainnet,0xd1f642c3d03f16549194eAee4067F80A8475f5A5,DEFAULT,m/44/666/0/0/0
钱包 1,Bitcoin,testnet,mowfuk1wB8ViPjM7QdzWt2d6VW7Ex5fS1S,P2PKH,m/44/666/0/0/0
钱包 1,Bitcoin,testnet,tb1qt3km5chpmh3gz4cmad6egqkj3tpwwyw93muzsa,P2WPKH,m/44/666/0/0/0
钱包 1,Dash,mainnet,yUkATtfHmMw87JPd7oekwfWuk8abXQaTu3,P2PKH,m/44/666/0/0/0
钱包 1,TRON,testnet,TV7PEemMu6oB4MuZN49YJrYtCdrneUxAHo,DEFAULT,m/44/666/0/0/0
钱包 2,EVM,mainnet,0x250C14604742C5759d1ce50ccbFc1C3A904314AC,DEFAULT,m/44/666/1/0/0
`
const invalidFormatCsvStr = 'Account Name hello world'

const missRequiredFieldCsvStr =
`Account Name,Blockchain Type,Network,Address,Address Type
钱包 1,EVM,mainnet,0xd1f642c3d03f16549194eAee4067F80A8475f5A5,DEFAULT
钱包 1,Bitcoin,testnet,mowfuk1wB8ViPjM7QdzWt2d6VW7Ex5fS1S,P2PKH
钱包 1,Bitcoin,testnet,tb1qt3km5chpmh3gz4cmad6egqkj3tpwwyw93muzsa,P2WPKH
钱包 1,Dash,mainnet,yUkATtfHmMw87JPd7oekwfWuk8abXQaTu3,P2PKH
钱包 1,TRON,testnet,TV7PEemMu6oB4MuZN49YJrYtCdrneUxAHo,DEFAULT
钱包 2,EVM,mainnet,0x250C14604742C5759d1ce50ccbFc1C3A904314AC,DEFAULT
`

const unsupportBlockchainCsvStr =
`Account Name,Blockchain Type,Network,Address,Address Type,HD Path
钱包 1,Cosmos,mainnet,0xd1f642c3d03f16549194eAee4067F80A8475f5A5,DEFAULT,m/44/666/0/0/0
钱包 1,Kcc,testnet,mowfuk1wB8ViPjM7QdzWt2d6VW7Ex5fS1S,P2PKH,m/44/666/0/0/0
钱包 1,Bitcoin,testnet,tb1qt3km5chpmh3gz4cmad6egqkj3tpwwyw93muzsa,P2WPKH,m/44/666/0/0/0
钱包 1,Dash,mainnet,yUkATtfHmMw87JPd7oekwfWuk8abXQaTu3,P2PKH,m/44/666/0/0/0
钱包 1,TRON,testnet,TV7PEemMu6oB4MuZN49YJrYtCdrneUxAHo,DEFAULT,m/44/666/0/0/0
钱包 2,EVM,mainnet,0x250C14604742C5759d1ce50ccbFc1C3A904314AC,DEFAULT,m/44/666/1/0/0
`

const csvArr = [
  {
    'Account Name': '钱包 1',
    'Blockchain Type': 'EVM',
    Network: 'mainnet',
    Address: '0xd1f642c3d03f16549194eAee4067F80A8475f5A5',
    'Address Type': 'DEFAULT',
    'HD Path': 'm/44/666/0/0/0'
  },
  {
    'Account Name': '钱包 1',
    'Blockchain Type': 'Bitcoin',
    Network: 'testnet',
    Address: 'mowfuk1wB8ViPjM7QdzWt2d6VW7Ex5fS1S',
    'Address Type': 'P2PKH',
    'HD Path': 'm/44/666/0/0/0'
  },
  {
    'Account Name': '钱包 1',
    'Blockchain Type': 'Bitcoin',
    Network: 'testnet',
    Address: 'tb1qt3km5chpmh3gz4cmad6egqkj3tpwwyw93muzsa',
    'Address Type': 'P2WPKH',
    'HD Path': 'm/44/666/0/0/0'
  },
  {
    'Account Name': '钱包 1',
    'Blockchain Type': 'Dash',
    Network: 'mainnet',
    Address: 'yUkATtfHmMw87JPd7oekwfWuk8abXQaTu3',
    'Address Type': 'P2PKH',
    'HD Path': 'm/44/666/0/0/0'
  },
  {
    'Account Name': '钱包 1',
    'Blockchain Type': 'TRON',
    Network: 'testnet',
    Address: 'TV7PEemMu6oB4MuZN49YJrYtCdrneUxAHo',
    'Address Type': 'DEFAULT',
    'HD Path': 'm/44/666/0/0/0'
  },
  {
    'Account Name': '钱包 2',
    'Blockchain Type': 'EVM',
    Network: 'mainnet',
    Address: '0x250C14604742C5759d1ce50ccbFc1C3A904314AC',
    'Address Type': 'DEFAULT',
    'HD Path': 'm/44/666/1/0/0'
  }
]

test('csv string to array', () => {
  const arr = csvParse(csvStrWithWhitespace)
  expect(arr).toMatchObject(csvArr)
})

test('array to csv string', () => {
  const str = csvStringify(csvArr)
  expect(str).toEqual(csvStr)
})

test('array to csv string should escape formula-like values', () => {
  const str = csvStringify([
    {
      'Account Name': '=cmd',
      'Blockchain Type': '+SUM(A1:A2)',
      Network: '-mainnet',
      Address: '@evil',
      'Address Type': 'DEFAULT',
      'HD Path': 'm/44/666/0/0/0'
    }
  ])

  expect(str).toEqual(`Account Name,Blockchain Type,Network,Address,Address Type,HD Path
'=cmd,'+SUM(A1:A2),'-mainnet,'@evil,DEFAULT,m/44/666/0/0/0
`)
})

test('the csv string in the wrong format should report an error', () => {
  expect(() => csvParse(invalidFormatCsvStr)).toThrowError(MissDataError)
})

test('the missing required field csv string should report an error', () => {
  expect(() => csvParse(missRequiredFieldCsvStr)).toThrowError(MissRequiredFieldError)
  expect(() => csvParse(missRequiredFieldCsvStr)).toThrowError('HD Path')
})

test('the unsupport chaincode value csv string should report an error', () => {
  expect(() => csvParse(unsupportBlockchainCsvStr)).toThrowError(UnsupportBlockChainError)
  expect(() => csvParse(unsupportBlockchainCsvStr)).toThrowError('Cosmos | Kcc')
})

describe('sanitizeCsvValue', () => {
  test('returns non-string values as-is', () => {
    expect(sanitizeCsvValue(123)).toBe(123)
    expect(sanitizeCsvValue(null)).toBe(null)
    expect(sanitizeCsvValue(undefined)).toBe(undefined)
    expect(sanitizeCsvValue('')).toBe('')
  })

  test('prefixes formula-like strings with single quote', () => {
    expect(sanitizeCsvValue('=cmd')).toBe("'=cmd")
    expect(sanitizeCsvValue('+SUM(A1)')).toBe("'+SUM(A1)")
    expect(sanitizeCsvValue('-data')).toBe("'-data")
    expect(sanitizeCsvValue('@evil')).toBe("'@evil")
    expect(sanitizeCsvValue('\tevil')).toBe("'\tevil")
    expect(sanitizeCsvValue('\revil')).toBe("'\revil")
  })

  test('returns normal strings unchanged', () => {
    expect(sanitizeCsvValue('hello')).toBe('hello')
    expect(sanitizeCsvValue('m/44/666/0/0/0')).toBe('m/44/666/0/0/0')
    expect(sanitizeCsvValue('Bitcoin')).toBe('Bitcoin')
  })
})
