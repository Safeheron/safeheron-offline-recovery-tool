import { useRef, useState, useEffect } from 'react'
import { mnemonicToExtendedPub, SigAlg } from '@safeheron/master-key-derive'
import { useSearchParams } from 'react-router-dom'
import { listen } from '@tauri-apps/api/event'

import ErrorMsg from '@/components/ErrorMsg'
import StepContainer from '@/views/verify/components/StepContainer'
import MnemonicInput from '@/components/MnemonicInput'
import CopyInput from '@/components/CopyInput'
import { LanguageEnum, useTranslation } from '@/i18n'
import ChainCodeInput from '@/components/ChainCodeInput'
import { mnemonicVerfiy } from '@/utils/verification'

const MnemonicToKey = () => {
  const [searchParams] = useSearchParams()
  const { t, i18n } = useTranslation()
  useEffect(() => {
    listen<LanguageEnum>('changeLang', event => {
      const lang = event.payload
      i18n.changeLanguage(lang)
    })
  }, [])
  const [chainCode, setChainCode] = useState('')
  const [mnemonic, setMnemonic] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [pubkey, setPubkey] = useState('')
  const alt = useRef(0)

  const chainCodeRequired = searchParams.get('version') !== 'v2'

  const isEasterEggLogic = (mneonicArr: string[]) => {
    const isNumber = (val: string) => {
      const v = Number(val)
      return typeof v === 'number' && !isNaN(v)
    }
    const len = mneonicArr.length
    return len === 25 && isNumber(mneonicArr[len - 1])
  }

  const handleChange = (mnemonicArr: string[]) => {
    let arr = mnemonicArr
    if (isEasterEggLogic(mnemonicArr)) {
      arr = mnemonicArr.slice(0, mnemonicArr.length - 1)
    }
    setMnemonic(arr.join(' '))
    setPubkey('')
  }

  const handleSubmit = () => {
    try {
      const secp256k1PubKey = mnemonicToExtendedPub(SigAlg.ECDSA_SECP256K1, alt.current, mnemonic, chainCode)
      const ed25519PubKey = mnemonicToExtendedPub(SigAlg.EDDSA_ED25519, alt.current, mnemonic)
      const formatedJson = JSON.stringify({
        secp256k1: secp256k1PubKey,
        ed25519: ed25519PubKey,
      })
      setPubkey(formatedJson)
    } catch (err) {
      console.error('[mnemonicToExtendedPub ERROR]: ', err)
      const k = chainCodeRequired ? 'Verify.MnemonicToKey.error' : 'Verify.MnemonicToKey.errorV2'
      setErrMsg(t(k))
    }
  }

  const verify = (mneonicArr: string[]): string => {
    let arr = mneonicArr
    if (isEasterEggLogic(mneonicArr)) {
      const len = mneonicArr.length
      alt.current = Number(mneonicArr[len - 1])
      arr = mneonicArr.slice(0, len - 1)
    } else {
      alt.current = 0
    }
    return mnemonicVerfiy(arr)
  }

  return (
    <StepContainer
      title={t('Verify.MnemonicToKey.title')}
      desc={t('Verify.MnemonicToKey.desc')}
      next={handleSubmit}
      nextText={t('Verify.MnemonicToKey.next')}
      nextDisable={!mnemonic || (!chainCode && chainCodeRequired)}
    >
      <div className="form-item">
        <MnemonicInput
          onChange={handleChange}
          rows={6}
          placeholder={t('Verify.MnemonicToKey.placeholder')}
          verify={verify}
        />
      </div>
      {
        chainCodeRequired && <ChainCodeInput onChange={setChainCode} />
      }
      <p>{t('Verify.MnemonicToKey.pubkey')}</p>
      <CopyInput value={pubkey} />
      <div style={{ height: i18n.language === 'en-US' ? 30 : 50 }}>
        <ErrorMsg msg={errMsg} position="static" />
      </div>
    </StepContainer>
  )
}

export default MnemonicToKey
