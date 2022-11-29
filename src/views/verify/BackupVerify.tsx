import message from 'antd/es/message'
import { extendedPubSharesAgg, SigAlg } from '@safeheron/master-key-derive'
import { useState } from 'react'

import PrivateKeyVerify, { PubKeyShare } from '@/views/verify/module/PrivateKeyVerify'
import XPubVerify from '@/views/verify/module/XPubVerify'
import { useVersion, withSelectVersion } from '@/components/SelectVersion'
import { useTranslation } from '@/i18n'

const MnemonicVerify = () => {
  const { t } = useTranslation()
  const [stepIndex, setStepIndex] = useState(1)
  const [ed25519PubKey, setEd25519PubKey] = useState('')
  const [secp256k1PubKey, setSecp256k1PubKey] = useState('')
  const { version } = useVersion()
  const isFullChainCode = version === 'v1'

  const next = () => {
    setStepIndex(stepIndex + 1)
  }

  const prev = () => {
    setStepIndex(stepIndex - 1)
  }

  const onVerify = (keys: PubKeyShare[]) => {
    try {
      const [ed25519Shares, secp256k1Shares] = keys.reduce((result: string[][], keyShare: PubKeyShare) => {
        result[0].push(keyShare.ed25519)
        result[1].push(keyShare.secp256k1)
        return result
      }, [[], []])
      const secp256k1 = extendedPubSharesAgg(SigAlg.ECDSA_SECP256K1, secp256k1Shares, isFullChainCode)
      const ed25519 = extendedPubSharesAgg(SigAlg.EDDSA_ED25519, ed25519Shares, false)
      setEd25519PubKey(ed25519)
      setSecp256k1PubKey(secp256k1)
      next()
    } catch (error) {
      console.error('[GEN XPUB ERROR]:', error)
      const k = isFullChainCode ? 'Verify.XPubVerify.error' : 'Verify.XPubVerify.errorV2'
      message.error(t(k), 6)
    }
  }
  return (
    <>
      {(() => {
        switch (stepIndex) {
          case 1:
            return <PrivateKeyVerify onVerify={onVerify} />
          case 2:
            return <XPubVerify prev={prev} data={{ ed25519PubKey, secp256k1PubKey }} />
          default:
            break
        }
      })()}
    </>
  )
}

export default withSelectVersion(MnemonicVerify)
