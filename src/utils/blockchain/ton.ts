import { WalletContractV4 } from '@ton/ton'

function derivedAddress(publicKey: string) {
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: Buffer.from(publicKey, 'hex'),
  })
  const mainnet = wallet.address.toString({ testOnly: false, bounceable: false })
  const testnet = wallet.address.toString({ testOnly: true, bounceable: false })
  return [mainnet, testnet]
}

export default { derivedAddress }
