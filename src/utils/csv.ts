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

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/

function sanitizeCsvValue(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) {
    return value
  }

  return CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value
}

export function csvParse<T>(csvStr: string): T[] {
  const parsedData = parse(csvStr, {
    columns: true,
    trim: true,
    skip_empty_lines: true,
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
        const normalizedBlockchain = blockchain?.toLowerCase?.()
        const valid = SUPPORTED_BLOCKCHAIN.includes(normalizedBlockchain)
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
  const sanitizedRows = csvArr.map(row => (
    Object.fromEntries(
      Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, sanitizeCsvValue(value)])
    )
  ))

  return stringify(sanitizedRows, {
    header: true,
  })
}
