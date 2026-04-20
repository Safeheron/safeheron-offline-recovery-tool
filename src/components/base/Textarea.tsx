import styled from 'styled-components'

const Textarea = styled.textarea`
  display: flex;
  width: 100%;
  font-size: 14px;
  align-items: center;
  padding: 12px 14px;
  line-height: 20px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  outline: none;
  color: var(--text-color);

  &:focus-visible {
    border-color: ${({ theme }) => theme.color.brand};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.color.brand};
  }

  &::placeholder {
    font-size: 14px;
    color: var(--color-Neutral-70);
  }
`

export default Textarea
