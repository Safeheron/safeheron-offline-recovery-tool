import styled from 'styled-components'
import { FC } from 'react'

import { useTranslation } from '@/i18n'

const StepContent: FC = ({ children }) => {
  const { i18n } = useTranslation()
  return <Wrapper className={i18n.language}>{children}</Wrapper>
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;

  .content {
    padding: 0 34px;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;

    .form-item {
      position: relative;
      padding-bottom: 27px;
    }
    & > p {
      font-size: 12px;
      padding: 10px 0;
    }
  }

  .step-buttons {
    padding: 40px 0;
    padding-right: 30px;
    display: flex;
    justify-content: flex-end;
  }

  &.en-US {
    .content {
      & > p {
        line-height: 18px;
      }
    }
  }
`
export default StepContent
