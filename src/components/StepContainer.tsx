import { FC } from 'react'
import styled from 'styled-components'

const StepContainer: FC = ({ children }) => <Wrapper>{children}</Wrapper>

const Wrapper = styled.div`
  display: flex;
  height: 100%;
`
export default StepContainer
