/* eslint-disable no-console */
const { Command } = require('commander')
const inquirer = require('inquirer')
const ora = require('ora')

const chainConfig = {
  sui: { nativeToken: 'SUI', needsSender: false, needsMemo: false },
  near: { nativeToken: 'NEAR', needsSender: true, needsMemo: false },
  aptos: { nativeToken: 'APT', needsSender: false, needsMemo: false },
  solana: { nativeToken: 'SOL', needsSender: false, needsMemo: false },
  ton: { nativeToken: 'TON', needsSender: false, needsMemo: true },
}

const supportChains = Object.keys(chainConfig)

const getNativeToken = blockchain => chainConfig[blockchain]?.nativeToken || ''

const getBlockChainIns = blockchain => {
  switch (blockchain) {
    case 'sui':
      return require('./sui')
    case 'near':
      return require('./near')
    case 'aptos':
      return require('./aptos')
    case 'solana':
      return require('./solana')
    case 'ton':
      return require('./ton')
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
  let { blockchain } = config
  const { network, sender, privateKey, receiver, amount, ftoken, memo } = config

  // Phase 1: Determine blockchain first
  if (!supportChains.includes(blockchain)) {
    const answer = await inquirer.prompt([
      {
        name: 'blockchain',
        message: 'select a blockchain',
        type: 'list',
        choices: supportChains,
      },
    ])
    blockchain = answer.blockchain
  }

  const chain = chainConfig[blockchain]

  // Phase 2: Ask only chain-relevant questions
  const questions = []

  if (chain.needsSender && !sender) {
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
      type: 'password',
      mask: '*',
    })
  } else {
    console.warn(
      '\x1b[33m⚠ Warning: Passing private key via CLI argument is insecure (visible in shell history and process list). ' +
        'Consider omitting -k and using the interactive prompt instead.\x1b[0m'
    )
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

  if (chain.needsMemo && !memo) {
    questions.push({
      name: 'memo',
      message: 'enter a memo (Optional)',
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
    blockchain,
    ...answers,
  }

  if (!config.yes) {
    const confirmMsg = `Please confirm the transfer information
  blockchain: ${result.blockchain}
  ${chain.needsSender ? `sender:     ${result.sender}\n  ` : ''}receiver:   ${
      result.receiver
    }
  amount:     ${result.amount}
  network:    ${result.network}
  token:      ${result.ftoken || getNativeToken(result.blockchain)}
  privateKey: ${result.privateKey}
  ${result.rpc ? `rpcURL:     ${result.rpc}\n  ` : ''}${
      chain.needsMemo && result.memo ? `memo:       ${result.memo}\n  ` : ''
    }`

    const res = await inquirer.prompt([
      {
        name: 'ok',
        message: confirmMsg,
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
    .description('make a NEAR/SUI/APT/SOL/TON or other fungible token transfer')
    .argument(
      '[blockchain]',
      'blockchain. currently supports SUI/NEAR/APTOS/SOLANA/TON chains'
    )
    .argument('[sender]', 'sender address')
    .argument('[receiver]', 'receiver address')
    .argument('[amount]', 'amount')
    .option('-k, --privateKey <privateKey>', 'private key')
    .option('-n, --network <network>', 'mainnet or testnet')
    .option('-r, --rpc <rpc>', 'custom RPC URL. (Optional)')
    .option('-y, --yes', 'automatic yes to prompts')
    .option(
      '-t, --ftoken <ftoken>',
      'fungible token contract address. (Default is native token)'
    )
    .option('-m, --memo <memo>', 'TON MEMO. (Optional)')
    .action(action)

  await program.parseAsync()
}

main()
