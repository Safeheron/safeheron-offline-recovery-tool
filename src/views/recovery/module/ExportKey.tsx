import { FC, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { invoke } from '@tauri-apps/api'

import { Button } from '@/components/base'
import attentionIcon from '@img/attention.svg'
import failIcon from '@img/fail.svg'
import { sleep } from '@/utils/common'
import { MissRequiredFieldError, UnsupportBlockChainError, MissDataError } from '@/utils/csv'
import { ValidateAddressError } from '@/utils/mpc'
import { useTranslation } from '@/i18n'
import { useVersion } from '@/components/SelectVersion'
import {
  APTOS_CHAIN,
  NEAR_CHAIN,
  SOLANA_CHAIN,
  SUI_CHAIN,
  TON_CHAIN,
  TON_TEST_CHAIN,
  TON_TEST_CHAIN_ALIAS,
} from '@/utils/const'
import { streamCsvProcess, StreamProgress, RecoverHDKeyError, NetworkDetectedError } from '@/utils/streamCsv'
import { getFileSize, getTempPath, copyFile, dialogSaveFile, removeTempFile, readFileText } from '@/utils/tauriFileIO'
import { expandSortedJsonToTempCsv, InvalidFormatError, UnsupportedVersionError } from '@/utils/jsonBackup'
import { restoreSourceOrder } from '@/utils/restoreSourceOrder'

// Files under this size use a single worker (worker init overhead ~200ms
// vs near-zero derive time for small files makes multi-worker pointless).
const SINGLE_WORKER_FILE_SIZE = 5 * 1024 * 1024 // 5MB

// Progress phase splits.
// JSON: 0-10 expand, 10-85 derive, 85-99 restore, 100 done.
// CSV: 0-90 derive, 90-99 restore, 100 done.
const JSON_EXPAND_MAX = 10
const JSON_DERIVE_MAX = 85
const JSON_RESTORE_MAX = 99
const CSV_DERIVE_MAX = 90
const CSV_RESTORE_MAX = 99

export interface RecoveryItemModel {
  chainCode: string
  mnemonicList: string[]
  /** Temp copy of the user's source file (JSON or CSV) */
  sourcePath: string
  isJsonSource: boolean
  originalFile?: { name: string; path: string }
}

interface Props {
  data: RecoveryItemModel
  prev: () => void
  next: () => void
}

const ExportKey: FC<Props> = ({ data, prev, next }) => {
  const { version } = useVersion()
  const { t } = useTranslation()
  const [errMsg, setErrMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [finalTempPath, setFinalTempPath] = useState('')
  const finalTempPathRef = useRef('')
  const [ed25519Chains, setEd25519Chains] = useState<string[]>([])
  // Ref so the unmount cleanup can see the latest expanded-csv path
  // (React state updates inside exportFile wouldn't be visible in a stale closure).
  const expandedCsvPathRef = useRef('')

  useEffect(() => {
    exportPrivateKey()
    return () => {
      if (finalTempPathRef.current) removeTempFile(finalTempPathRef.current).catch(console.error)
      if (expandedCsvPathRef.current) removeTempFile(expandedCsvPathRef.current).catch(console.error)
      if (data.sourcePath) removeTempFile(data.sourcePath).catch(console.error)
    }
  }, [])

  const ed25519ChainsHasTon = ed25519Chains.some(c => {
    const lower = c.toLowerCase()
    return lower === TON_CHAIN || lower === TON_TEST_CHAIN || lower === TON_TEST_CHAIN_ALIAS
  })

  const exportPrivateKey = async () => {
    setLoading(true)
    setProgress(0)
    await sleep(0)
    await exportFile()
  }

  const exportFile = async () => {
    let derivedPath = ''
    let finalPath = ''
    const controller = new AbortController()
    const onOnline = () => controller.abort()
    window.addEventListener('online', onOnline)

    try {
      // === Phase 1: JSON expand (0-10%), skipped for CSV sources ===
      // JSON: expanded CSV has inline `<sourceIdx>\t` prefix per data row.
      let inputCsvPath = data.sourcePath
      if (data.isJsonSource) {
        // Use custom IPC readFileText (not Tauri's fs.readTextFile) because
        // the temp path isn't in Tauri's allowlist scope.
        const sourceSize = await getFileSize(data.sourcePath)
        const jsonText = await readFileText(data.sourcePath, sourceSize)
        const expanded = await expandSortedJsonToTempCsv(jsonText, (emitted, total) => {
          if (total > 0) {
            setProgress(Math.min(JSON_EXPAND_MAX, Math.round((emitted / total) * JSON_EXPAND_MAX)))
          }
        }, controller.signal)
        expandedCsvPathRef.current = expanded.tempPath
        inputCsvPath = expanded.tempPath

        // Free the original JSON copy — it's no longer needed once expanded.
        removeTempFile(data.sourcePath).catch(console.error)
      }

      // === Phase 2: derive (writes out-of-order, each row tagged with sourceIdx) ===
      derivedPath = await getTempPath()
      // Final output is always a separate temp — restore runs for both CSV and JSON
      // to reassemble the out-of-order derive output.
      finalPath = await getTempPath()
      finalTempPathRef.current = finalPath

      const fileSize = await getFileSize(inputCsvPath)
      const workerCount = fileSize < SINGLE_WORKER_FILE_SIZE ? 1 : undefined

      // Progress scaling:
      //   JSON: derive occupies [JSON_EXPAND_MAX, JSON_DERIVE_MAX]
      //   CSV:  derive occupies [0, CSV_DERIVE_MAX]
      const result = await streamCsvProcess(
        inputCsvPath,
        derivedPath,
        data.mnemonicList,
        data.chainCode,
        (p: StreamProgress) => {
          if (data.isJsonSource) {
            const range = JSON_DERIVE_MAX - JSON_EXPAND_MAX
            setProgress(JSON_EXPAND_MAX + Math.round((p.percent / 100) * range))
          } else {
            setProgress(Math.round((p.percent / 100) * CSV_DERIVE_MAX))
          }
        },
        {
          skipAddressCheck: data.isJsonSource,
          signal: controller.signal,
          workerCount,
          inputHasSourceIdxPrefix: data.isJsonSource,
        }
      )

      // === Phase 3: restore source order (runs for both CSV and JSON) ===
      const restoreStart = data.isJsonSource ? JSON_DERIVE_MAX : CSV_DERIVE_MAX
      const restoreEnd = data.isJsonSource ? JSON_RESTORE_MAX : CSV_RESTORE_MAX
      await restoreSourceOrder(derivedPath, finalPath, result.totalRows, rp => {
        const range = restoreEnd - restoreStart
        setProgress(restoreStart + Math.round(rp.fraction * range))
      }, controller.signal)
      removeTempFile(derivedPath).catch(console.error)
      if (expandedCsvPathRef.current) {
        removeTempFile(expandedCsvPathRef.current).catch(console.error)
        expandedCsvPathRef.current = ''
      }

      setErrMsg('')
      setFinalTempPath(finalPath)
      // Filter ed25519 chains to only those that need special warnings (TON/NEAR/APTOS/SUI/SOLANA)
      const notableChains = [TON_CHAIN, TON_TEST_CHAIN, TON_TEST_CHAIN_ALIAS, NEAR_CHAIN, APTOS_CHAIN, SUI_CHAIN, SOLANA_CHAIN]
      const notable = result.ed25519Chains.filter(c => notableChains.includes(c.toLowerCase() as typeof notableChains[number]))
      setEd25519Chains(notable)
      setProgress(100)
      await sleep(400)
      setLoading(false)
    } catch (error: any) {
      if (error instanceof NetworkDetectedError) {
        // Network detected — delete ALL intermediate files (may contain private keys)
        if (derivedPath) removeTempFile(derivedPath).catch(console.error)
        if (finalPath && finalPath !== derivedPath) removeTempFile(finalPath).catch(console.error)
        if (expandedCsvPathRef.current) removeTempFile(expandedCsvPathRef.current).catch(console.error)
        if (data.sourcePath) removeTempFile(data.sourcePath).catch(console.error)
        finalTempPathRef.current = ''
        expandedCsvPathRef.current = ''
        setLoading(false)
        prev()
        return
      }
      // Non-abort errors: clean up intermediates the unmount hook wouldn't touch.
      if (derivedPath) removeTempFile(derivedPath).catch(console.error)
      console.error('[RECOVER EXPORT FILE ERROR]: ', error)
      // Write sanitized error to a .log temp file for production debugging.
      // Only output error type + safe context; strip details that may contain
      // addresses, keys, or other user-specific data.
      const safeLog = (() => {
        // Use instanceof — `error.name` is unreliable (subclasses without
        // explicit this.name default to 'Error', and minifiers may mangle names).
        const e = error as Error
        if (error instanceof InvalidFormatError) return `InvalidFormatError: ${e.message}`
        if (error instanceof UnsupportedVersionError) return `UnsupportedVersionError: ${e.message}`
        if (error instanceof NetworkDetectedError) return `NetworkDetectedError: ${e.message}`
        if (error instanceof MissRequiredFieldError) return `MissRequiredFieldError: ${e.message}`
        if (error instanceof UnsupportBlockChainError) return `UnsupportBlockChainError: ${e.message}`
        if (error instanceof MissDataError) return 'MissDataError'
        if (error instanceof ValidateAddressError) return 'ValidateAddressError: address mismatch (details redacted)'
        if (error instanceof RecoverHDKeyError) return 'RecoverHDKeyError: key recovery failed (details redacted)'
        return 'UnknownError (details redacted)'
      })()
      getTempPath('.log').then(logPath =>
        invoke('write_file_chunk', {
          path: logPath,
          append: false,
          content: `[${new Date().toISOString()}] ${safeLog}\n`,
        }).catch(() => { /* best-effort */ })
      ).catch(() => { /* best-effort */ })

      if (error instanceof RecoverHDKeyError) {
        const k =
          version === 'v2'
            ? 'Recovery.ExportKey.recoverHDKeyErrorV2'
            : 'Recovery.ExportKey.recoverHDKeyError'
        setErrMsg(t(k))
      } else if (error instanceof MissRequiredFieldError) {
        setErrMsg(t('Recovery.ImportFile.error.missRequiredField', { fields: error.message }))
      } else if (error instanceof UnsupportBlockChainError) {
        setErrMsg(t('Recovery.ImportFile.error.unsupportBlockChain', { blockchain: error.message }))
      } else {
        setErrMsg(t('Recovery.ExportKey.validateAddress'))
      }
      setLoading(false)
    } finally {
      window.removeEventListener('online', onOnline)
    }
  }

  const exportCSV = async () => {
    try {
      const filePath = await dialogSaveFile('derived-recovery.csv')
      if (filePath && finalTempPath) {
        await copyFile(finalTempPath, filePath)
        // Clean up temp files
        removeTempFile(finalTempPath).catch(console.error)
        finalTempPathRef.current = ''
        if (data.sourcePath) {
          removeTempFile(data.sourcePath).catch(console.error)
        }
      }
      next()
    } catch (error) {
      console.error('[EXPORT ERROR]:', error)
      setErrMsg(t('Recovery.ExportKey.recoverPrivateKeyError'))
    }
  }

  return (
    <>
      {!loading ? (
        <div
          className="content"
          data-testid="content"
          style={{ marginTop: errMsg ? 92 : 142, gap: 16 }}
        >
          {errMsg ? (
            <ErrorContent>
              <img src={failIcon} width={120} height={120} />
              <p className="error-text">{errMsg}</p>
            </ErrorContent>
          ) : (
            <ExportDesc>
              <div className="title-group">
                <p className="export-title">{t('Recovery.ExportKey.title')}</p>
                <p className="export-desc">{t('Recovery.ExportKey.desc')}</p>
              </div>
            </ExportDesc>
          )}
          {ed25519Chains.length > 0 && (
            <TipAlert>
              <img src={attentionIcon} width={16} height={16} />
              {ed25519ChainsHasTon ? (
                <ol>
                  <li>{t('Recovery.ExportKey.tonTip1')}</li>
                  <li>{t('Recovery.ExportKey.tonTip2', { blockchain: ed25519Chains.join(' / ') })}</li>
                </ol>
              ) : (
                <p className="tip-text">
                  {t('Recovery.ExportKey.tip', {
                    blockchain: ed25519Chains.join(','),
                  })}
                </p>
              )}
            </TipAlert>
          )}
        </div>
      ) : (
        <LoadingContent className="content">
          <p className="loading-text">{t('Recovery.ExportKey.loading')}</p>
          <ProgressBarTrack>
            <div className="bar" style={{ width: `${progress}%` }} />
          </ProgressBarTrack>
        </LoadingContent>
      )}

      {!loading && (
        <Footer>
          <div className="step-buttons">
            <div>
              <Button onClick={prev}>{t('common.prev')}</Button>
              <Button
                type="primary"
                onClick={exportCSV}
                disabled={!!errMsg || !finalTempPath}
              >
                {t('Recovery.ExportKey.export')}
              </Button>
            </div>
          </div>
        </Footer>
      )}
    </>
  )
}

const LoadingContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 16px;
  padding-top: 172px !important;
  flex: unset !important;

  .loading-text {
    color: var(--color-Neutral-20);
    font-size: 16px;
    font-style: normal;
    font-weight: 500;
    line-height: normal;
  }
`

const ProgressBarTrack = styled.div`
  width: 100%;
  height: 12px;
  background-color: var(--color-Neutral-94);
  border-radius: 100px;
  overflow: hidden;

  .bar {
    height: 100%;
    width: 0%;
    background-color: ${({ theme }) => theme.color.brand};
    border-radius: 100px;
    transition: width 0.4s ease-out;
  }
`

const ExportDesc = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;

  .title-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .export-title {
    color: var(--color-Neutral-20);
    font-size: 16px;
    font-style: normal;
    font-weight: 500;
    line-height: normal;
  }

  .export-desc {
    color: var(--color-Neutral-60);
    font-size: 14px;
    font-style: normal;
    font-weight: 400;
    line-height: normal;
  }
`

const ErrorContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  width: 100%;

  .lottie {
    width: 120px;
    height: 120px;
  }

  .error-text {
    font-size: 16px;
    font-weight: 500;
    color: var(--color-Auxiliary-Red-1);
    text-align: center;
  }
`

const TipAlert = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;

  img {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .tip-text {
    font-size: 12px;
    line-height: 20px;
    color: var(--color-Auxiliary-Yellow-1);
  }

  ol {
    padding-left: 14px;
    li {
      font-size: 12px;
      line-height: 20px;
      color: var(--color-Auxiliary-Yellow-1);
    }
  }
`

const Footer = styled.div``

export default ExportKey
