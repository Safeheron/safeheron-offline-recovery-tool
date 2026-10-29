/**
 * @jest-environment node
 */
import { expect, test, describe, beforeAll, afterAll, beforeEach, jest } from '@jest/globals'

import { transfer, ftTransfer } from '../near'

test('transfer near', async () => {
  await expect(transfer({
    sender: '66172aa3b70d34d2e44e668a116bf589753b29c86661976d3453ebae2618abd3',
    receiver: 'acb784b2b902e5ef86643df690321bf42f614b3049777c19bc5fa3dd299cd67c',
    amount: '0.00001',
    privateKey: 'c9daab8ec87efae4a4a56d778343545bf50e70c936a53e3100a9d16ae27d0c09',
    network: 'testnet',
  })).resolves.not.toThrow()
})

test('transfer ty token', async () => {
  await expect(ftTransfer({
    sender: '66172aa3b70d34d2e44e668a116bf589753b29c86661976d3453ebae2618abd3',
    receiver: 'acb784b2b902e5ef86643df690321bf42f614b3049777c19bc5fa3dd299cd67c',
    amount: '0.000000001',
    privateKey: 'c9daab8ec87efae4a4a56d778343545bf50e70c936a53e3100a9d16ae27d0c09',
    network: 'testnet',
    ftoken: 'ty.tokens.testnet',
  })).resolves.not.toThrow()
})

// Offline cases: connect() and Contract are replaced by an in-memory token
// contract; the real implementations are restored afterwards.
jest.mock('near-api-js', () => {
  const actual = jest.requireActual('near-api-js')
  return { ...actual, connect: jest.fn(actual.connect), Contract: jest.fn((...a) => new actual.Contract(...a)) }
})

describe('NEAR storage deposit offline', () => {
  const nearAPI = require('near-api-js')
  const actual = jest.requireActual('near-api-js')
  const near = nearAPI.utils.format.parseNearAmount
  const cfg = {
    sender: 'a.testnet',
    receiver: 'b.testnet',
    amount: '1',
    network: 'testnet',
    ftoken: 't.testnet',
    privateKey: 'c9daab8ec87efae4a4a56d778343545bf50e70c936a53e3100a9d16ae27d0c09',
  }
  const calls = []
  const contract = {
    min: null,
    registered: false,
    storage_balance_of: async () => (contract.registered ? { total: '1' } : null),
    ft_metadata: async () => ({ decimals: 6 }),
    storage_balance_bounds: async () => ({ min: contract.min, max: contract.min }),
    storage_deposit: async o => calls.push(['storage_deposit', o.amount]),
    ft_transfer: async o => calls.push(['ft_transfer', o.args.amount]),
  }

  beforeAll(() => {
    nearAPI.connect.mockResolvedValue({ account: () => ({}) })
    nearAPI.Contract.mockImplementation(() => contract)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterAll(() => {
    nearAPI.connect.mockImplementation(actual.connect)
    nearAPI.Contract.mockImplementation((...a) => new actual.Contract(...a))
    jest.restoreAllMocks()
  })
  beforeEach(() => {
    calls.length = 0
    contract.registered = false
  })

  test.each([
    ['100 NEAR', near('100'), /above the 0.1 NEAR limit/],
    ['just above the cap', near('0.100001'), /above the 0.1 NEAR limit/],
    ['not a number', 'abc', /invalid storage deposit/],
  ])('deposit minimum of %s is refused and nothing is sent', async (_, min, err) => {
    contract.min = min
    await expect(ftTransfer({ ...cfg, confirm: async () => true })).rejects.toThrow(err)
    expect(calls).toEqual([])
  })

  test('deposit at the cap is paid after the user confirms, then the token moves', async () => {
    contract.min = near('0.1')
    const confirm = jest.fn().mockResolvedValue(true)
    await ftTransfer({ ...cfg, confirm })
    expect(confirm.mock.calls[0][0]).toMatch(/0.1 NEAR/)
    expect(calls).toEqual([['storage_deposit', near('0.1')], ['ft_transfer', '1000000']])
  })

  test('declining the deposit sends nothing', async () => {
    contract.min = near('0.00125')
    await expect(ftTransfer({ ...cfg, confirm: async () => false })).rejects.toThrow(/declined/)
    expect(calls).toEqual([])
  })

  test('a registered receiver needs no deposit', async () => {
    contract.registered = true
    await ftTransfer({ ...cfg, confirm: async () => true })
    expect(calls).toEqual([['ft_transfer', '1000000']])
  })
})
