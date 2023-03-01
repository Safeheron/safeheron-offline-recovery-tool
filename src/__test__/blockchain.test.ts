/**
 * Buffer is not instanceof Uint8Array in the jsdom environment, so set node environment for this file
 * @jest-environment node
 */
import { expect, test } from '@jest/globals'

import blockchainUtil from '../utils/blockchain/index'

import wifFixtures from './wifFixtures.json'

interface WifFixturesItem{
  privateKeyHex: string
  mainnet: boolean
  WIF?: string
  exception?: boolean
}

test('Bitcoin private key WIF encode', () => {
  const wifFunc = blockchainUtil.bitcoin.wifEncodePrivateKey
  for (const fixturesItem of wifFixtures as WifFixturesItem[]) {
    const wifFuncWrap = wifFunc.bind(null, fixturesItem.privateKeyHex, fixturesItem.mainnet)
    if ('exception' in fixturesItem) {
      expect(wifFuncWrap).toThrow(fixturesItem.exception)
    } else {
      const result = wifFuncWrap()
      expect(result).toEqual(fixturesItem.WIF)
    }
  }
})

test('Bitcoin address derived', () => {
  const compressedPubKeyHes = '03f732e87af2a1037204a445ad620eda852258fac9afcfee5b39b7fb5224f183e0'
  const expectedDerivedAddressList = [
    'mki1qeY7QxVnxgXLTs2Z34HEAXH9BMrm83',
    'tb1q8rcznk393g87ar6sdle5pwhn8mn899qvgzfgta',
    'bc1q8rcznk393g87ar6sdle5pwhn8mn899qvzyjmsw',
    '16C4YbT8bw4YBa3ikJ4BD94uJXgSFg8wY2'
  ]

  const derivedAddress = blockchainUtil.bitcoin.derivedAddress(compressedPubKeyHes)

  expect(derivedAddress.sort()).toEqual(expectedDerivedAddressList.sort())
})

test('Ethereum address derive', () => {
  const data = [
    {
      // Compressed public key
      pubkeyHex: '03af526cd9bd51326d52fc11b1be1e77d77145195c7e2b63a007817b0a96d1fc8b',
      address: '0x30d02ace2633a2e41e04634c805b6b3f95fa3643'
    },
    {
      // Uncompressed public key
      pubkeyHex: '0x0476698beebe8ee5c74d8cc50ab84ac301ee8f10af6f28d0ffd6adf4d6d3b9b762d46ca56d3dad2ce13213a6f42278dabbb53259f2d92681ea6a0b98197a719be3',
      address: '0x0Ac1dF02185025F65202660F8167210A80dD5086'
    }
  ]

  data.forEach(d => {
    const derivedAddress = blockchainUtil.ethereum.derivedAddress(d.pubkeyHex)
    expect(derivedAddress.sort().map(v => v.toLowerCase())).toContain(d.address.toLowerCase())
  })
})

test('Bitcoincash address derive', () => {
  const data = {
    pubkeyHex: '02b23dba0d3a5348696f157d956fb59ac58f899e7921de383ba75215feba84a16d',
    legacyAddress: '1HcJ1qTc4W6LkaYLGFAkPEMxCcN1taXXWv',
    cashAddress: 'bitcoincash:qzmza33vgl6hnfuxcv8ml0msfh3vx59g5y5zqaq22w',
  }
  const [legacyAddress, cashAddress] = blockchainUtil.bitcoincash.derivedAddress(data.pubkeyHex)
  expect(legacyAddress).toEqual(data.legacyAddress)
  expect(cashAddress).toEqual(data.cashAddress)
})

test('Dash address derive', () => {
  const data = [
    {
      // Compressed public key
      pubkeyHex: '0393CAA497EC04F73D3043CE13F8B27C115E9D4C2F7500B6235740B63133CC0953',
      address: 'Xs1RYG2ZLApztVVxtLr6YeZujaFJJ2GSap',
      testnetAddr: 'yce2ZD6zmiV5EERWTCAVafzG1rjfkz5oQm',
    },
    {
      // Uncompressed public key
      pubkeyHex: '0493CAA497EC04F73D3043CE13F8B27C115E9D4C2F7500B6235740B63133CC095351ACB86CC7BF1DBAE592B7271A9EA836B502903675ABBC3CE72BC14635FE6FB1',
      address: 'XiQqShi5sbGKSq3Wyq2jHLyMcs8frhXJEE',
      testnetAddr: 'yU3STenXK8vPnZy4YgM8KNPhu9d3PGpDVg',
    },
  ]
  data.forEach(d => {
    const [mainnetAddr, testnetAddr] = blockchainUtil.dash.derivedAddress(d.pubkeyHex)
    expect(mainnetAddr).toEqual(d.address)
    expect(testnetAddr).toEqual(d.testnetAddr)
  })
})

test('Tron address derive', () => {
  const data = {
    pubkeyHex: '0404B604296010A55D40000B798EE8454ECCC1F8900E70B1ADF47C9887625D8BAE3866351A6FA0B5370623268410D33D345F63344121455849C9C28F9389ED9731',
    address: 'TDpBe64DqirkKWj6HWuR1pWgmnhw2wDacE',
  }
  const [address] = blockchainUtil.tron.derivedAddress(data.pubkeyHex)
  expect(address).toEqual(data.address)
})

test('Filecoin address derive', () => {
  const data = {
    pubkeyHex: '043977460cd2340c0fc43946cfe2488a1139999dddc4c1b3f1d4a136c0dd3ff260f5935a3e313a1fb66a91d3c54742cb9f4f19e425661bac677969f6c58cf97cdf',
    address: 'f15nu557kaqpad5bkp5nm4rf7qvjtry2lk5cghhzy',
    testnetAddr: 't15nu557kaqpad5bkp5nm4rf7qvjtry2lk5cghhzy',
  }
  const [mainnetAddr, testnetAddr] = blockchainUtil.filecoin.derivedAddress(data.pubkeyHex)
  expect(mainnetAddr).toEqual(data.address)
  expect(testnetAddr).toEqual(data.testnetAddr)
})
