import styled from 'styled-components'
import { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { WebviewWindow } from '@tauri-apps/api/window'

import StepContainer from '@/views/verify/components/StepContainer'
import { useTranslation } from '@/i18n'

export interface XPubVerifyProps {
  data: {
    ed25519PubKey: string
    secp256k1PubKey: string
  },
  prev: () => void
}

const XPubVerify: FC<XPubVerifyProps> = ({ prev, data }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleSubmit = () => {
    const win = WebviewWindow.getByLabel('mnemonicToKey')
    if (win) {
      win.close()
    }
    navigate('/')
  }
  return (
    <StepContainer
      desc={t('Verify.XPubVerify.desc')}
      next={handleSubmit}
      nextText={t('common.done')}
      prev={prev}
    >
      <p>Secp256k1 Extended Public Key(xPub)</p>
      <div className="form-item">
        <Text>{data.secp256k1PubKey}</Text>
      </div>
      <p>Ed25519 Extended Public Key(xPub)</p>
      <div className="form-item">
        <Text>{data.ed25519PubKey}</Text>
      </div>
    </StepContainer>
  )
}

const Text = styled.div`
  background-color: #f4f3f3;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 14px 12px;
  word-break: break-all;
  line-height: 20px;
  font-size: 12px;
`

export default XPubVerify
