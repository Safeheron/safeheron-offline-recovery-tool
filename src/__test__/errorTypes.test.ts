import { describe, expect, test } from '@jest/globals'

import * as errorTypes from '../utils/errorTypes'
import * as csv from '../utils/csv'
import { recoverHDKeyFromMnemonics, recoverDerivedCSV } from '../utils/mpc'
import * as mpc from '../utils/mpc'
import type { RawCSVRow } from '../utils/mpc'
import { LiquidSDKError } from '../wasm/liquidSDK'

const mnemonics = [
  'source pistol cable finish account glide aware escape extend guilt assist corn camera pen crash avocado economy betray blouse planet negative labor vote zoo',
  'vivid sadness color between damage chaos tobacco gasp gorilla divert where vintage income surprise only abstract decline shine clay push supply endorse luggage wild',
  'inherit wage uphold lion clog fire heart crash detect sad invest bonus entire immense begin youth perfect lawsuit announce sorry black kitchen item lucky'
]
const chaincode = '1d59b896d3878849efb1c5935866ff75b3db7c3e7e14b4d4d31f06761d121d47'

describe('error class identity survives the re-export', () => {
  test('same constructor object through every import path', () => {
    expect(mpc.ValidateAddressError).toBe(errorTypes.ValidateAddressError)
    expect(csv.MissDataError).toBe(errorTypes.MissDataError)
    expect(csv.MissRequiredFieldError).toBe(errorTypes.MissRequiredFieldError)
    expect(csv.UnsupportBlockChainError).toBe(errorTypes.UnsupportBlockChainError)
    expect(LiquidSDKError).toBe(errorTypes.LiquidSDKError)
  })

  test('real mpc throw matches the class the UI now imports', () => {
    const hdKey = recoverHDKeyFromMnemonics(mnemonics, chaincode)
    const rows: RawCSVRow[] = [{
      'HD Path': 'm/44/666/0/0/0',
      'Blockchain Type': 'EVM',
      Network: 'mainnet',
      Address: '0x0000000000000000000000000000000000000000',
      'Address Type': 'DEFAULT',
      Algorithm: 'secp256k1',
    }]
    // the UI checks `instanceof` against errorTypes', mpc.ts throws its own binding
    expect(() => recoverDerivedCSV(rows, hdKey)).toThrow(errorTypes.ValidateAddressError)
  })

  test('names and messages unchanged', () => {
    expect(new errorTypes.LiquidSDKError('boom').name).toBe('LiquidSDKError')
    expect(new errorTypes.LiquidSDKError('boom').message).toBe('boom')
    expect(new errorTypes.MissDataError().name).toBe('Error')
    expect(new errorTypes.ValidateAddressError('x')).toBeInstanceOf(Error)
  })
})
