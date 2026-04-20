import { FC, ReactNode } from 'react'
import styled from 'styled-components'

import { useTranslation } from '@/i18n'

interface Props {
  stepIndex: number
  stepList: Partial<{
    key: string
    value: string
    render: () => ReactNode
  }>[]
  title: string
  desc: string
}

const CommonSideStep: FC<Props> = ({ stepIndex, stepList, title, desc }) => {
  const { i18n } = useTranslation()
  return (
    <Wrapper className={i18n.language}>
      <div className="header">
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      <ul className="step-list">
        {stepList.map((v, i) =>
          v.value ? (
            <li className={stepIndex >= i ? 'active' : ''} key={v.key}>
              <span>{v.value}</span>
            </li>
          ) : null
        )}
      </ul>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  background-color: ${({ theme }) => theme.color.bg};
  width: 282px;
  height: 100%;
  padding: 30px;
  display: flex;
  flex-direction: column;

  .header {
    h1 {
      font-weight: 500;
      color: #292c33;
      font-size: 16px;
      padding-bottom: 4px;
      line-height: 22px;
    }

    p {
      font-size: 14px;
      color: var(--color-Neutral-60);
      font-weight: normal;
    }
  }

  .step-list {
    margin-top: 72px;
    font-size: 14px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 16px;

    li {
      display: flex;
      color: #849099;
      line-height: 20px;

      &::before {
        content: '';
        width: 6px;
        height: 6px;
        background-color: var(--color-Neutral-60);
        border-radius: 50%;
        margin-right: 7px;
        margin-top: 7px;
        flex-shrink: 0;
      }
      span {
        flex: 1;
      }

      &.active {
        color: var(--color-Neutral-20);
        &::before {
          background-color: ${({ theme }) => theme.color.primary};
        }
      }
    }
  }

  &.en-US {
    .step-list {
      margin-top: 40px;
    }
  }
`

export default CommonSideStep
