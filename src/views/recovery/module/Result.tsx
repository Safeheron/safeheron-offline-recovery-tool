import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/base'
import { useTranslation } from '@/i18n'
import translateIcon from '@img/success.svg'

const Result = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const handleClick = () => {
    navigate('/')
  }
  return (
    <Wrapper>
      <Content>
        <img src={translateIcon} width={120} height={120} />
        <p>{t('Recovery.Result.desc')}</p>
      </Content>
      <StepButtons>
        <Button type="primary" onClick={handleClick}>
          {t('common.done')}
        </Button>
      </StepButtons>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 0 30px;

  .lottie {
    width: 120px;
    height: 120px;
  }

  p {
    font-size: 16px;
    font-weight: 500;
    color: var(--color-Neutral-20);
  }
`

const StepButtons = styled.div`
  padding: 20px 30px 20px 0;
  display: flex;
  justify-content: flex-end;
`

export default Result
