const { Command } = require('commander')
const inquirer = require('inquirer')
const ora = require('ora')

const near = require('./near')

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
  const {
    network,
    sender,
    privateKey,
    receiver,
    amount,
    ftoken,
  } = config
  const questions = []

  if (!sender) {
    questions.push({
      name: 'sender',
      message: 'enter a sender account',
      type: 'input',
    })
  }

  if (!receiver) {
    questions.push({
      name: 'receiver',
      message: 'enter a receiver account',
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
      message: 'enter a fungible token contract address (Default is NEAR)',
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
    const res = await inquirer.prompt([{
      name: 'ok',
      message:
`Please confirm the transfer information 
  sender:     ${result.sender}
  receiver:   ${result.receiver}
  amount:     ${result.amount}
  network:    ${result.network}
  token:      ${result.ftoken || 'NEAR'}
  privateKey: ${result.privateKey}
`,
      type: 'confirm',
    }])
    if (!res.ok) {
      process.exit()
    }
  }

  return result
}

const action = async (sender, receiver, amount, options) => {
  const config = await prompt({
    sender,
    receiver,
    amount,
    ...options,
  })
  const ins = ora('transfer in progress\n')
  ins.start()
  try {
    if (!config.ftoken) {
      await near.transfer(config)
    } else {
      await near.ftTransfer(config)
    }
    ins.succeed('transfer completed')
  } catch (err) {
    ins.fail('transfer failed. Please check your parameters')
  }
}

const main = async () => {
  const program = new Command()

  program
    .name('shnear')
    .description('CLI for near transactions')
    .version('0.1.0')

  program.command('transfer')
    .description('make a NEAR or other fungible token transfer')
    .argument('[sender]', 'sender account')
    .argument('[receiver]', 'receiver account')
    .argument('[amount]', 'near amount')
    .option('-k, --privateKey <privateKey>', 'private key')
    .option('-n, --network <network>', 'mainnet or testnet')
    .option('-y, --yes', 'automatic yes to prompts')
    .option('-t, --ftoken <ftoken>', 'fungible token contract address. Default is NEAR')
    .action(action)

  await program.parseAsync()
}

main()
