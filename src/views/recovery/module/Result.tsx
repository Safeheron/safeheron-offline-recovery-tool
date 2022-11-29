import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'

import Lottie from '@/components/Lottie'
import { Button } from '@/components/base'
import successLottie from '@/assets/lottie/result-success.json'
import { useTranslation } from '@/i18n'

const Result = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const handleClick = () => {
    navigate('/')
  }
  return (
    <Wrapper>
      <Lottie data={successLottie} />
      <p>{t('Recovery.Result.desc')}</p>
      <Button type="primary" onClick={handleClick}>
        {t('common.done')}
      </Button>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  align-items: center;
  justify-content: center;

  .lottie {
    width: 200px;
  }

  p {
    margin-bottom: 20px;
  }
`

export default Result
