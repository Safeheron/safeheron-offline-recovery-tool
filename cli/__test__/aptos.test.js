/**
 * @jest-environment node
 */
import { expect, test } from '@jest/globals'

import { transfer, ftTransfer } from '../aptos'

test('transfer apt', async () => {
  await expect(transfer({
    receiver: '0x2dad9195a194e202ece81764b933c2769004e5ddc864dc9c3e323aa310e5e850',
    amount: '0.00001',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
    network: 'testnet',
  })).resolves.not.toThrow()
})

test('transfer apt by ftTransfer', async () => {
  await expect(ftTransfer({
    receiver: '0x2dad9195a194e202ece81764b933c2769004e5ddc864dc9c3e323aa310e5e850',
    amount: '0.00001',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
    network: 'testnet',
    ftoken: '0x1::aptos_coin::AptosCoin',
  })).resolves.not.toThrow()
})

test('transfer test token', async () => {
  await expect(ftTransfer({
    receiver: '0x2dad9195a194e202ece81764b933c2769004e5ddc864dc9c3e323aa310e5e850',
    amount: '0.00001',
    privateKey: '8393a847964461ffd5151f57fc2be3f2e95200760b523413f011cb3e34af770e',
    network: 'testnet',
    ftoken: '0x5f4ca7dc97481e48a9d84f109c1e5532d8961735809821046fc5fa27ff351298',
  })).resolves.not.toThrow()
})
