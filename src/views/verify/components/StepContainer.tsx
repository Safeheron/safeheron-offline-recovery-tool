import styled from 'styled-components'
import { FC, ReactNode } from 'react'
import { WebviewWindow } from '@tauri-apps/api/window'

import { Button } from '@/components/base'
import { useTranslation } from '@/i18n'
import { useVersion } from '@/components/SelectVersion'

interface Props {
  title?: string
  desc?: string | ReactNode
  hasGenerate?: boolean
  prev?: () => void
  next: () => void
  nextText?: string
  nextDisable?: boolean
}

const StepContainer: FC<Props> = ({
  children,
  title,
  desc,
  hasGenerate = false,
  prev,
  next,
  nextText,
  nextDisable = false,
}) => {
  const { t, i18n } = useTranslation()
  const { version } = useVersion()
  const openWindow = () => {
    window.mnemonicToKeyWindow = new WebviewWindow('mnemonicToKey', {
      url: `#/mnemonicToKey?version=${version}`,
      title: '',
      width: 500,
      height: version === 'v1' ? 540 : 440,
      resizable: false,
    })
  }
  return (
    <Wrapper>
      <header className={i18n.language}>
        <h1>{title || t('Verify.Container.title')}</h1>
        {typeof desc === 'string' ? <p>{desc}</p> : desc}
      </header>
      <div className="content">{children}</div>
      <footer>
        {hasGenerate ? (
          <Button type="primary" onClick={openWindow}>
            {t('Verify.Container.generate')}
          </Button>
        ) : (
          <div />
        )}

        <div className="step-buttons">
          {prev ? <Button onClick={prev}>{t('common.prev')}</Button> : null}
          <Button type="primary" onClick={next} disabled={nextDisable}>
            {nextText || t('common.next')}
          </Button>
        </div>
      </footer>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 30px 40px;

  header {
    margin-bottom: 10px;
    h1 {
      font-size: 14px;
      margin-bottom: 5px;
      color: #000;
    }

    p {
      font-size: 12px;
      line-height: 20px;
    }

    &.en-US {
      p {
        line-height: 14px;
      }
    }
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;

    .form-item {
      position: relative;
      padding-bottom: 27px;
    }
    p {
      font-size: 12px;
      font-weight: 500;
      padding: 5px 0;
    }
  }

  footer {
    display: flex;
    justify-content: space-between;
  }
`

export default StepContainer
