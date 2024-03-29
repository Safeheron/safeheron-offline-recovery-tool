import { FC } from 'react'
import styled from 'styled-components'

interface ButtonProps {
  type?: 'default' | 'primary'
  disabled?: boolean
  onClick?: () => void
}

const Button: FC<ButtonProps> = ({
  children,
  type = 'default',
  disabled = false,
  onClick,
}) => (
  <SButton
    className={`btn-${type}`}
    type="button"
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </SButton>
)

const SButton = styled.button`
  min-width: 120px;
  height: 36px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.color.brand};
  background: none;
  cursor: pointer;
  padding: 0 14px;
  font-size: 12px;

  &.btn-default {
    border-color: ${({ theme }) => theme.color.brand};
    color: ${({ theme }) => theme.color.brand};
    margin-right: 10px;

    /* &:hover {
        background-color: ${({ theme }) => theme.color.brand};
        color: white;
      } */
  }

  &.btn-primary {
    background-color: ${({ theme }) => theme.color.brand};
    color: white;

    &[disabled] {
      cursor: not-allowed;
      background-color: #cccccc;
      border-color: #cccccc;
      color: white;
    }
  }
`

export const HomeButton = styled.div`
  height: 45px;
  background-color: ${({ theme }) => theme.color.brand};
  box-shadow: 0 2px 0 ${({ theme }) => theme.color.brand}B3;
  border-radius: 4px;
  display: flex;
  align-items: center;
  font-size: 14px;
  margin-bottom: 40px;
  color: white;
  cursor: pointer;
  padding-left: 10px;
  width: 260px;
  letter-spacing: -0.5px;

  .icon {
    width: 21px;
    display: flex;
    margin-right: 13px;
  }

  &.zh-CN {
    padding-left: 32px;
    width: 220px;
    letter-spacing: 0;
  }
`

export default Button
