import styled from 'styled-components'
import { FC, ReactNode } from 'react'

import { Button } from '@/components/base'
import { useTranslation } from '@/i18n'
import { useVersion } from '@/components/SelectVersion'
import { openMnemonicToKeyWindow } from '@/utils/mnemonicToKeyWindow'

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
    if (version) {
      openMnemonicToKeyWindow(version)
    }
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
  padding: 10px 30px 30px;

  header {
    margin-bottom: 16px;

    h1 {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 4px;
      color: var(--color-Neutral-20);
      line-height: 20px;
    }

    p {
      font-size: 12px;
      line-height: 17px;
      color: var(--color-Neutral-60);
    }
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 10px;

    .form-item {
      position: relative;
    }

    p {
      font-size: 14px;
      font-weight: 500;
      color: var(--color-Neutral-20);
      padding: 0;
    }
  }

  footer {
    display: flex;
    justify-content: space-between;
  }
`

export default StepContainer
