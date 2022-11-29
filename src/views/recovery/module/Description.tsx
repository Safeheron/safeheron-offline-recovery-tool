import { FC, useState, ChangeEvent, useCallback } from 'react'
import styled from 'styled-components'

import { Button, Checkbox } from '@/components/base'
import { useTranslation } from '@/i18n'
import { useVersion } from '@/components/SelectVersion'

interface Props {
  next: () => void
}

const Description: FC<Props> = ({ next }) => {
  const { version, resetVersion } = useVersion()
  const { t } = useTranslation()
  const [checked, setChecked] = useState(false)

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setChecked(e.target.checked)
  }, [])

  const k = version === 'v2' ? 'Recovery.Description.descV2' : 'Recovery.Description.desc'

  return (
    <>
      <Content className="content">
        <p>{t(k)}</p>

        <Checkbox onChange={handleChange}>
          {t('Recovery.Description.gotit')}
        </Checkbox>
      </Content>
      <div className="step-buttons">
        <Button onClick={resetVersion}>{t('common.prev')}</Button>
        <Button type="primary" onClick={next} disabled={!checked}>
          {t('common.next')}
        </Button>
      </div>
    </>
  )
}

const Content = styled.div`
  p {
    font-size: 12px;
    line-height: 26px;
    margin-bottom: 10px;
  }
`

export default Description
