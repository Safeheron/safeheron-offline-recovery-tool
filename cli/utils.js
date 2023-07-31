/* eslint-disable no-console */
const BigNumber = require('bignumber.js')

const parseAmount = (amount, coinDecimals) => new BigNumber(amount).shiftedBy(coinDecimals).integerValue()

const logReceipt = (blockchain, explorer) => {
  console.log('A transactions has been successfully sent!')
  console.log(
    '--------------------------------------------------------------------------------------------'
  )
  console.log(`Open link below to see transaction in ${blockchain} explorer`)
  console.log(explorer)
  console.log(
    '--------------------------------------------------------------------------------------------'
  )
}

module.exports = {
  parseAmount,
  logReceipt,
}
