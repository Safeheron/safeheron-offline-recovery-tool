import { wordlists } from 'bip39'

import i18n from '@/i18n'

export const mnemonicVerfiy = (mnemonicArr: string[]): string => {
  const allWordListsEnglish = wordlists.english

  const { t } = i18n
  if (!mnemonicArr?.length) {
    return t('Recovery.Mnemonic.required')
  }

  const illegalList = mnemonicArr.filter(v => {
    if (v.length === 4) {
      return !allWordListsEnglish.find(word => word.indexOf(v) === 0)
    }
    return !allWordListsEnglish.includes(v)
  })

  if (illegalList.length > 0) {
    return t('Recovery.Mnemonic.illega')
  }

  if (mnemonicArr.length !== 24) {
    return t('Recovery.Mnemonic.error')
  }

  return ''
}

export const handleFourCharMnemonic = (mnemonicArr: string[]) => mnemonicArr.map(item => {
    if (item.length === 4) {
      return wordlists.english.find(word => word.indexOf(item) === 0) ?? item
    }
    return item
  })
