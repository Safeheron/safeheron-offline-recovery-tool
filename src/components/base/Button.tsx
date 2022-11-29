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
  border: 1px solid var(--brand-color);
  background: none;
  cursor: pointer;
  padding: 0 14px;
  font-size: 12px;

  &.btn-default {
    border-color: var(--brand-color);
    color: var(--brand-color);
    margin-right: 10px;

    /* &:hover {
        background-color: var(--brand-color);
        color: white;
      } */
  }

  &.btn-primary {
    background-color: var(--brand-color);
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
  width: 220px;
  height: 45px;
  background-color: var(--brand-color);
  box-shadow: 0 2px 0 #0c9d83;
  border-radius: 4px;
  display: flex;
  align-items: center;
  font-size: 14px;
  margin-bottom: 40px;
  color: white;
  padding-left: 32px;
  cursor: pointer;

  .icon {
    width: 21px;
    display: flex;
    margin-right: 13px;
  }

  &.en-US {
    padding-left: 10px;
    width: 260px;
    letter-spacing: -0.5px;
  }
`

export default Button
