import { FC, useEffect, useState } from 'react'
import styled from 'styled-components'

import { useTranslation } from '@/i18n'

interface Props {
  value: string
}

const CopyInput: FC<Props> = ({ value }) => {
  const { t } = useTranslation()
  const [copyed, setCopyed] = useState(false)
  useEffect(() => {
    setCopyed(false)
  }, [value])
  const copy = () => {
    if (!copyed) {
      navigator.clipboard.writeText(value)
      setCopyed(true)
    }
  }
  return (
    <Wrapper>
      <span>{value}</span>
      {value ? (
        <a className={copyed ? 'copyed' : ''} onClick={copy}>
          {copyed ? t('common.copyed') : t('common.copy')}
        </a>
      ) : null}
    </Wrapper>
  )
}

const Wrapper = styled.div`
  width: 100%;
  height: 46px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background-color: #f4f3f3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;

  span {
    width: 330px;
    border: none;
    font-size: 12px;
    outline: none;
    color: var(--text-color);
    background: none;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  a {
    font-size: 12px;
    color: #0084ff;
    cursor: pointer;

    &.copyed {
      color: var(--disable-color);
      cursor: default;
    }
  }
`

export default CopyInput
