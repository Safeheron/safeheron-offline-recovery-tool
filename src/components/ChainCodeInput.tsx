import { useState, ChangeEvent, FC } from 'react'

import { Input } from '@/components/base'
import ErrorMsg from '@/components/ErrorMsg'
import { useTranslation } from '@/i18n'

interface Props {
  onChange: (chainCode: string) => void
}

const ChainCodeInput: FC<Props> = ({ onChange }) => {
  const { t } = useTranslation()

  const [errMsg, setErrMsg] = useState('')

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    const isValid = verify(val)
    if (isValid) {
      onChange(val)
    } else {
      onChange('')
    }
  }

  const verify = (value: string): boolean => {
    if (!value) {
      setErrMsg(t('Verify.ChainCodeVerify.placeholer'))
      return false
    }
    if (!/^[0-9a-f]{64}$/.test(value)) {
      setErrMsg(t('Verify.ChainCodeVerify.msg'))
      return false
    }
    setErrMsg('')
    return true
  }

  return (
    <>
      <p>{t('Verify.ChainCodeVerify.title')}</p>
      <div className="form-item">
        <Input
          onChange={handleChange}
          placeholder={t('Verify.ChainCodeVerify.placeholer')}
        />
        <ErrorMsg msg={errMsg} />
      </div>
    </>
  )
}

export default ChainCodeInput
