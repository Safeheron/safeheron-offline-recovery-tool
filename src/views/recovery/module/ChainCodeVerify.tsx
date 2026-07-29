import { ChangeEvent, FC, useState } from 'react'
import styled from 'styled-components'

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
      <div className="content" style={{ marginTop: 156 }}>
        <Title>{t('Verify.ChainCodeVerify.title')}</Title>
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

const Title = styled.p`
  color: var(--color-Neutral-20);
  font-size: 16px;
  font-style: normal;
  font-weight: 500;
  line-height: normal;
  margin-bottom: 16px;
`

export default ChainCodeVerify
