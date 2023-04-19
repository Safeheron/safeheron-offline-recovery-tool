import i18n from 'i18next'
import { useTranslation, initReactI18next } from 'react-i18next'

import zhCn from '@/locales/zh-CN.json'
import enUS from '@/locales/en-US.json'

export { useTranslation }
export enum LanguageEnum {
  EN_US = 'en-US',
  ZH_CN = 'zh-CN',
}

export const LanguageMap: { [key: string]: string } = {
  [LanguageEnum.EN_US]: 'English',
  [LanguageEnum.ZH_CN]: '简体中文',
}

const defaultLang = LanguageEnum.EN_US

export const LANGUAGE_KEY = 'Accept-Language'
export const getLanguage = (): LanguageEnum => {
  const localLang = localStorage.getItem(LANGUAGE_KEY) as LanguageEnum
  if (Object.keys(LanguageMap).includes(localLang)) {
    return localLang
  }
  const broswerLang = defaultLang
  return broswerLang
}
const locale = getLanguage()
const resources = {
  [LanguageEnum.EN_US]: { translation: { ...enUS } },
  [LanguageEnum.ZH_CN]: { translation: { ...zhCn } },
}

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: locale, // if you're using a language detector, do not define the lng option

    interpolation: {
      escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
    },
  })

export default i18n
