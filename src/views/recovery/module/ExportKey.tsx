import { FC, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { dialog, fs } from '@tauri-apps/api'

import { Button } from '@/components/base'
import attentionIcon from '@img/attention.svg'
import failIcon from '@img/fail.svg'
import {
  recoverHDKeyFromMnemonics,
  MultiAlgoHDKey,
  recoverDerivedCSV,
  DerivedCSVRow,
} from '@/utils/mpc'
import { sleep } from '@/utils/common'
import { csvStringify, MissRequiredFieldError, UnsupportBlockChainError } from '@/utils/csv'
import { useTranslation } from '@/i18n'
import { useVersion } from '@/components/SelectVersion'
import ErrorMsg from '@/components/ErrorMsg'
import {
  APTOS_CHAIN,
  LIQUID_CHAIN,
  LIQUID_TEST_CHAIN,
  NEAR_CHAIN,
  SOLANA_CHAIN,
  SUI_CHAIN,
  TON_CHAIN,
  TON_TEST_CHAIN,
  TON_TEST_CHAIN_ALIAS,
} from '@/utils/const'
import { LiquidSDK } from '@/wasm/liquidSDK'
import { streamCsvProcess, StreamProgress, RecoverHDKeyError, NetworkDetectedError } from '@/utils/streamCsv'
import { getTempPath, copyFile, registerSelectedPath, removeTempFile } from '@/utils/tauriFileIO'
import { restoreSourceOrder } from '@/utils/restoreSourceOrder'

export interface RecoveryItemModel {
  chainCode: string
  mnemonicList: string[]
  csvJson: any[]
  largeFilePath?: string
  isJsonSource?: boolean
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
  const [csvStr, setCsvStr] = useState('')
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [largeFileTempPath, setLargeFileTempPath] = useState('')
  const largeFileTempPathRef = useRef('')
  const [largeFileEd25519Chains, setLargeFileEd25519Chains] = useState<string[]>([])
  useEffect(() => {
    exportPrivateKey()
    return () => {
      if (largeFileTempPathRef.current) removeTempFile(largeFileTempPathRef.current).catch(console.error)
      if (data.largeFilePath) removeTempFile(data.largeFilePath).catch(console.error)
    }
  }, [])

  const ed25519Chains = useMemo(() => {
    if (largeFileEd25519Chains.length > 0) {
      return largeFileEd25519Chains
    }
    if (Array.isArray(data.csvJson)) {
      const result = data.csvJson.filter(account =>
        [
          TON_CHAIN,
          TON_TEST_CHAIN,
          TON_TEST_CHAIN_ALIAS,
          NEAR_CHAIN,
          APTOS_CHAIN,
          SUI_CHAIN,
          SOLANA_CHAIN,
        ].includes(account['Blockchain Type'].toLowerCase())
      )
      return [...new Set(result.map(item => item['Blockchain Type']))]
    }
    return []
  }, [data.csvJson, largeFileEd25519Chains])
  const ed25519ChainsHasTon = useMemo(() => ed25519Chains.some(c => {
    const lower = c.toLowerCase()
    return lower === TON_CHAIN || lower === TON_TEST_CHAIN || lower === TON_TEST_CHAIN_ALIAS
  }), [ed25519Chains])

  const exportPrivateKey = async () => {
    setLoading(true)
    setProgress(0)
    await sleep(0)

    if (data.largeFilePath) {
      await exportLargeFile()
    } else {
      await exportSmallFile()
    }
  }

  const exportSmallFile = async () => {
    let hdKey
    const checkOnline = () => {
      if (navigator.onLine) throw new NetworkDetectedError()
    }

    try {
      setProgress(10)
      await sleep(0)
      checkOnline()
      hdKey = recoverHDKeyFromMnemonics(data.mnemonicList, data.chainCode)
      setProgress(25)
    } catch (error: any) {
      if (error instanceof NetworkDetectedError) {
        setLoading(false)
        prev()
        return
      }
      const k =
        version === 'v2'
          ? 'Recovery.ExportKey.recoverHDKeyErrorV2'
          : 'Recovery.ExportKey.recoverHDKeyError'
      setErrMsg(t(k))
      setLoading(false)
      return
    }
    if (hdKey) {
      const success = await doRecover(hdKey, checkOnline)
      if (!success) {
        // doRecover already set errMsg or navigated back
      } else {
        setProgress(100)
        await sleep(400)
      }
    }
    setLoading(false)
  }

  const exportLargeFile = async () => {
    let derivedPath = ''
    let finalPath = ''
    const controller = new AbortController()
    const onOnline = () => controller.abort()
    window.addEventListener('online', onOnline)
    try {
      derivedPath = await getTempPath()
      finalPath = data.isJsonSource ? await getTempPath() : derivedPath
      largeFileTempPathRef.current = finalPath

      const result = await streamCsvProcess(
        data.largeFilePath!,
        derivedPath,
        data.mnemonicList,
        data.chainCode,
        (p: StreamProgress) => {
          const capped = data.isJsonSource ? Math.min(p.percent, 95) : p.percent
          setProgress(capped)
        },
        { skipAddressCheck: !!data.isJsonSource, signal: controller.signal }
      )

      if (data.isJsonSource && data.jsonMappingPath) {
        await restoreSourceOrder(derivedPath, finalPath, result.totalRows, data.jsonMappingPath, rp => {
          setProgress(95 + Math.round(rp.fraction * 5))
        }, controller.signal)
        removeTempFile(derivedPath).catch(console.error)
        removeTempFile(data.jsonMappingPath).catch(console.error)
      }

      setErrMsg('')
      setLargeFileTempPath(finalPath)
      setLargeFileEd25519Chains(result.ed25519Chains)
      setProgress(100)
      await sleep(400)
      setLoading(false)
    } catch (error: any) {
      if (error instanceof NetworkDetectedError) {
        // Network detected during derive — delete ALL intermediate files (may contain private keys)
        removeTempFile(derivedPath).catch(console.error)
        if (finalPath && finalPath !== derivedPath) removeTempFile(finalPath).catch(console.error)
        if (data.jsonMappingPath) removeTempFile(data.jsonMappingPath).catch(console.error)
        if (data.largeFilePath) removeTempFile(data.largeFilePath).catch(console.error)
        largeFileTempPathRef.current = ''
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
      console.error('[RECOVER LARGE FILE ERROR]: ', error)
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

  const initSDK = async () => {
    const blockchains = data.csvJson.map(item =>
      item['Blockchain Type'].toLowerCase()
    )
    if (
      blockchains.includes(LIQUID_CHAIN) ||
      blockchains.includes(LIQUID_TEST_CHAIN)
    ) {
      await LiquidSDK.init()
    }
  }

  const doRecover = async (hdKey: MultiAlgoHDKey, checkOnline?: () => void): Promise<boolean> => {
    try {
      setProgress(30)
      await sleep(300)
      checkOnline?.()
      setProgress(40)
      await initSDK()
      setProgress(55)
      await sleep(0) // yield before CPU-heavy derive
      checkOnline?.()
      const derivedArr = recoverDerivedCSV(data.csvJson, hdKey)
      checkOnline?.()
      setProgress(85)
      await sleep(0) // yield before stringify
      const derivedCsvStr = csvStringify<DerivedCSVRow>(derivedArr)
      setProgress(95)
      setErrMsg('')
      setCsvStr(derivedCsvStr)
      return true
    } catch (error) {
      if (error instanceof NetworkDetectedError) {
        setCsvStr('')
        setLoading(false)
        prev()
        return false
      }
      console.error('[RECOVER EXPORT FILE ERROR]: ', error)
      setErrMsg(t('Recovery.ExportKey.validateAddress'))
      return false
    }
  }

  const exportCSV = async () => {
    try {
      const filePath = await dialog.save({
        defaultPath: '/derived-recovery.csv',
      })
      if (filePath) {
        await registerSelectedPath(filePath)
        if (largeFileTempPath) {
          await copyFile(largeFileTempPath, filePath)
          // Clean up temp files
          removeTempFile(largeFileTempPath).catch(console.error)
          largeFileTempPathRef.current = ''
          if (data.largeFilePath) {
            removeTempFile(data.largeFilePath).catch(console.error)
          }
        } else {
          await fs.writeTextFile(filePath, csvStr)
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
                disabled={!!errMsg || (!csvStr && !largeFileTempPath)}
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
