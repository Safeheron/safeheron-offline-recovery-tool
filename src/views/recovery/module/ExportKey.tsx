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
import { streamCsvProcess, StreamProgress, RecoverHDKeyError } from '@/utils/streamCsv'
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

    try {
      setProgress(10)
      await sleep(0)
      hdKey = recoverHDKeyFromMnemonics(data.mnemonicList, data.chainCode)
      setProgress(25)
    } catch (error: any) {
      const k =
        version === 'v2'
          ? 'Recovery.ExportKey.recoverHDKeyErrorV2'
          : 'Recovery.ExportKey.recoverHDKeyError'
      setErrMsg(t(k))
      setLoading(false)
      return
    }
    if (hdKey) {
      const success = await doRecover(hdKey)
      if (success) {
        setProgress(100)
        await sleep(400)
      }
    }
    setLoading(false)
  }

  const exportLargeFile = async () => {
    // Hoisted so the catch block can clean up intermediate files on error.
    let derivedPath = ''
    let finalPath = ''
    try {
      // For JSON sources we run an extra "restore source order" pass because the
      // rows in `data.largeFilePath` were sorted by (algo, parentPath) in
      // ImportFile::writeTempCsv to make the worker parent-cache effective. The
      // sorted output comes out of streamCsvProcess in that same sorted order;
      // we then external-bucket-sort it back to original source order.
      derivedPath = await getTempPath()
      finalPath = data.isJsonSource ? await getTempPath() : derivedPath
      largeFileTempPathRef.current = finalPath

      const result = await streamCsvProcess(
        data.largeFilePath!,
        derivedPath,
        data.mnemonicList,
        data.chainCode,
        (p: StreamProgress) => {
          // Reserve the last 5% for the restore-order pass on JSON paths so the
          // progress bar still reflects ongoing work after derive completes.
          const capped = data.isJsonSource ? Math.min(p.percent, 95) : p.percent
          setProgress(capped)
        },
        { skipAddressCheck: !!data.isJsonSource }
      )

      if (data.isJsonSource && data.jsonMappingPath) {
        await restoreSourceOrder(derivedPath, finalPath, result.totalRows, data.jsonMappingPath, rp => {
          setProgress(95 + Math.round(rp.fraction * 5))
        })
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
      // Clean up intermediate temp files that the success path would have removed.
      // derivedPath / finalPath may not exist yet (e.g. streamCsvProcess failed
      // before writing anything), so swallow "File does not exist" errors.
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
        // Address mismatch, bad HD path, library-thrown errors from derive:
        // all point at the data file being wrong.
        setErrMsg(t('Recovery.ExportKey.validateAddress'))
      }
      setLoading(false)
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

  const doRecover = async (hdKey: MultiAlgoHDKey): Promise<boolean> => {
    try {
      setProgress(30)
      await sleep(300)
      setProgress(40)
      await initSDK()
      setProgress(55)
      await sleep(0) // yield before CPU-heavy derive
      const derivedArr = recoverDerivedCSV(data.csvJson, hdKey)
      setProgress(85)
      await sleep(0) // yield before stringify
      const derivedCsvStr = csvStringify<DerivedCSVRow>(derivedArr)
      setProgress(95)
      setErrMsg('')
      setCsvStr(derivedCsvStr)
      return true
    } catch (error) {
      console.error('[RECOVER EXPORT FILE ERROR]: ', error)
      // HDKey errors are handled by the caller (exportSmallFile) before this
      // function runs, so any error here is a data-file problem (unsupported
      // chain, bad HD path, address mismatch, etc.).
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
