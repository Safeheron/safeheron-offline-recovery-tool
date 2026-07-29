import { expect, test, describe } from '@jest/globals'

import { mnemonicVerfiy, handleFourCharMnemonic } from '../utils/mnemonic'

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}))

describe('mnemonicVerfiy', () => {
  test('returns error key for empty array', () => {
    expect(mnemonicVerfiy([])).toBe('Recovery.Mnemonic.required')
  })

  test('returns error key for array with invalid words', () => {
    const words = Array(24).fill('zzzznotaword')
    expect(mnemonicVerfiy(words)).toBe('Recovery.Mnemonic.illega')
  })

  test('returns error key for array that is not 24 words long', () => {
    const words = Array(12).fill('abandon')
    expect(mnemonicVerfiy(words)).toBe('Recovery.Mnemonic.error')
  })

  test('returns empty string for valid 24-word mnemonic', () => {
    const words = Array(23).fill('abandon').concat('art')
    expect(mnemonicVerfiy(words)).toBe('')
  })
})

describe('handleFourCharMnemonic', () => {
  test('expands 4-char prefix to full word', () => {
    const result = handleFourCharMnemonic(['aban'])
    expect(result).toEqual(['abandon'])
  })

  test('keeps full words unchanged', () => {
    const result = handleFourCharMnemonic(['abandon', 'art'])
    expect(result).toEqual(['abandon', 'art'])
  })

  test('keeps 4-char string unchanged if no match', () => {
    const result = handleFourCharMnemonic(['zzzz'])
    expect(result).toEqual(['zzzz'])
  })
})
