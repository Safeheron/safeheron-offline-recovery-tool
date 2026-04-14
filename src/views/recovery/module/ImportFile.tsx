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
  onComplete: (arr: any[], largeFilePath?: string, isJsonSource?: boolean, jsonMappingPath?: string) => void
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
  // Tracks ALL temp files (sorted CSV + mapping sidecar) so nothing leaks.
  const tempPathsRef = useRef<string[]>([])

  const cleanupCurrentTempFiles = () => {
    const stale = tempPathsRef.current
    tempPathsRef.current = []
    stale.forEach(p => removeTempFile(p).catch(console.error))
  }

  useEffect(() => () => cleanupCurrentTempFiles(), [])

  const handleChange = async (rawFile: FileInfo) => {
    cleanupCurrentTempFiles()
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
      tempPathsRef.current = [tempPath]

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
        const { tempPath, mappingPath } = await writeTempCsv(arr)
        tempPathsRef.current = [tempPath, mappingPath]
        setValidatedLargeFile(true)
        setIsJsonSource(true)
        setFile({ ...rawFile, path: tempPath, isLargeFile: true, jsonMappingPath: mappingPath })
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

  const writeTempCsv = async (rows: RawCSVRow[]): Promise<{ tempPath: string; mappingPath: string }> => {
    const tempPath = await getTempPath()
    // __sourceIdx: preserves the row's position in the original JSON expansion so the
    // final output (post-derive) can be restored to source order. Rows are sorted by
    // (algo, parentPath) below to maximize worker parentKeyCache hit rate during derive
    // (without this, each of the ~2.37M rows triggers a fresh ~50ms parent derive —
    // see Oblong/O-2603 perf analysis).
    const CSV_COLUMNS = [
      CSV_FIELD_BLOCKCHAIN,
      CSV_FIELD_NETWORK,
      CSV_FIELD_ADDRESS,
      CSV_FIELD_ADDR_TYPE,
      CSV_REQUIRED_FIELD,
      CSV_FIELD_ALGO,
    ]

    // --- Sort rows by (algo, parentPath, lastIndex) to maximize cache effectiveness ---
    // Three-level sort:
    //   1. algo groups use their own HDKey instance, so sharing within algo only.
    //   2. parentPath (HD path minus last segment) — same parent means same cached parent key.
    //   3. lastIndex (last HD segment as integer) — groups same fullPath rows together so
    //      the childKey cache in recoverDerivedCSV gets hit for all but the first occurrence;
    //      when lastIndex differs within a parentPath group, the parentKey cache then takes
    //      over for the child miss, saving 5 of the 6 CKDs.
    const indexed = rows.map((row, i) => {
      const rec = row as unknown as Record<string, string>
      const hdPath = rec[CSV_REQUIRED_FIELD] || ''
      const lastSlash = hdPath.lastIndexOf('/')
      const parentPath = lastSlash >= 0 ? hdPath.slice(0, lastSlash) : hdPath
      const lastIndex = lastSlash >= 0 ? parseInt(hdPath.slice(lastSlash + 1), 10) : 0
      const algo = rec[CSV_FIELD_ALGO] || ''
      return {
        row,
        sourceIdx: i,
        algo,
        parentPath,
        lastIndex: Number.isFinite(lastIndex) ? lastIndex : 0,
      }
    })
    indexed.sort((a, b) => {
      if (a.algo !== b.algo) return a.algo < b.algo ? -1 : 1
      if (a.parentPath !== b.parentPath) return a.parentPath < b.parentPath ? -1 : 1
      return a.lastIndex - b.lastIndex
    })

    const header = `${CSV_COLUMNS.join(',')}\n`
    await writeFileChunk(tempPath, header, false)

    // Write sorted CSV + sidecar mapping file (sourceIdx per line).
    // The mapping file records each sorted row's original position so
    // restoreSourceOrder can reorder without polluting the CSV schema.
    const mappingPath = await getTempPath()
    await writeFileChunk(mappingPath, '', false)
    const CHUNK_ROWS = 5000
    for (let i = 0; i < indexed.length; i += CHUNK_ROWS) {
      const slice = indexed.slice(i, i + CHUNK_ROWS)
      const csvChunk = `${slice
        .map(({ row }) => {
          const rec = row as unknown as Record<string, string>
          return CSV_COLUMNS
            .map(col => escapeCsvField(String(sanitizeCsvValue(rec[col] ?? ''))))
            .join(',')
        })
        .join('\n')}\n`
      const mapChunk = `${slice.map(({ sourceIdx }) => sourceIdx).join('\n')}\n`
      // eslint-disable-next-line no-await-in-loop
      await writeFileChunk(tempPath, csvChunk, true)
      // eslint-disable-next-line no-await-in-loop
      await writeFileChunk(mappingPath, mapChunk, true)
    }

    return { tempPath, mappingPath }
  }

  const handleSubmit = () => {
    if (validatedLargeFile && file) {
      // Ownership of the temp files transfers to ExportKey via data.largeFilePath
      // (and data.jsonMappingPath). Clear the ref so unmount cleanup doesn't
      // delete files still in use.
      tempPathsRef.current = []
      onComplete([], file.path, isJsonSource, file.jsonMappingPath)
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
