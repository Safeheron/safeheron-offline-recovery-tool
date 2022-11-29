import { render, screen, waitFor } from '@testing-library/react'
import { describe, jest, test } from '@jest/globals'

import ExportKey from '../views/recovery/module/ExportKey'

const data = {
  chainCode: 'c928a4e109cf74b09f08ebe7ec6bd519c9403e9966424eb29690840325081866',
  mnemonicList: [
    'emerge spy chunk orange culture gasp emotion physical print mixed candy win alert leader fall whisper pizza alone city taxi weird swamp device snap',
    'welcome fall fashion clarify offer bench fun zebra valid cactus stereo cricket tool almost stairs tongue tennis clay medal sniff believe worry priority strategy',
    'science radar taste direct bullet bonus split model begin fiction little again smile island rocket fossil gate minor multiply entry cushion cloud stomach spoil',
  ],
  csvJson: [
    {
      'Account Name': 'Wallet 1',
      'Blockchain Type': 'EVM',
      Network: 'mainnet',
      Address: '0xEB7E7FB1CcF48DfC6Bb0ab25D6Fc4132BEE99992',
      'Address Type': 'DEFAULT',
      'HD Path': 'm/44/666/0/0/0',
      Algorithm: 'secp256k1',
    },
  ],
}

const prev = jest.fn()
const next = jest.fn()
jest.mock('@tauri-apps/api', () => () => ({
  dialog: jest.fn(),
  fs: jest.fn(),
}))

describe('ExportKey component', () => {
  test('render a loading when component shows and the export button is disabled', () => {
    render(<ExportKey data={data} prev={prev} next={next} />)
    const loading = screen.getByText(/loading/)
    expect(loading).toBeInTheDocument()
    const btns = screen.getAllByRole('button')
    expect(btns[1]).toBeDisabled()
  })
  test('export button is disabled and err msg text shows when there are err msg', async () => {
    const invalidData = {
      chainCode: data.chainCode,
      mnemonicList: data.mnemonicList,
      csvJson: [{
        'Account Name': 'Wallet 1',
        'Blockchain Type': 'Bitcoin Cash',
        Network: 'mainnet',
        Address: '17t2gxTv7JQBSFeaf3XcXjjcvDX',
        'Address Type': 'P2PKH',
        'HD Path': 'm/44/666/0/0/0',
        Algorithm: 'secp256k1',
      }]
    }
    render(<ExportKey data={invalidData} prev={prev} next={next} />)
    const errMsg = await screen.findByTestId('errMsg')
    expect(errMsg).toBeInTheDocument()
    expect(screen.getAllByRole('button')[1]).toBeDisabled()
  })
  test('export button is enabled when loading is gone and there are no err msg', async () => {
    render(<ExportKey data={data} prev={prev} next={next} />)
    await waitFor(() => expect(screen.getAllByRole('button')[1].hasAttribute('disabled')).toBeFalsy())
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })
})
