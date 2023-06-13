import React, {
  FC,
  useCallback,
  useState,
  ReactNode,
  useMemo,
  useContext,
} from 'react'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'

import { useTranslation } from '@/i18n'
import { Button, HomeButton } from '@/components/base'

interface Props {
  children: ReactNode
}

type Version = 'v1' | 'v2' | ''

interface IVersionContext {
  version: Version
  resetVersion: () => void
}

const VersionContext = React.createContext<Partial<IVersionContext>>({})

export const useVersion = () => useContext(VersionContext)

const SelectVersion: FC<Props> = ({ children }) => {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [version, setVersion] = useState<Version>('')

  const onSelectV1 = useCallback(() => setVersion('v1'), [])
  const onSelectV2 = useCallback(() => setVersion('v2'), [])
  const onPrev = useCallback(() => navigate('/'), [])
  const contextValue = useMemo(
    () => ({
      version,
      resetVersion: () => setVersion(''),
    }),
    [version]
  )

  if (version) {
    return (
      <VersionContext.Provider value={contextValue}>
        {children}
      </VersionContext.Provider>
    )
  }

  return (
    <Wrapper>
      <Main>
        <Title>{t('selectVersion.title')}</Title>
        <Desc lang={i18n.language}>{t('selectVersion.desc')}</Desc>
        <ButtonGroup>
          <HomeButton onClick={onSelectV1}>
            {t('selectVersion.v1Btn')}
          </HomeButton>
          <HomeButton onClick={onSelectV2}>
            {t('selectVersion.v2Btn')}
          </HomeButton>
        </ButtonGroup>
      </Main>
      <PrevBtnWrapper>
        <Button onClick={onPrev}>{t('common.prev')}</Button>
      </PrevBtnWrapper>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  padding: 40px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
`

const Main = styled.div`
  padding: 60px 24px;
  flex: 1;
`

const Title = styled.h3`
  font-size: 12px;
  line-height: 20px;
  color: #000;
`

const Desc = styled.p`
  font-size: 12px;
  line-height: 20px;
  color: #e97207;
  margin-bottom: 50px;

  &[lang='en-US'] {
    line-height: 14px;
  }
`

const ButtonGroup = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0 36px;

  div {
    justify-content: center;
    padding-left: 0;
    width: 220px;
  }
`

const PrevBtnWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
`

export const withSelectVersion = (Comp: FC) =>
  React.memo(props => (
    <SelectVersion>
      <Comp {...props} />
    </SelectVersion>
  ))
