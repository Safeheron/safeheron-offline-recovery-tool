import { FC } from 'react'
import { dialog, fs } from '@tauri-apps/api'
import styled from 'styled-components'

import { useTranslation } from '@/i18n'
import { registerSelectedPath } from '@/utils/tauriFileIO'

export interface FileInfo {
  name: string
  path: string
  /** Only populated for JSON files — used by expand-to-temp-csv. */
  text?: string
}
interface Props {
  onChange: (fileInfo: FileInfo) => void
  file?: FileInfo
  disabled?: boolean
}

const Upload: FC<Props> = ({ onChange, file, disabled }) => {
  const { t } = useTranslation()
  const handleClick = async () => {
    if (disabled) return
    const filePath = await dialog.open({
      filters: [
        {
          name: 'Wallet data file',
          extensions: ['csv', 'json'],
        },
      ],
    })
    if (!filePath || Array.isArray(filePath)) return

    await registerSelectedPath(filePath)
    const isJson = filePath.toLowerCase().endsWith('.json')

    if (isJson) {
      const fileText = await fs.readTextFile(filePath)
      onChange({ path: filePath, name: filePath, text: fileText })
    } else {
      onChange({ path: filePath, name: filePath })
    }
  }

  return (
    <Wrapper>
      <div className="upload-filename">{file?.name}</div>
      <a className={`link${disabled ? ' disabled' : ''}`} onClick={handleClick}>
        {t('common.choose')}
      </a>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  background-color: var(--input-color);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  position: relative;
  padding: 12px 14px;
  font-size: 14px;

  input[type='file'] {
    display: none;
  }

  .upload-filename {
    flex: 1;
    font-size: 14px;
    color: var(--text-color);
    word-break: break-all;
  }

  .link {
    flex-shrink: 0;
    font-size: 14px;
    color: ${({ theme }) => theme.color.brand};
    cursor: pointer;
    white-space: nowrap;
    align-self: center;

    &.disabled {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }
  }
`

export default Upload
