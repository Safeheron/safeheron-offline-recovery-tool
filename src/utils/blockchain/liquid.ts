import { LiquidSDK } from '@/wasm/liquidSDK'

const derivedAddress = (pubhex: string) => {
  const p2pkhMainnet = LiquidSDK.instance.addressFromPublicKey({
    public_key: pubhex,
    network: 'liquid_mainnet',
    address_type: 'P2PKH',
  })

  const p2pwkhMainnet = LiquidSDK.instance.addressFromPublicKey({
    public_key: pubhex,
    network: 'liquid_mainnet',
    address_type: 'P2WPKH',
  })

  const p2pkhTestnet = LiquidSDK.instance.addressFromPublicKey({
    public_key: pubhex,
    network: 'liquid_testnet',
    address_type: 'P2PKH',
  })

  const p2wpkhTestnet = LiquidSDK.instance.addressFromPublicKey({
    public_key: pubhex,
    network: 'liquid_testnet',
    address_type: 'P2WPKH',
  })

  return [p2pkhTestnet, p2pkhMainnet, p2wpkhTestnet, p2pwkhMainnet]
}

export default {
  derivedAddress,
}
