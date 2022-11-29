import { FC } from 'react'
import styled from 'styled-components'

interface WrapperProps {
  position?: 'static' | 'absolute'
}

interface Props extends WrapperProps {
  msg: string
}

const ErrorMsg: FC<Props> = ({ msg, position }) => {
  if (!msg) return null
  return <Wrapper position={position} data-testid="errMsg">{msg}</Wrapper>
}

const Wrapper = styled.div`
  color: #e71a1a;
  font-size: 12px;
  padding: 5px 0;
  bottom: 0;
  position: ${(props: WrapperProps) => props.position || 'absolute'}
`

export default ErrorMsg
