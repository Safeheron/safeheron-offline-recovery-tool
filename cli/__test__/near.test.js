/**
 * @jest-environment node
 */
import { expect, test } from '@jest/globals'

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
