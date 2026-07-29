import styled from 'styled-components'
import { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { WebviewWindow } from '@tauri-apps/api/window'

import StepContainer from '@/views/verify/components/StepContainer'
import { useTranslation } from '@/i18n'
import { brandName } from '@/configs'

export interface XPubVerifyProps {
  data: {
    ed25519PubKey: string
    secp256k1PubKey: string
  }
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
      desc={<Desc>{t('Verify.XPubVerify.desc', { x: brandName })}</Desc>}
      next={handleSubmit}
      nextText={t('common.done')}
      prev={prev}
    >
      <Title>Secp256k1 Extended Public Key(xPub)</Title>
      <div className="form-item">
        <Text>{data.secp256k1PubKey}</Text>
      </div>
      <Title>Ed25519 Extended Public Key(xPub)</Title>
      <div className="form-item">
        <Text>{data.ed25519PubKey}</Text>
      </div>
    </StepContainer>
  )
}

const Desc = styled.span`
  color: var(--color-Neutral-60);
  font-family: "PingFang SC";
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  line-height: normal;
`

const Title = styled.p`
  color: var(--color-Neutral-20);
  font-size: 14px;
  font-style: normal;
  font-weight: 500;
  line-height: normal;
`

const Text = styled.div`
  background-color: var(--color-Neutral-98);
  border: 1px solid var(--color-Neutral-90);
  border-radius: 12px;
  padding: 8px 14px;
  word-break: break-all;
  line-height: 20px;
  font-size: 14px;
`

export default XPubVerify
