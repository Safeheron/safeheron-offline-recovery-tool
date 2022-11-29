import { useState, ChangeEvent, FC } from 'react'

import StepContainer from '@/views/verify/components/StepContainer'
import { Input } from '@/components/base'
import ErrorMsg from '@/components/ErrorMsg'
import { useTranslation, LanguageEnum } from '@/i18n'
import { safeJSONParse } from '@/utils/common'
import { useVersion } from '@/components/SelectVersion'

interface Props {
  onVerify: (keys: PubKeyShare[]) => void
}

export interface PubKeyShare {
  secp256k1: string
  ed25519: string
}

const PrivateKeyVerify: FC<Props> = ({ onVerify }) => {
  const { resetVersion } = useVersion()
  const { t } = useTranslation()
  const [keys, setKeys] = useState<string[]>(new Array(3).fill(''))
  const [errMsgs, setErrMsgs] = useState<string[]>(new Array(3).fill(''))

  const handleChange = (e: ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value
    const newKeys = [...keys]
    newKeys[index] = val
    verify(newKeys, index)
    setKeys(newKeys)
  }

  const verify = (keyStrArr: string[], index = -1) => {
    const msgs = [...errMsgs]
    let arr = [0, 1, 2]
    if (index > -1) {
      arr = [index]
    }
    arr.forEach((i: number) => {
      const keyStr = keyStrArr[i]
      const key: PubKeyShare = safeJSONParse(keyStr)
      if (!keyStr) {
        msgs[i] = t('form.extPubKeyVerifyMsg.isRequired')
      } else if (Object.keys(key).length === 0) {
        msgs[i] = t('form.extPubKeyVerifyMsg.formatError')
      } else if (!key.ed25519) {
        msgs[i] = t('form.extPubKeyVerifyMsg.ed25519IsRequired')
      } else if (!key.secp256k1) {
        msgs[i] = t('form.extPubKeyVerifyMsg.secp256k1IsRequired')
      } else if (!/^epub/.test(key.ed25519)) {
        msgs[i] = t('form.extPubKeyVerifyMsg.ed25519FormatError')
      } else if (!/^xpub/.test(key.secp256k1)) {
        msgs[i] = t('form.extPubKeyVerifyMsg.secp256k1FormatError')
      } else {
        msgs[i] = ''
      }
    })
    if (keyStrArr[1] && keyStrArr[1] === keyStrArr[0]) {
      msgs[1] = t('form.extPubKeyVerifyMsg.repeatError')
    }
    if (keyStrArr[2] && [keyStrArr[0], keyStrArr[1]].includes(keyStrArr[2])) {
      msgs[2] = t('form.extPubKeyVerifyMsg.repeatError')
    }
    setErrMsgs(msgs)
    return msgs.every((msg: string) => !msg)
  }

  const onSubmit = () => {
    const isValid = verify(keys)
    if (isValid) {
      const pubKeyShares = keys.map(str => safeJSONParse(str))
      onVerify(pubKeyShares)
    }
  }

  return (
    <StepContainer
      desc={
        <p>
          {t('Verify.PrivateKeyVerify.desc1')}

          <br />
          {t('Verify.PrivateKeyVerify.desc2')}
        </p>
      }
      hasGenerate
      next={onSubmit}
      prev={resetVersion}
    >
      <p> {t('Verify.PrivateKeyVerify.inputTitle')}</p>
      {keys.map((_, i) => (
        <div key={i} className="form-item">
          <Input
            onChange={e => handleChange(e, i)}
            placeholder={t('Verify.PrivateKeyVerify.placeholder', {
              x: t(`common.part${i + 1}`),
            })}
          />
          <ErrorMsg msg={errMsgs[i]} />
        </div>
      ))}

    </StepContainer>
  )
}

export default PrivateKeyVerify
