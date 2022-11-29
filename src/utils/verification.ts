import { wordlists } from 'bip39'

import i18n from '@/i18n'

export const mnemonicVerfiy = (mnemonicArr: string[]): string => {
  const allWordListsEnglish = wordlists.english

  const { t } = i18n
  if (!mnemonicArr?.length) {
    return t('Recovery.Mnemonic.required')
  }

  const illegalList = mnemonicArr.filter(v => !allWordListsEnglish.includes(v))

  if (illegalList.length > 0) {
    return t('Recovery.Mnemonic.illega')
  }

  if (mnemonicArr.length !== 24) {
    return t('Recovery.Mnemonic.error')
  }

  return ''
}
