export const CSV_REQUIRED_FIELD = 'HD Path'
export const CSV_FIELD_BLOCKCHAIN = 'Blockchain Type'
export const CSV_FIELD_NETWORK = 'Network'
export const CSV_FIELD_ADDRESS = 'Address'
export const CSV_FIELD_PRIVATE_KEY = 'Private Key'
export const CSV_FIELD_PUBLIC_KEY = 'Public Key'
export const CSV_FIELD_ALGO = 'Algorithm'

export const EVM_CHAIN = 'EVM'
export const BITCOIN_CHAIN = 'Bitcoin'
export const BITCOIN_CASH_CHAIN = 'Bitcoin Cash'
export const DASH_CHAIN = 'Dash'
export const TRON_CHAIN = 'TRON'
export const NEAR_CHAIN = 'NEAR'
export const FIL_CHAIN = 'Filecoin'
export const SUI_CHAIN = 'Sui'
export const APTOS_CHAIN = 'Aptos'

export const SUPPORTED_BLOCKCHAIN = [EVM_CHAIN, BITCOIN_CHAIN, BITCOIN_CASH_CHAIN, DASH_CHAIN, TRON_CHAIN, NEAR_CHAIN, FIL_CHAIN, SUI_CHAIN, APTOS_CHAIN] as const

export type SUPPORTED_BLOCKCHAIN_TYPE = typeof SUPPORTED_BLOCKCHAIN[number]
