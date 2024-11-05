export const CSV_REQUIRED_FIELD = 'HD Path'
export const CSV_FIELD_BLOCKCHAIN = 'Blockchain Type'
export const CSV_FIELD_NETWORK = 'Network'
export const CSV_FIELD_ADDRESS = 'Address'
export const CSV_FIELD_PRIVATE_KEY = 'Private Key'
export const CSV_FIELD_PUBLIC_KEY = 'Public Key'
export const CSV_FIELD_ALGO = 'Algorithm'

export const EVM_CHAIN = 'evm'
export const BITCOIN_CHAIN = 'bitcoin'
export const BITCOIN_TEST_CHAIN = 'bitcoin testnet'
export const BITCOIN_CASH_CHAIN = 'bitcoin cash'
export const DASH_CHAIN = 'dash'
export const TRON_CHAIN = 'tron'
export const NEAR_CHAIN = 'near'
export const FIL_CHAIN = 'filecoin'
export const SUI_CHAIN = 'sui'
export const APTOS_CHAIN = 'aptos'
export const SOLANA_CHAIN = 'solana'
export const TON_CHAIN = 'ton'
export const TON_TEST_CHAIN = 'ton_testnet'

export const SUPPORTED_BLOCKCHAIN = [EVM_CHAIN, BITCOIN_CHAIN, BITCOIN_TEST_CHAIN, BITCOIN_CASH_CHAIN, DASH_CHAIN, TRON_CHAIN, NEAR_CHAIN, FIL_CHAIN, SUI_CHAIN, APTOS_CHAIN, SOLANA_CHAIN, TON_CHAIN, TON_TEST_CHAIN] as const

export type SUPPORTED_BLOCKCHAIN_TYPE = typeof SUPPORTED_BLOCKCHAIN[number]
