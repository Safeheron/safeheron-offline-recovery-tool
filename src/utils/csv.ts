/* eslint-disable max-classes-per-file */
/* eslint-disable import/no-unresolved */
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'

import {
  CSV_REQUIRED_FIELD,
  CSV_FIELD_BLOCKCHAIN,
  CSV_FIELD_NETWORK,
  CSV_FIELD_ADDRESS,
  SUPPORTED_BLOCKCHAIN
} from './const'

const requiredFields = [
  CSV_REQUIRED_FIELD,
  CSV_FIELD_BLOCKCHAIN,
  CSV_FIELD_NETWORK,
  CSV_FIELD_ADDRESS,
]

export class MissDataError extends Error {}

export class MissRequiredFieldError extends Error {}

export class UnsupportBlockChainError extends Error {}

export function csvParse<T>(csvStr: string): T[] {
  const parsedData = parse(csvStr, {
    columns: true,
  })

  if (!parsedData || parsedData.length === 0) {
    throw new MissDataError()
  }

  const allMissRequiredFields = new Set()
  const unsupportBlockChain = new Set()
  for (let i = 0, len = parsedData.length; i < len; i++) {
    const item = parsedData[i]
    const missFields = requiredFields.filter(field => {
      if (field === CSV_FIELD_BLOCKCHAIN) {
        const blockchain = item[field]
        const valid = SUPPORTED_BLOCKCHAIN.includes(blockchain)
        if (!valid) {
          unsupportBlockChain.add(blockchain)
        }
      }
      return !item[field]
    })
    missFields.forEach(field => allMissRequiredFields.add(field))
  }

  if (allMissRequiredFields.size > 0) {
    throw new MissRequiredFieldError([...allMissRequiredFields].join(' | '))
  }

  if (unsupportBlockChain.size > 0) {
    throw new UnsupportBlockChainError([...unsupportBlockChain].join(' | '))
  }

  return parsedData
}

export function csvStringify<T>(csvArr: T[]): string {
  return stringify(csvArr, {
    header: true,
  })
}
