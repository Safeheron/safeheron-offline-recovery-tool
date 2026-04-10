import styled from 'styled-components'

const Input = styled.input`
  display: flex;
  width: 100%;
  height: 56px;
  font-size: 14px;
  align-items: center;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  outline: none;
  color: var(--text-color);
  transition: 0.3s;

  &:focus-visible {
    border-color: ${({ theme }) => theme.color.brand};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.color.brand};
  }

  &::placeholder {
    font-size: 14px;
    color: var(--color-Neutral-70);
  }

  &:read-only {
    background-color: #f4f3f3;

    &:focus-visible {
      border: 1px solid var(--border-color);
      box-shadow: none;
    }
  }
`

export default Input
