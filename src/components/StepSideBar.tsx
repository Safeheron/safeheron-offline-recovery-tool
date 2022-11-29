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
        {stepList.map((v, i) => (v.value ? (
          <li className={stepIndex >= i ? 'active' : ''} key={v.key}>
            <span>{v.value}</span>
          </li>
          ) : null))}
      </ul>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  background-color: var(--bg-color);
  width: 233px;
  height: 100%;
  padding-left: 27px;

  .header {
    padding-top: 27px;
    h1 {
      font-weight: 500;
      color: black;
      font-size: 14px;
      letter-spacing: 1px;
      padding-bottom: 4px;
    }

    p {
      font-size: 12px;
    }
  }

  .step-list {
    margin-top: 60px;
    font-size: 12px;

    li {
      display: flex;
      align-items: center;
      margin-bottom: 20px;

      &::before {
        content: '';
        width: 6px;
        height: 6px;
        background-color: #d6d6d6;
        border-radius: 50%;
        margin-right: 8px;
      }
      span {
        flex: 1;
      }

      &.active {
        font-weight: 500;
        &::before {
          background-color: var(--brand-color);
        }
      }
    }
  }

  &.en-US {
    padding-left: 20px;
    .header {
      h1 {
        font-size: 12px;
      }
      p {
        margin-top: 4px;
      }
    }

    .step-list {
      li {
        align-items: flex-start;
        &::before {
          margin-top: 5px;
        }
      }
    }
  }
`

export default CommonSideStep
