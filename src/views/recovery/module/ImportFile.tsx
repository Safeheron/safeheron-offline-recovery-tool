import { FC, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { Button } from '@/components/base'
import Upload, { FileInfo } from '@/components/Upload'
import ErrorMsg from '@/components/ErrorMsg'
import {
  csvParse,
  MissDataError,
  MissRequiredFieldError,
  UnsupportBlockChainError,
  sanitizeCsvValue,
} from '@/utils/csv'
import { convertJsonBackupToRows } from '@/utils/jsonBackup'
import { useTranslation } from '@/i18n'
import { RawCSVRow } from '@/utils/mpc'
import { readFileChunk, getTempPath, writeFileChunk, copyFile, getFileSize, removeTempFile, CHUNK_READ_SIZE } from '@/utils/tauriFileIO'
import { parseCsvHeader, parseCsvLine, escapeCsvField, splitCsvLines } from '@/utils/csvLineParser'
import {
  CSV_REQUIRED_FIELD,
  CSV_FIELD_BLOCKCHAIN,
  CSV_FIELD_NETWORK,
  CSV_FIELD_ADDRESS,
  CSV_FIELD_ADDR_TYPE,
  CSV_FIELD_ALGO,
} from '@/utils/const'

const JSON_LARGE_ROW_THRESHOLD = 10000

interface Props {
  next: () => void
  onComplete: (arr: any[], largeFilePath?: string, isJsonSource?: boolean) => void
}
const ImportFile: FC<Props> = ({ next, onComplete }) => {
  const { t } = useTranslation()
  const [file, setFile] = useState<FileInfo>()
  const [csvArr, setCsvArr] = useState<RawCSVRow[]>([])
  const [validatedLargeFile, setValidatedLargeFile] = useState(false)
  const [isJsonSource, setIsJsonSource] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [importing, setImporting] = useState(false)
  // Tracks the temp file path currently held by `file` state so we can clean
  // up when the user re-selects a different file, navigates away, or the
  // component unmounts. Only set for large CSV / large JSON paths.
  const tempPathRef = useRef('')

  const cleanupCurrentTempFile = () => {
    if (tempPathRef.current) {
      const stale = tempPathRef.current
      tempPathRef.current = ''
      removeTempFile(stale).catch(console.error)
    }
  }

  useEffect(() => () => cleanupCurrentTempFile(), [])

  const handleChange = async (rawFile: FileInfo) => {
    cleanupCurrentTempFile()
    setFile(rawFile)
    setValidatedLargeFile(false)
    setIsJsonSource(false)
    setImporting(true)

    try {
      const isJson = rawFile.path.toLowerCase().endsWith('.json')
      if (isJson) {
        await parseJsonFile(rawFile)
      } else if (rawFile.isLargeFile) {
        await preloadLargeCsv(rawFile)
      } else {
        parseCsvFile(rawFile)
      }
    } finally {
      setImporting(false)
    }
  }

  const preloadLargeCsv = async (rawFile: FileInfo) => {
    try {
      // Validate header first (read first 64KB)
      const { text: firstChunk } = await readFileChunk(rawFile.path, 0, 65536)
      const [allLines] = splitCsvLines(firstChunk)

      if (allLines.filter(l => l).length < 2) {
        setErrMsg(t('Recovery.ImportFile.error.missDataRow'))
        return
      }

      const headerLine = allLines[0]
      const header = parseCsvHeader(headerLine)

      let validated = 0
      for (let i = 1; i < allLines.length && validated < 10; i++) {
        const line = allLines[i]
        if (line) {
          parseCsvLine(line, header)
          validated++
        }
      }

      // Header valid — copy source to temp so source file is no longer needed
      const tempPath = await getTempPath()
      await copyFile(rawFile.path, tempPath)
      tempPathRef.current = tempPath

      setValidatedLargeFile(true)
      setFile({ ...rawFile, path: tempPath, isLargeFile: true })
      setCsvArr([])
      setErrMsg('')
    } catch (err) {
      console.error('[RECOVER IMPORT LARGE FILE ERROR]:', err)
      let msg
      if (err instanceof MissRequiredFieldError) {
        msg = t('Recovery.ImportFile.error.missRequiredField', {
          fields: err.message,
        })
      } else if (err instanceof UnsupportBlockChainError) {
        msg = t('Recovery.ImportFile.error.unsupportBlockChain', {
          blockchain: err.message,
        })
      } else {
        msg = t('Recovery.ImportFile.error.default')
      }
      setErrMsg(msg)
    }
  }

  const parseCsvFile = (rawFile: FileInfo) => {
    if (!rawFile) return
    try {
      const arr = csvParse<RawCSVRow>(rawFile.text)
      setCsvArr(arr)
      setErrMsg('')
    } catch (err) {
      console.error('[RECOVER IMPORT FILE ERROR]:', err)
      let msg
      if (err instanceof MissDataError) {
        msg = t('Recovery.ImportFile.error.missDataRow')
      } else if (err instanceof MissRequiredFieldError) {
        msg = t('Recovery.ImportFile.error.missRequiredField', {
          fields: err.message,
        })
      } else if (err instanceof UnsupportBlockChainError) {
        msg = t('Recovery.ImportFile.error.unsupportBlockChain', {
          blockchain: err.message,
        })
      } else {
        msg = t('Recovery.ImportFile.error.default')
      }
      setErrMsg(msg)
    }
  }

  const parseJsonFile = async (rawFile: FileInfo) => {
    if (!rawFile) return
    try {
      const arr = convertJsonBackupToRows(rawFile.text)

      if (arr.length > JSON_LARGE_ROW_THRESHOLD) {
        // Write expanded rows to temp CSV, then use streaming pipeline
        const tempPath = await writeTempCsv(arr)
        tempPathRef.current = tempPath
        setValidatedLargeFile(true)
        setIsJsonSource(true)
        setFile({ ...rawFile, path: tempPath, isLargeFile: true })
        setCsvArr([])
        setErrMsg('')
      } else {
        setCsvArr(arr)
        setErrMsg('')
      }
    } catch (err) {
      console.error('[RECOVER IMPORT JSON ERROR]:', err)
      const msg = t('Recovery.ImportFile.error.default')
      setErrMsg(msg)
    }
  }

  const writeTempCsv = async (rows: RawCSVRow[]): Promise<string> => {
    const tempPath = await getTempPath()
    const CSV_COLUMNS = [
      CSV_FIELD_BLOCKCHAIN,
      CSV_FIELD_NETWORK,
      CSV_FIELD_ADDRESS,
      CSV_FIELD_ADDR_TYPE,
      CSV_REQUIRED_FIELD,
      CSV_FIELD_ALGO,
    ]
    const header = `${CSV_COLUMNS.join(',')}\n`
    await writeFileChunk(tempPath, header, false)

    // Write in chunks to avoid large string allocation
    const CHUNK_ROWS = 5000
    for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
      const slice = rows.slice(i, i + CHUNK_ROWS)
      const chunk = `${slice
        .map(row => CSV_COLUMNS.map(col => escapeCsvField(String(sanitizeCsvValue((row as unknown as Record<string, string>)[col] ?? '')))).join(','))
        .join('\n')}\n`
      // eslint-disable-next-line no-await-in-loop
      await writeFileChunk(tempPath, chunk, true)
    }

    return tempPath
  }

  const handleSubmit = () => {
    if (validatedLargeFile && file) {
      // Ownership of the temp file transfers to ExportKey via data.largeFilePath.
      // Clear the ref so unmount cleanup doesn't delete a file still in use.
      tempPathRef.current = ''
      onComplete([], file.path, isJsonSource)
    } else {
      if (!csvArr) return
      onComplete(csvArr)
    }
    next()
  }

  const isValid = validatedLargeFile || csvArr.length > 0

  return (
    <>
      <div className="content" style={{ marginTop: 145.5 }}>
        <Title>{t('Recovery.ImportFile.title')}</Title>
        <div className="form-item" style={{ paddingBottom: 0 }}>
          <Upload file={file} onChange={handleChange} disabled={importing} />
          <ErrorMsgWrapper>
            <ErrorMsg msg={errMsg} position="static" />
          </ErrorMsgWrapper>
        </div>
      </div>
      <div className="step-buttons">
        <Button
          type="primary"
          onClick={handleSubmit}
          disabled={!file || !!errMsg || !isValid}
          loading={importing}
        >
          {t('common.next')}
        </Button>
      </div>
    </>
  )
}

const Title = styled.p`
  color: var(--color-Neutral-20);
  font-size: 16px;
  font-style: normal;
  font-weight: 500;
  line-height: normal;
  margin-bottom: 16px;
`

const ErrorMsgWrapper = styled.div`
  min-height: 40px;
`

export default ImportFile
