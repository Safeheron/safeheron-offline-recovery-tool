/**
 * @jest-environment node
 */
import { expect, test } from '@jest/globals'

import { parseAmount } from '../utils'

test('correct amount of conversion', () => {
  const val = parseAmount(10, 4)
  const expected = 10 * 10 ** 4
  expect(Number(val)).toEqual(expected)
})
