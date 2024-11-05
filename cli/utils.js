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

const startTaskPolling = (task, interval, duration) => new Promise(resolve => {
    const endTime = Date.now() + duration * 1000
    const poll = async () => {
      if (Date.now() < endTime) {
        try {
          const finished = await task()
          if (finished) {
            resolve(true)
            return
          }
        } catch (error) {
          //
        }
        setTimeout(poll, interval * 1000)
      } else {
        resolve(false)
      }
    }
    poll()
  })

module.exports = {
  parseAmount,
  logReceipt,
  startTaskPolling,
}
