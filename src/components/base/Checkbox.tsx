import { ChangeEvent, FC, useRef, useState } from 'react'
import styled from 'styled-components'

interface Props {
  defaultChecked?: boolean
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void
}

const Checkbox: FC<Props> = ({
  children,
  defaultChecked = false,
  onChange,
}) => {
  const [checked, setChecked] = useState(defaultChecked)
  const inputRef = useRef<HTMLInputElement>(null)
  const handleClick = () => {
    inputRef.current?.click()
  }
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setChecked(e.target.checked)
    if (onChange) {
      onChange(e)
    }
  }
  return (
    <SCheckbox onClick={handleClick}>
      <input
        ref={inputRef}
        type="checkbox"
        onChange={handleChange}
        checked={checked}
      />
      <div className={`input-inner ${checked ? 'checked' : ''}`} />

      <span>{children}</span>
    </SCheckbox>
  )
}

const SCheckbox = styled.div`
  font-size: 12px;
  display: flex;
  cursor: pointer;

  .input-inner {
    margin-right: 8px;
    width: 16px;
    height: 16px;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    position: relative;

    &::after {
      content: ' ';
      position: absolute;
      display: table;
      border: 2px solid #fff;
      top: 49%;
      left: 25%;
      width: 3px;
      height: 6.5px;
      opacity: 0;
      border-top: 0;
      border-left: 0;
      transform: rotate(45deg) scale(1) translate(-50%, -50%);
      transition: all 0.2s cubic-bezier(0.12, 0.4, 0.29, 1.46) 0.1s;
    }

    &.checked {
      background-color: ${({ theme }) => theme.color.brand};
      border-color: ${({ theme }) => theme.color.brand};

      &::after {
        opacity: 1;
        transition: all 0.2s cubic-bezier(0.12, 0.4, 0.29, 1.46) 0.1s;
      }
    }
  }

  &:hover {
    .input-inner {
      border-color: ${({ theme }) => theme.color.brand};
    }
  }
  input {
    display: none;
  }
`

export default Checkbox
