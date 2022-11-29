import { FC, useState } from 'react'

import { Button } from '@/components/base'
import MnemonicInput from '@/components/MnemonicInput'
import { useTranslation } from '@/i18n'
import { mnemonicVerfiy } from '@/utils/verification'

interface Props {
  index: number
  list: string[]
  next: () => void
  prev?: () => void
  onComplete: (mnemonic: string) => void
}

const MnemonicVerify: FC<Props> = ({ index, list, next, prev, onComplete }) => {
  const { t } = useTranslation()
  const [mnemonic, setMnemonic] = useState('')

  const handleChange = (mnemonicArr: string[]) => {
    setMnemonic(mnemonicArr.join(' '))
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
        <p>
          {t('Recovery.Mnemonic.title', { x: t(`common.part${index}`) })} <br />
          {t('Recovery.Mnemonic.desc')}
        </p>
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

        <Button
          type="primary"
          onClick={handleSubmit}
          disabled={!mnemonic}
        >
          {t('common.next')}
        </Button>
      </div>
    </>
  )
}

export default MnemonicVerify
