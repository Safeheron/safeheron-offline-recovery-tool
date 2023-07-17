/* eslint-disable no-console */
const { Command } = require('commander')
const inquirer = require('inquirer')
const ora = require('ora')

const getNativeToken = blockchain => {
  switch (blockchain) {
    case 'sui':
      return 'SUI'
    case 'near':
      return 'NEAR'
    default:
      return ''
  }
}

const getBlockChainIns = blockchain => {
  switch (blockchain) {
    case 'sui':
      return require('./sui')
    case 'near':
      return require('./near')
    default:
      return {}
  }
}

const validate = (name, value) => {
  switch (name) {
    case 'sender':
    case 'receiver':
    case 'privateKey':
      if (value?.trim()) {
        return true
      }
      return `${name} is required, cannot be empty`
    case 'amount':
      if (value.trim() !== '' && !isNaN(Number(value))) {
        return true
      }
      return `${name} must be a number`
    default:
      return true
  }
}

const transformer = value => {
  if (typeof value === 'string') {
    return value.trim()
  }
  return value
}

const prompt = async config => {
  const { blockchain, network, sender, privateKey, receiver, amount, ftoken } =
    config
  const questions = []

  if (blockchain !== 'sui' && blockchain !== 'near') {
    questions.push({
      name: 'blockchain',
      message: 'select a blockchain',
      type: 'list',
      choices: ['sui', 'near'],
    })
  }

  if (!sender) {
    questions.push({
      name: 'sender',
      message: 'enter a sender address',
      type: 'input',
    })
  }

  if (!receiver) {
    questions.push({
      name: 'receiver',
      message: 'enter a receiver address',
      type: 'input',
    })
  }

  if (!amount) {
    questions.push({
      name: 'amount',
      message: 'enter the transfer amount',
      type: 'input',
      validate: input => {
        const amt = Number(input)
        if (isNaN(amt)) {
          return 'amount must be a number'
        }
        return true
      },
    })
  }

  if (!privateKey) {
    questions.push({
      name: 'privateKey',
      message: 'enter a private key',
      type: 'input',
    })
  }

  if (network !== 'mainnet' && network !== 'testnet') {
    questions.push({
      name: 'network',
      message: 'select a network',
      type: 'list',
      choices: ['mainnet', 'testnet'],
    })
  }

  if (!ftoken && questions.length > 0) {
    questions.push({
      name: 'ftoken',
      message:
        'enter a fungible token contract address (Default is native token)',
      type: 'input',
    })
  }

  questions.forEach(q => {
    q.validate = input => validate(q.name, input)
    q.transformer = transformer
  })

  const answers = await inquirer.prompt(questions)

  const result = {
    ...config,
    ...answers,
  }

  if (!config.yes) {
    const res = await inquirer.prompt([
      {
        name: 'ok',
        message: `Please confirm the transfer information 
  blockchain: ${result.blockchain}
  sender:     ${result.sender}
  receiver:   ${result.receiver}
  amount:     ${result.amount}
  network:    ${result.network}
  token:      ${result.ftoken || getNativeToken(result.blockchain)}
  privateKey: ${result.privateKey}
`,
        type: 'confirm',
      },
    ])
    if (!res.ok) {
      process.exit()
    }
  }

  return result
}

const action = async (blockchain, sender, receiver, amount, options) => {
  const config = await prompt({
    blockchain,
    sender,
    receiver,
    amount,
    ...options,
  })
  const ins = ora('transfer in progress\n')
  ins.start()
  const blockchainIns = getBlockChainIns(config.blockchain)
  try {
    if (!config.ftoken) {
      await blockchainIns.transfer(config)
    } else {
      await blockchainIns.ftTransfer(config)
    }
    ins.succeed('transfer completed')
  } catch (err) {
    const msg = blockchainIns.handleException(err)
    ins.fail(msg || 'transfer failed. Please check your parameters')
  }
}

const main = async () => {
  const program = new Command()

  program
    .name('sh')
    .description('CLI for safeheron transactions')
    .version('0.2.0')

  program
    .command('transfer')
    .description('make a NEAR/SUI or other fungible token transfer')
    .argument(
      '[blockchain]',
      'blockchain. currently supports SUI and NEAR chains'
    )
    .argument('[sender]', 'sender address')
    .argument('[receiver]', 'receiver address')
    .argument('[amount]', 'amount')
    .option('-k, --privateKey <privateKey>', 'private key')
    .option('-n, --network <network>', 'mainnet or testnet')
    .option('-y, --yes', 'automatic yes to prompts')
    .option(
      '-t, --ftoken <ftoken>',
      'fungible token contract address. (Default is native token)'
    )
    .action(action)

  await program.parseAsync()
}

main()
