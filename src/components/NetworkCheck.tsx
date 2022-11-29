import { useEffect, useState } from 'react'
import styled from 'styled-components'

import { useTranslation } from '@/i18n'
import { isDev } from '@/utils/env'

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
    <Wrapper>
      <span>{t('common.online')}</span>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background-color: rgba(0, 0, 0, 0.1);
  span {
    background-color: #ffe2e2;
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    text-align: center;
    height: 40px;
    line-height: 40px;
    color: #ff0000;
  }
`

export default NetworkCheck
