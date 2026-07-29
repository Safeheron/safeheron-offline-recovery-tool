import { useEffect, useState } from 'react'
import styled from 'styled-components'

import { useTranslation } from '@/i18n'
import { isDev } from '@/utils/env'
import closeOneIcon from '@img/close-one.svg'

const NetworkCheck = () => {
  const { t } = useTranslation()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  useEffect(() => {
    window.addEventListener('online', setOnlineState)
    window.addEventListener('offline', setOnlineState)

    return () => {
      window.removeEventListener('online', setOnlineState)
      window.removeEventListener('offline', setOnlineState)
    }
  }, [])

  const setOnlineState = () => {
    setIsOnline(navigator.onLine)
  }
  if (!isOnline || isDev) return null
  return (
    <Overlay>
      <AlertBox>
        <img src={closeOneIcon} width={20} height={20} />
        <span>{t('common.online')}</span>
      </AlertBox>
    </Overlay>
  )
}

const Overlay = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background-color: rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 20px;
  box-sizing: border-box;
`

const AlertBox = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  background-color: var(--color-Auxiliary-Red-4);
  border-radius: 12px;
  padding: 14px;
  width: 100%;

  img {
    flex-shrink: 0;
    margin-top: 1px;
  }

  span {
    font-size: 14px;
    line-height: normal;
    color: var(--color-Neutral-20);
  }
`

export default NetworkCheck
