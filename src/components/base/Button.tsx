import { FC } from 'react'
import styled, { keyframes } from 'styled-components'

interface ButtonProps {
  type?: 'default' | 'primary'
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
}

const Button: FC<ButtonProps> = ({
  children,
  type = 'default',
  disabled = false,
  loading = false,
  onClick,
}) => (
  <SButton
    className={`btn-${type}`}
    type="button"
    disabled={disabled || loading}
    onClick={onClick}
  >
    {loading && <Spinner />}
    {children}
  </SButton>
)

const spin = keyframes`
  to { transform: rotate(360deg); }
`

const Spinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
  vertical-align: middle;
`

const SButton = styled.button`
  min-width: 108px;
  height: 40px;
  border-radius: 100px;
  border: 1px solid ${({ theme }) => theme.color.brand};
  background: none;
  cursor: pointer;
  padding: 0 26px;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &.btn-default {
    border-color: ${({ theme }) => theme.color.brand};
    color: ${({ theme }) => theme.color.brand};
    margin-right: 10px;
  }

  &.btn-primary {
    background-color: ${({ theme }) => theme.color.brand};
    color: white;

    &[disabled] {
      cursor: not-allowed;
      background-color: #94dfd2;
      border-color: #94dfd2;
      color: white;
    }
  }
`

export const HomeButton = styled.div`
  min-width: 200px;
  background-color: ${({ theme }) => theme.color.brand};
  border-radius: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 400;
  color: white;
  cursor: pointer;
  padding: 10px 26px;
  line-height: 20px;
`

export default Button
