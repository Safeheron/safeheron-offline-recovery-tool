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
  return (
    <Wrapper position={position} data-testid="errMsg">
      {msg}
    </Wrapper>
  )
}

const Wrapper = styled.div`
  color: var(--color-Auxiliary-Red-1);
  font-size: 12px;
  padding: ${(props: WrapperProps) =>
    props.position === 'static' ? '4px 0' : '4px'};
  bottom: 0;
  position: ${(props: WrapperProps) => props.position || 'absolute'};
`

export default ErrorMsg
