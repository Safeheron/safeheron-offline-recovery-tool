import { describe, expect, test } from '@jest/globals'

import { recoverHDKeyFromMnemonics } from '../utils/mpc'
import { padToLength } from '../utils/common'

const mnemonics = [
  'source pistol cable finish account glide aware escape extend guilt assist corn camera pen crash avocado economy betray blouse planet negative labor vote zoo',
  'vivid sadness color between damage chaos tobacco gasp gorilla divert where vintage income surprise only abstract decline shine clay push supply endorse luggage wild',
  'inherit wage uphold lion clog fire heart crash detect sad invest bonus entire immense begin youth perfect lawsuit announce sorry black kitchen item lucky'
]
const chaincode = '1d59b896d3878849efb1c5935866ff75b3db7c3e7e14b4d4d31f06761d121d47'
const recovery = [
  {
    path: 'm/44/666/0/0/0',
    algo: 'secp256k1',
    privateKey: '2c56bfe160a964acc8d70668b834eefba8e4e9246d51e2dac4a9c9de567d4711'
  },
  {
    path: 'm/44/666/1/0/0',
    algo: 'secp256k1',
    privateKey: 'fd9421d488352d44327597127d39adbaac5beeffc56695db1ca046e730bf8b4c'
  },
  {
    path: 'm/44/666/2/0/0',
    algo: 'secp256k1',
    privateKey: '6d6fe96e934f0fd0dfcfd7987c55e20a24b222f8918a4e5de01cb0a3ee03a99f'
  },
  {
    path: 'm/44/666/3/0/0',
    algo: 'ed25519',
    privateKey: '04c26c4bd03dcfaeb8c33b7db908f6aa95411a7e352a8e835686585fdf84cbf9'
  },
  {
    path: 'm/44/666/4/0/0',
    algo: 'ed25519',
    privateKey: '0ba412500f60bf5cf7b788c10a4230bf3fef9421d60eb3e5a710e972748231e8'
  },
  {
    path: 'm/44/666/5/0/0',
    algo: 'ed25519',
    privateKey: '09d561fc3f9996d12614daa30adfce5e278c69c9abca1fb9e7f45541f30c34b7'
  }
]

const mnemonicsV2 = [
  'turtle stone jacket logic canal thing project hub dash issue remove same beauty hospital finish brush pear hire follow dinner industry release general flock',
  'swim such enlist acoustic warm enrich weekend milk asthma pistol equip man whip hammer sponsor essence test token pudding ethics cliff light fine outdoor',
  'heavy suffer taste bag dawn furnace feed stuff shaft rally armor ginger urban anxiety split country antenna erase burst grass cricket cream broom sail'
]
const recoveryV2 = [
  {
    path: 'm/44/666/0/0/0',
    algo: 'secp256k1',
    privateKey: '4a2d52e8a7466e5b451c74944381ebcf92cf447f5ca76959a9850e18a342a4f3'
  },
  {
    path: 'm/44/666/1/0/0',
    algo: 'secp256k1',
    privateKey: 'ad284a7aae7ea805dd6fa86cd6e39296ad89c919958e2b77b36bace47e691ee8'
  },
  {
    path: 'm/44/666/2/0/0',
    algo: 'secp256k1',
    privateKey: '5d5a14e50e178aeb59bef2006ed2aa5778678ee5d042b2231f5b10d4b6f1a46b'
  },
  {
    path: 'm/44/666/3/0/0',
    algo: 'ed25519',
    privateKey: '070243ac1ae13e5861b5d58539d0bdafe0014aa3cd32a657cbf36c573cbac332'
  },
  {
    path: 'm/44/666/4/0/0',
    algo: 'ed25519',
    privateKey: '01046f634ba37ea1dd23a9b091688703206ab4573d0fd416d9cf8b6cac4b8b91'
  },
  {
    path: 'm/44/666/5/0/0',
    algo: 'ed25519',
    privateKey: '0ed9a62e23bd62ef10bcb6d64dfc053a79e9673ae4ab600923955b0077795065'
  }
]

describe('Recover HDkey from mnemonics', () => {
  test('have chaincode', () => {
    const {
      secp256k1,
      ed25519,
    } = recoverHDKeyFromMnemonics(mnemonics, chaincode)

    recovery.forEach(rItem => {
      const { algo } = rItem
      let childHDKey
      if (algo === 'secp256k1') {
        childHDKey = secp256k1.derive(rItem.path)
      } else {
        childHDKey = ed25519.derive(rItem.path)
      }
      const childPrivKeyHex = padToLength(childHDKey.privateKey.toString(16), 32)
      expect(childPrivKeyHex).toEqual(rItem.privateKey)
    })
  })
  test('no chaincode', () => {
    const {
      secp256k1,
      ed25519,
    } = recoverHDKeyFromMnemonics(mnemonicsV2)
    recoveryV2.forEach(rItem => {
      const { algo } = rItem
      let childHDKey
      if (algo === 'secp256k1') {
        childHDKey = secp256k1.derive(rItem.path)
      } else {
        childHDKey = ed25519.derive(rItem.path)
      }
      const childPrivKeyHex = padToLength(childHDKey.privateKey.toString(16), 32)
      expect(childPrivKeyHex).toEqual(rItem.privateKey)
    })
  })
})
