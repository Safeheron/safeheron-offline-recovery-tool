import styled from 'styled-components'

const Textarea = styled.textarea`
  display: flex;
  width: 100%;
  font-size: 12px;
  align-items: center;
  padding: 12px;
  line-height: 17px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  outline: none;
  color: var(--text-color);

  &:focus-visible {
    border-color: ${({ theme }) => theme.color.brand};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.color.brand};
  }

  &::placeholder {
    color: #abb8b8;
  }
`

export default Textarea
