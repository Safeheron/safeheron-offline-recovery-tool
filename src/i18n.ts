import i18n from 'i18next'
import { useTranslation, initReactI18next } from 'react-i18next'

import ZhCn from '@/locales/zh-CN.json'
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

export const LANGUAGE_KEY = 'Accept-Language'
export const getLanguage = (): LanguageEnum => {
  const localLang = localStorage.getItem(LANGUAGE_KEY) as LanguageEnum
  if (Object.keys(LanguageMap).includes(localLang)) {
    return localLang
  }
  const broswerLang = navigator.language.startsWith('zh')
    ? LanguageEnum.ZH_CN
    : LanguageEnum.EN_US
  return broswerLang
}
const locale = getLanguage()
const resources = {
  [LanguageEnum.EN_US]: { translation: { ...enUS } },
  [LanguageEnum.ZH_CN]: { translation: { ...ZhCn } },
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
