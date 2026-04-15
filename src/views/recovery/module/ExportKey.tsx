import { FC, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { dialog } from '@tauri-apps/api'

import { Button } from '@/components/base'
import attentionIcon from '@img/attention.svg'
import failIcon from '@img/fail.svg'
import { sleep } from '@/utils/common'
import { MissRequiredFieldError, UnsupportBlockChainError } from '@/utils/csv'
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
import { getFileSize, getTempPath, copyFile, registerSelectedPath, removeTempFile } from '@/utils/tauriFileIO'
import { restoreSourceOrder } from '@/utils/restoreSourceOrder'

// Files under this size use a single worker (worker init overhead ~200ms
// vs near-zero derive time for small files makes multi-worker pointless).
const SINGLE_WORKER_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export interface RecoveryItemModel {
  chainCode: string
  mnemonicList: string[]
  /** Temp CSV path — source for streamCsvProcess */
  inputCsvPath: string
  isJsonSource: boolean
  /** Sidecar mapping file — maps sorted-derive-order line N to original sourceIdx */
  jsonMappingPath?: string
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
  useEffect(() => {
    exportPrivateKey()
    return () => {
      if (finalTempPathRef.current) removeTempFile(finalTempPathRef.current).catch(console.error)
      if (data.inputCsvPath) removeTempFile(data.inputCsvPath).catch(console.error)
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
      derivedPath = await getTempPath()
      finalPath = data.isJsonSource ? await getTempPath() : derivedPath
      finalTempPathRef.current = finalPath

      const fileSize = await getFileSize(data.inputCsvPath)
      const workerCount = fileSize < SINGLE_WORKER_FILE_SIZE ? 1 : undefined

      const result = await streamCsvProcess(
        data.inputCsvPath,
        derivedPath,
        data.mnemonicList,
        data.chainCode,
        (p: StreamProgress) => {
          const capped = data.isJsonSource ? Math.min(p.percent, 95) : p.percent
          setProgress(capped)
        },
        { skipAddressCheck: data.isJsonSource, signal: controller.signal, workerCount }
      )

      if (data.isJsonSource && data.jsonMappingPath) {
        await restoreSourceOrder(derivedPath, finalPath, result.totalRows, data.jsonMappingPath, rp => {
          setProgress(95 + Math.round(rp.fraction * 5))
        }, controller.signal)
        removeTempFile(derivedPath).catch(console.error)
        removeTempFile(data.jsonMappingPath).catch(console.error)
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
        // Network detected during derive — delete ALL intermediate files (may contain private keys)
        removeTempFile(derivedPath).catch(console.error)
        if (finalPath && finalPath !== derivedPath) removeTempFile(finalPath).catch(console.error)
        if (data.jsonMappingPath) removeTempFile(data.jsonMappingPath).catch(console.error)
        if (data.inputCsvPath) removeTempFile(data.inputCsvPath).catch(console.error)
        finalTempPathRef.current = ''
        setLoading(false)
        prev()
        return
      }
      // Non-abort errors: existing handling
      if (data.isJsonSource) {
        removeTempFile(derivedPath).catch(console.error)
        if (finalPath !== derivedPath) removeTempFile(finalPath).catch(console.error)
        if (data.jsonMappingPath) removeTempFile(data.jsonMappingPath).catch(console.error)
      }
      console.error('[RECOVER EXPORT FILE ERROR]: ', error)
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
      const filePath = await dialog.save({
        defaultPath: '/derived-recovery.csv',
      })
      if (filePath && finalTempPath) {
        await registerSelectedPath(filePath)
        await copyFile(finalTempPath, filePath)
        // Clean up temp files
        removeTempFile(finalTempPath).catch(console.error)
        finalTempPathRef.current = ''
        if (data.inputCsvPath) {
          removeTempFile(data.inputCsvPath).catch(console.error)
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
