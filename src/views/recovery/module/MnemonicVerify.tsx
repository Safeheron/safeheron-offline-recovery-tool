import { FC, useState } from 'react'
import styled from 'styled-components'

import { Button } from '@/components/base'
import MnemonicInput from '@/components/MnemonicInput'
import { useTranslation } from '@/i18n'
import { handleFourCharMnemonic, mnemonicVerfiy } from '@/utils/mnemonic'

interface Props {
  index: number
  list: string[]
  next: () => void
  prev?: () => void
  onComplete: (mnemonic: string) => void
}

const MnemonicVerify: FC<Props> = ({ index, list, next, prev, onComplete }) => {
  const { t, i18n } = useTranslation()
  const [mnemonic, setMnemonic] = useState('')

  const handleChange = (mnemonicArr: string[]) => {
    const arr = handleFourCharMnemonic(mnemonicArr)
    setMnemonic(arr.join(' '))
  }

  const handleSubmit = () => {
    onComplete(mnemonic)
    next()
  }

  const verify = (mnemonicArr: string[]): string => {
    const msg = mnemonicVerfiy(mnemonicArr)
    if (msg) {
      return msg
    }
    if (list.includes(mnemonicArr.join(' '))) {
      return t('Recovery.Mnemonic.repeat')
    }
    return ''
  }

  return (
    <>
      <div className="content">
        <MnemonicHeader $isEn={i18n.language === 'en-US'}>
          <MnemonicTitle>
            {t('Recovery.Mnemonic.title', { x: t(`common.part${index}`) })}
          </MnemonicTitle>
          <MnemonicDesc>{t('Recovery.Mnemonic.desc')}</MnemonicDesc>
        </MnemonicHeader>
        <div className="form-item">
          <MnemonicInput
            verify={verify}
            onChange={handleChange}
            rows={8}
            placeholder={t('Recovery.Mnemonic.placeholder', {
              x: t(`common.part${index}`),
            })}
          />
        </div>
      </div>
      <div className="step-buttons">
        {!!prev && <Button onClick={prev}>{t('common.prev')}</Button>}

        <Button type="primary" onClick={handleSubmit} disabled={!mnemonic}>
          {t('common.next')}
        </Button>
      </div>
    </>
  )
}

const MnemonicHeader = styled.div<{ $isEn?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
  margin-top: ${({ $isEn }) => ($isEn ? '44px' : '82px')};
`

const MnemonicTitle = styled.p`
  font-size: 16px;
  font-weight: 500;
  color: var(--color-Neutral-20);
  line-height: normal;
`

const MnemonicDesc = styled.p`
  font-size: 14px;
  color: var(--color-Neutral-60);
  line-height: 20px;
`

export default MnemonicVerify
