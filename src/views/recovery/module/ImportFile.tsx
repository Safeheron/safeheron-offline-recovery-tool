import { FC, useState } from 'react'
import styled from 'styled-components'

import { Button } from '@/components/base'
import Upload, { FileInfo } from '@/components/Upload'
import ErrorMsg from '@/components/ErrorMsg'
import { csvParse, MissDataError, MissRequiredFieldError, UnsupportBlockChainError } from '@/utils/csv'
import { useTranslation } from '@/i18n'
import { RawCSVRow } from '@/utils/mpc'

interface Props {
  next: () => void
  onComplete: (arr: any[]) => void
}
const ImportFile: FC<Props> = ({ next, onComplete }) => {
  const { t } = useTranslation()
  const [file, setFile] = useState<FileInfo>()
  const [csvArr, setCsvArr] = useState<RawCSVRow[]>([])
  const [errMsg, setErrMsg] = useState('')

  const handleChange = (rawFile: FileInfo) => {
    setFile(rawFile)
    fileToJson(rawFile)
  }

  const fileToJson = (rawFile: FileInfo) => {
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
        msg = t('Recovery.ImportFile.error.missRequiredField', { fields: err.message })
      } else if (err instanceof UnsupportBlockChainError) {
        msg = t('Recovery.ImportFile.error.unsupportBlockChain', { blockchain: err.message })
      } else {
        msg = t('Recovery.ImportFile.error.default')
      }
      setErrMsg(msg)
    }
  }

  const handleSubmit = () => {
    if (!csvArr) return
    onComplete(csvArr)
    next()
  }

  return (
    <>
      <div className="content">
        <p>{t('Recovery.ImportFile.title')}</p>
        <div className="form-item" style={{ paddingBottom: 0 }}>
          <Upload file={file} onChange={handleChange} />
          <ErrorMsgWrapper>
            <ErrorMsg msg={errMsg} position="static" />
          </ErrorMsgWrapper>
        </div>
      </div>
      <div className="step-buttons">
        <Button
          type="primary"
          onClick={handleSubmit}
          disabled={!file || !!errMsg}
        >
          {t('common.next')}
        </Button>
      </div>
    </>
  )
}

const ErrorMsgWrapper = styled.div`
  min-height: 40px;
`

export default ImportFile
