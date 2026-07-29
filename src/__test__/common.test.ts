import { expect, test, describe } from '@jest/globals'

import { sleep, padToLength, safeJSONParse } from '../utils/common'

describe('sleep', () => {
  test('resolves after the specified time', async () => {
    const start = Date.now()
    await sleep(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })

  test('returns a Promise', () => {
    const result = sleep(0)
    expect(result).toBeInstanceOf(Promise)
  })
})

describe('padToLength', () => {
  test('pads "1a" to 32 bytes (64 hex chars) with leading zeros', () => {
    const result = padToLength('1a', 32)
    expect(result).toHaveLength(64)
    expect(result).toBe(`${'0'.repeat(62)}1a`)
  })

  test('returns string unchanged if already correct length', () => {
    const input = 'a'.repeat(64)
    const result = padToLength(input, 32)
    expect(result).toBe(input)
  })

  test('pads single char "f" to 4 bytes', () => {
    const result = padToLength('f', 4)
    expect(result).toBe('0000000f')
  })
})

describe('safeJSONParse', () => {
  test('parses valid JSON', () => {
    expect(safeJSONParse('{"a":1}')).toEqual({ a: 1 })
    expect(safeJSONParse('[1,2,3]')).toEqual([1, 2, 3])
    expect(safeJSONParse('"hello"')).toBe('hello')
  })

  test('returns default value for invalid JSON', () => {
    expect(safeJSONParse('not json', [])).toEqual([])
    expect(safeJSONParse('{broken', 'fallback')).toBe('fallback')
  })

  test('returns empty object when no default provided and JSON is invalid', () => {
    expect(safeJSONParse('not json')).toEqual({})
  })
})
