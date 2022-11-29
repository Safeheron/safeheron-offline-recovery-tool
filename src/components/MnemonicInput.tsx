import styled from 'styled-components'
import { ChangeEvent, FC, useState } from 'react'

import ErrorMsg from './ErrorMsg'

import { Textarea } from '@/components/base'
import { mnemonicVerfiy } from '@/utils/verification'

interface Props {
  onChange: (mneonicArr: string[]) => void
  rows: number
  placeholder: string
  verify?: (mneonicArr: string[]) => string
}

const MnemonicInput: FC<Props> = ({ rows, placeholder, onChange, verify }) => {
  const [mneonics, setMneonics] = useState<string[]>([])
  const [errMsg, setErrMsg] = useState('')

  const mnemonicStr2Arr = (mnemonicStr: string): string[] => mnemonicStr.split(/\s+/).filter(v => !!v)

  const defaultVerify = (mneonicArr: string[]): string => {
    const msg = mnemonicVerfiy(mneonicArr)
    return msg
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const mneonicArr = mnemonicStr2Arr(e.target.value)

    const msg = verify ? verify(mneonicArr) : defaultVerify(mneonicArr)
    setErrMsg(msg)
    setMneonics(mneonicArr)
    if (!msg) {
      onChange(mneonicArr)
    } else {
      onChange([])
    }
  }

  return (
    <>
      <Wrapper>
        <Textarea rows={rows} placeholder={placeholder} onChange={handleChange} />
        <div className="num">{mneonics.length} / 24</div>
      </Wrapper>
      <ErrorMsg msg={errMsg} />
    </>
  )
}

const Wrapper = styled.div`
  position: relative;

  textarea {
    resize: none;
  }

  .num {
    position: absolute;
    right: 14px;
    bottom: 14px;
    font-size: 12px;
    color: #abb8b8;
  }
`

export default MnemonicInput
