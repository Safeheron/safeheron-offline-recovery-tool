import { describe, expect, test } from '@jest/globals'

import { isDev } from '../utils/env'

describe('isDev', () => {
  test('is a boolean', () => {
    expect(typeof isDev).toBe('boolean')
  })

  test('is true in test environment', () => {
    // NODE_ENV is "test" in jest, which is not "production", so isDev should be true
    expect(isDev).toBe(true)
  })
})
