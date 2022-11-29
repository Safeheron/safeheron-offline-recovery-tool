import { ChangeEvent, FC, useState } from 'react'

import { Button, Input } from '@/components/base'
import ErrorMsg from '@/components/ErrorMsg'
import { useTranslation } from '@/i18n'

interface Props {
  next: () => void
  prev: () => void
  onComplete: (chainCode: string) => void
}

const ChainCodeVerify: FC<Props> = ({ next, prev, onComplete }) => {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [errMsg, setErrMsg] = useState('')

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value)
    verify(e.target.value)
  }

  const verify = (value: string) => {
    if (!value) {
      setErrMsg(t('Verify.ChainCodeVerify.placeholer'))
    } else if (!/^[0-9a-f]{64}$/.test(value)) {
      setErrMsg(t('Verify.ChainCodeVerify.msg'))
    } else {
      setErrMsg('')
    }
  }

  const handleSubmit = () => {
    onComplete(code)
    next()
  }

  return (
    <>
      <div className="content">
        <p>{t('Verify.ChainCodeVerify.title')}</p>
        <div className="form-item">
          <Input
            onChange={handleChange}
            placeholder={t('Verify.ChainCodeVerify.placeholer')}
          />
          <ErrorMsg msg={errMsg} />
        </div>
      </div>
      <div className="step-buttons">
        <Button onClick={prev}>{t('common.prev')}</Button>
        <Button
          type="primary"
          onClick={handleSubmit}
          disabled={!!errMsg || !code}
        >
          {t('common.next')}
        </Button>
      </div>
    </>
  )
}

export default ChainCodeVerify
