import { FC, useEffect, useState } from 'react'
import { dialog, fs } from '@tauri-apps/api'

import { Button } from '@/components/base'
import { recoverHDKeyFromMnemonics, MultiAlgoHDKey, recoverDerivedCSV, DerivedCSVRow, ValidateAddressError } from '@/utils/mpc'
import { sleep } from '@/utils/common'
import { csvStringify } from '@/utils/csv'
import { useTranslation } from '@/i18n'
import { useVersion } from '@/components/SelectVersion'
import ErrorMsg from '@/components/ErrorMsg'

export interface RecoveryItemModel {
  chainCode: string
  mnemonicList: string[]
  csvJson: any[]
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
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    exportPrivateKey()
  }, [])

  const exportPrivateKey = async () => {
    setLoading(true)
    let hdKey
    try {
      hdKey = recoverHDKeyFromMnemonics(data.mnemonicList, data.chainCode)
    } catch (error: any) {
      const k = version === 'v2' ? 'Recovery.ExportKey.recoverHDKeyErrorV2' : 'Recovery.ExportKey.recoverHDKeyError'
      setErrMsg(t(k))
    }
    if (hdKey) {
      await doRecover(hdKey)
    }
    setLoading(false)
  }

  const doRecover = async (hdKey: MultiAlgoHDKey) => {
    try {
      await sleep(300)

      const derivedArr = recoverDerivedCSV(data.csvJson, hdKey)
      const derivedCsvStr = csvStringify<DerivedCSVRow>(derivedArr)
      setErrMsg('')
      setCsvStr(derivedCsvStr)
    } catch (error) {
      console.error('[RECOVER EXPORT FILE ERROR]: ', error)
      if (error instanceof ValidateAddressError) {
        setErrMsg(t('Recovery.ExportKey.validateAddress'))
      } else {
        setErrMsg(t('Recovery.ExportKey.recoverPrivateKeyError'))
      }
    }
  }

  const exportCSV = async () => {
    const filePath = await dialog.save({
      defaultPath: '/derived-recovery.csv',
    })

    if (filePath) {
      await fs.writeTextFile(filePath, csvStr)
    }
    next()
  }

  return (
    <>
      {!loading ? (
        <div className="content" data-testid="content">
          {errMsg ? (
            <ErrorMsg msg={errMsg} position="static" />
          ) : (
            <div>
              <p>{t('Recovery.ExportKey.title')}</p>
              <p>{t('Recovery.ExportKey.desc')}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="content"><div>loading...</div></div>
      )}

      <div className="step-buttons">
        <Button onClick={prev}>{t('common.prev')}</Button>
        <Button
          type="primary"
          onClick={exportCSV}
          disabled={!!errMsg || !csvStr}
        >
          {t('Recovery.ExportKey.export')}
        </Button>
      </div>
    </>
  )
}

export default ExportKey
