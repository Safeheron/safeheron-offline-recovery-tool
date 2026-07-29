import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'

import { HomeButton } from '@/components/base/Button'
import { useTranslation, LanguageEnum, LanguageMap, LANGUAGE_KEY } from '@/i18n'
import { emitMnemonicToKeyWindow } from '@/utils/mnemonicToKeyWindow'
import translateIcon from '@img/translate.svg'

const Home = () => {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const changeLang = (lang: LanguageEnum) => {
    i18n.changeLanguage(lang)
    localStorage.setItem(LANGUAGE_KEY, lang)
    emitMnemonicToKeyWindow('changeLang', lang)
  }

  return (
    <Wrapper>
      <div className="lang-section">
        <div className="change-lang">
          <div className="lang-btn">
            <div className="translate-icon" />
            <span>{LanguageMap[i18n.language]}</span>
          </div>
          <ul className="lang-list">
            {Object.values(LanguageEnum).map(v => (
              <li key={v} onClick={() => changeLang(v)}>
                {LanguageMap[v]}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="btn-section">
        <div className="btn-group">
          <HomeButton onClick={() => navigate('/verify')}>
            <span>{t('home.verify')}</span>
          </HomeButton>
          <HomeButton onClick={() => navigate('/recovery')}>
            <span>{t('home.recovery')}</span>
          </HomeButton>
        </div>
      </div>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  height: 100%;
  background: url(${({ theme }) => theme.img.bg}) top right no-repeat;
  display: flex;
  flex-direction: column;
  padding: 0 60px;

  .lang-section {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 20px 0;
    flex-shrink: 0;
  }

  .btn-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
  }

  .btn-group {
    display: inline-flex;
    flex-direction: column;
    gap: 20px;
  }

  .change-lang {
    font-size: 14px;
    cursor: pointer;
    position: relative;

    .lang-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 18px;
      border: 1px solid var(--color-Neutral-90);
      border-radius: 50px;
      background: white;
      height: 38px;
      color: var(--color-Neutral-20);
      transition: border-color 0.2s, color 0.2s;

      &:hover {
        border-color: ${({ theme }) => theme.color.brand};
        color: ${({ theme }) => theme.color.brand};

        .translate-icon {
          background-color: ${({ theme }) => theme.color.brand};
        }
      }

      .translate-icon {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        background-color: var(--color-Neutral-20);
        -webkit-mask: url(${translateIcon}) center / contain no-repeat;
        mask: url(${translateIcon}) center / contain no-repeat;
        transition: background-color 0.2s;
      }
    }

    .lang-list {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      transition: opacity 0.3s;
      opacity: 0;
      pointer-events: none;
      margin-top: 6px;
      border-radius: 12px;
      background-color: white;
      box-shadow: 0px 4px 14.3px 2px rgba(30, 41, 47, 0.08);
      padding: 4px;

      &::before {
        content: '';
        position: absolute;
        top: -6px;
        left: 0;
        right: 0;
        height: 6px;
      }

      li {
        padding: 10px 20px;
        border-radius: 10px;
        white-space: nowrap;
        transition: background-color 0.2s;

        &:hover {
          background-color: var(--color-Neutral-97);
        }
      }
    }

    &:hover {
      .lang-list {
        opacity: 1;
        pointer-events: auto;
      }
    }
  }
`

export default Home
