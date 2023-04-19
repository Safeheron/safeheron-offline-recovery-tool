import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { HomeButton } from '@/components/base/Button'
import { useTranslation, LanguageEnum, LanguageMap, LANGUAGE_KEY } from '@/i18n'
import mnemonic from '@img/mnemonic@2x.png'
import recover from '@img/recover@2x.png'
import arrow from '@img/arrow@2x.png'

const Home = () => {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const changeLang = (lang: LanguageEnum) => {
    i18n.changeLanguage(lang)
    localStorage.setItem(LANGUAGE_KEY, lang)
    if (window.mnemonicToKeyWindow) {
      window.mnemonicToKeyWindow.emit('changeLang', lang)
    }
  }

  return (
    <Wrapper>
      <div className="change-lang">
        <div className="lang">
          <span>{LanguageMap[i18n.language]}</span>
          <img src={arrow} alt="" />
        </div>
        <ul className="lang-list">
          {Object.values(LanguageEnum).map(v => (
            <li key={v} onClick={() => changeLang(v)}>
              {LanguageMap[v]}
            </li>
          ))}
        </ul>
      </div>
      <HomeButton className={i18n.language} onClick={() => navigate('/verify')}>
        <div className="icon">
          <img src={mnemonic} width="21" />
        </div>
        <span>{t('home.verify')}</span>
      </HomeButton>
      <HomeButton
        className={i18n.language}
        onClick={() => navigate('/recovery')}
      >
        <div className="icon" style={{ padding: '0 3px' }}>
          <img src={recover} width="16" />
        </div>
        <span>{t('home.recovery')}</span>
      </HomeButton>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  height: 100%;
  background: url(${({ theme }) => theme.img.bg}) bottom right no-repeat;
  padding: 155px 75px 0;

  position: relative;
  .change-lang {
    font-size: 12px;
    position: absolute;
    right: 26px;
    top: 14px;
    cursor: pointer;

    .lang {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 17px;
      img {
        width: 10px;
        margin-left: 6px;
      }
    }

    .lang-list {
      transition: 0.3s;
      opacity: 0;
      margin-top: 9px;
      text-align: center;
      border-radius: 2px;
      border: 1px solid #eaeaea;
      background-color: white;

      li {
        min-width: 76px;
        line-height: 24px;

        &:hover {
          background-color: ${({ theme }) => theme.color.hover};
        }
      }
    }

    &:hover {
      .lang-list {
        opacity: 1;
      }
    }
  }
`

export default Home
