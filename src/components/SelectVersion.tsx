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
import { Button } from '@/components/base'
import attentionIcon from '@img/attention.svg'

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
  const isEn = i18n.language === 'en-US'
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
        <AlertDesc>
          <img src={attentionIcon} width={16} height={16} />
          <Desc>{t('selectVersion.desc')}</Desc>
        </AlertDesc>
        <ButtonGroup>
          <VersionButton $isEn={isEn} onClick={onSelectV1}>
            <span className="version-title">
              {t('selectVersion.v1BtnTitle')}
            </span>
            <span className="version-desc">{t('selectVersion.v1BtnDesc')}</span>
          </VersionButton>
          <VersionButton $isEn={isEn} onClick={onSelectV2}>
            <span className="version-title">
              {t('selectVersion.v2BtnTitle')}
            </span>
            <span className="version-desc">{t('selectVersion.v2BtnDesc')}</span>
          </VersionButton>
        </ButtonGroup>
      </Main>
      <PrevBtnWrapper>
        <Button onClick={onPrev}>{t('common.prev')}</Button>
      </PrevBtnWrapper>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  padding: 30px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
`

const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
`

const Title = styled.h3`
  font-size: 20px;
  font-weight: 500;
  line-height: normal;
  color: var(--color-Neutral-20);
`

const AlertDesc = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 4px;

  img {
    flex-shrink: 0;
    margin-top: 2px;
  }
`

const Desc = styled.p`
  font-size: 12px;
  line-height: 20px;
  color: var(--color-Auxiliary-Yellow-1);
`

const ButtonGroup = styled.div`
  display: flex;
  justify-content: center;
  gap: 40px;
`

const VersionButton = styled.div<{ $isEn?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 30px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.color.brand};
  color: white;
  cursor: pointer;
  min-width: ${({ $isEn }) => $isEn ? '210px' : '120px'};

  .version-title {
    font-size: 18px;
    font-weight: 500;
    line-height: 18px;
  }

  .version-desc {
    font-size: 14px;
    line-height: 14px;
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
