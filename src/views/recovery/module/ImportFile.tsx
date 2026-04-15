import { FC, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { fs } from '@tauri-apps/api'

import { Button } from '@/components/base'
import Upload, { FileInfo } from '@/components/Upload'
import ErrorMsg from '@/components/ErrorMsg'
import {
  MissRequiredFieldError,
  UnsupportBlockChainError,
} from '@/utils/csv'
import { expandSortedJsonToTempCsv } from '@/utils/jsonBackup'
import { useTranslation } from '@/i18n'
import { readFileChunk, getTempPath, copyFile, getFileSize, removeTempFile } from '@/utils/tauriFileIO'
import { parseCsvHeader, parseCsvLine, splitCsvLines } from '@/utils/csvLineParser'

interface Props {
  next: () => void
  onComplete: (tempCsvPath: string, isJsonSource: boolean, jsonMappingPath?: string, originalFile?: { name: string; path: string }) => void
  originalFile?: { name: string; path: string }
}
const ImportFile: FC<Props> = ({ next, onComplete, originalFile }) => {
  const { t } = useTranslation()
  const [file, setFile] = useState<FileInfo>()
  const [validated, setValidated] = useState(false)
  const [isJsonSource, setIsJsonSource] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [importing, setImporting] = useState(false)
  // Tracks ALL temp files (temp CSV copy / expanded CSV / mapping sidecar) so nothing leaks.
  const tempPathsRef = useRef<string[]>([])
  // Original file path on disk (before preloadCsv replaces file.path with a temp copy).
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
          const isJson = path.toLowerCase().endsWith('.json')
          const rawFile: FileInfo = isJson
            ? { name, path, text: await fs.readTextFile(path) }
            : { name, path }
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
    setValidated(false)
    setIsJsonSource(false)
    setImporting(true)

    try {
      const isJson = rawFile.path.toLowerCase().endsWith('.json')
      if (isJson) {
        setIsJsonSource(true)
        // JSON validation happens at submit time (expand is heavy).
        // For now, we only check parse-ability via a quick JSON.parse.
        try {
          JSON.parse(rawFile.text ?? '')
          setValidated(true)
          setErrMsg('')
        } catch {
          setErrMsg(t('Recovery.ImportFile.error.default'))
        }
      } else {
        await preloadCsv(rawFile)
      }
    } finally {
      setImporting(false)
    }
  }

  const preloadCsv = async (rawFile: FileInfo) => {
    try {
      const size = await getFileSize(rawFile.path)
      // Validate header first (read first 64KB)
      const { text: firstChunk } = await readFileChunk(rawFile.path, 0, Math.min(65536, size))
      const [allLines] = splitCsvLines(firstChunk)

      if (allLines.filter(l => l).length < 2) {
        setErrMsg(t('Recovery.ImportFile.error.missDataRow'))
        return
      }

      const headerLine = allLines[0]
      const header = parseCsvHeader(headerLine)

      let validatedRows = 0
      for (let i = 1; i < allLines.length && validatedRows < 10; i++) {
        const line = allLines[i]
        if (line) {
          parseCsvLine(line, header)
          validatedRows++
        }
      }

      // Header valid — copy source to temp so source file is no longer needed
      const tempPath = await getTempPath()
      await copyFile(rawFile.path, tempPath)
      tempPathsRef.current = [tempPath]

      setValidated(true)
      setFile({ ...rawFile, path: tempPath })
      setErrMsg('')
    } catch (err) {
      console.error('[RECOVER IMPORT CSV ERROR]:', err)
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

  const handleSubmit = async () => {
    if (!file || !validated) return

    // originalFile always uses the real disk path (not a temp copy) so auto-import
    // after network abort can re-read from the user's original file.
    const origFile = { name: file.name || '', path: originalDiskPathRef.current }

    if (isJsonSource) {
      setImporting(true)
      try {
        const { tempPath, mappingPath } = await expandSortedJsonToTempCsv(file.text ?? '')
        // Clear ref BEFORE onComplete+next — ownership transfers to ExportKey.
        tempPathsRef.current = []
        onComplete(tempPath, true, mappingPath, origFile)
      } catch (err) {
        console.error('[RECOVER IMPORT JSON ERROR]:', err)
        setErrMsg(t('Recovery.ImportFile.error.default'))
        setImporting(false)
        return
      }
    } else {
      // CSV: temp file already created during selection
      tempPathsRef.current = []
      onComplete(file.path, false, undefined, origFile)
    }
    next()
  }

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
          disabled={!file || !!errMsg || !validated}
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
