import { describe, expect, test } from '@jest/globals'

import { RecoverHDKeyError, NetworkDetectedError } from '../utils/errors'

describe('RecoverHDKeyError', () => {
  test('is instance of Error', () => {
    const err = new RecoverHDKeyError('bad key')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('bad key')
  })
})

describe('NetworkDetectedError', () => {
  test('is instance of Error', () => {
    const err = new NetworkDetectedError()
    expect(err).toBeInstanceOf(Error)
  })

  test('has correct message', () => {
    const err = new NetworkDetectedError()
    expect(err.message).toBe('Network detected — derive aborted')
  })

  test('has correct name', () => {
    const err = new NetworkDetectedError()
    expect(err.name).toBe('NetworkDetectedError')
  })
})
