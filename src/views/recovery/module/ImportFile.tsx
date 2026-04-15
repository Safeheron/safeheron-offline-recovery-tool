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
} from '@/utils/csv'
import { convertJsonBackupToRows, computeJsonRowCount, expandSortedJsonToTempCsv } from '@/utils/jsonBackup'
import { useTranslation } from '@/i18n'
import { RawCSVRow } from '@/utils/mpc'
import { readFileChunk, getTempPath, copyFile, getFileSize, removeTempFile, CHUNK_READ_SIZE, LARGE_FILE_THRESHOLD } from '@/utils/tauriFileIO'
import { parseCsvHeader, parseCsvLine, splitCsvLines } from '@/utils/csvLineParser'

const JSON_LARGE_ROW_THRESHOLD = 10000

interface Props {
  next: () => void
  onComplete: (arr: any[], largeFilePath?: string, isJsonSource?: boolean, jsonMappingPath?: string, originalFile?: { name: string; path: string }) => void
  originalFile?: { name: string; path: string }
}
const ImportFile: FC<Props> = ({ next, onComplete, originalFile }) => {
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
  // Original file path on disk (before preloadLargeCsv replaces file.path with a temp copy).
  // Used by handleSubmit to build originalFile for auto-import after network abort.
  const originalDiskPathRef = useRef('')

  const cleanupCurrentTempFiles = () => {
    const stale = tempPathsRef.current
    tempPathsRef.current = []
    stale.forEach(p => removeTempFile(p).catch(console.error))
  }

  useEffect(() => () => cleanupCurrentTempFiles(), [])

  // After a network abort, re-import the previously selected file automatically
  useEffect(() => {
    if (originalFile && !file) {
      (async () => {
        try {
          const { name, path } = originalFile
          const size = await getFileSize(path)
          const isLarge = size > LARGE_FILE_THRESHOLD
          let text = ''
          if (!isLarge) {
            const { text: content } = await readFileChunk(path, 0, size)
            text = content
          }
          const rawFile: FileInfo = { name, text, path, isLargeFile: isLarge }
          handleChange(rawFile)
        } catch (err) {
          console.error('[AUTO-IMPORT] Failed to re-import original file:', err)
        }
      })()
    }
  }, [])

  const handleChange = async (rawFile: FileInfo) => {
    cleanupCurrentTempFiles()
    setFile(rawFile)
    originalDiskPathRef.current = rawFile.path
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
      const totalRows = computeJsonRowCount(rawFile.text)

      if (totalRows > JSON_LARGE_ROW_THRESHOLD) {
        // Only validate here — defer the heavy expand+sort to handleSubmit
        // so the file selection is instant.
        setValidatedLargeFile(true)
        setIsJsonSource(true)
        setCsvArr([])
        setErrMsg('')
      } else {
        const arr = convertJsonBackupToRows(rawFile.text)
        setCsvArr(arr)
        setErrMsg('')
      }
    } catch (err) {
      console.error('[RECOVER IMPORT JSON ERROR]:', err)
      const msg = t('Recovery.ImportFile.error.default')
      setErrMsg(msg)
    }
  }

  const handleSubmit = async () => {
    // originalFile always uses the real disk path (not a temp copy) so auto-import
    // after network abort can re-read from the user's original file.
    const origFile = { name: file?.name || '', path: originalDiskPathRef.current }

    if (validatedLargeFile && file) {
      // Large JSON: expand + sort now (deferred from file selection for UX)
      if (isJsonSource) {
        setImporting(true)
        try {
          const { tempPath, mappingPath } = await expandSortedJsonToTempCsv(file.text)
          // Clear ref BEFORE onComplete+next — ownership transfers to ExportKey.
          // If we leave them in tempPathsRef, the unmount cleanup would delete them.
          tempPathsRef.current = []
          onComplete([], tempPath, true, mappingPath, origFile)
        } catch (err) {
          console.error('[RECOVER IMPORT JSON ERROR]:', err)
          setErrMsg(t('Recovery.ImportFile.error.default'))
          setImporting(false)
          return
        }
      } else {
        // Large CSV: temp file already created during selection
        tempPathsRef.current = []
        onComplete([], file.path, false, file.jsonMappingPath, origFile)
      }
    } else if (file) {
      if (!csvArr) return
      onComplete(csvArr, undefined, undefined, undefined, origFile)
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
