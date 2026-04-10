import { FC } from 'react'
import { dialog, fs } from '@tauri-apps/api'
import styled from 'styled-components'

import { useTranslation } from '@/i18n'
import { getFileSize, registerSelectedPath, LARGE_FILE_THRESHOLD } from '@/utils/tauriFileIO'

export interface FileInfo {
  name: string
  text: string
  path: string
  isLargeFile?: boolean
}
interface Props {
  onChange: (fileInfo: FileInfo) => void
  file?: FileInfo
}

const Upload: FC<Props> = ({ onChange, file }) => {
  const { t } = useTranslation()
  const handleClick = async () => {
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
    const size = await getFileSize(filePath)
    const isJson = filePath.toLowerCase().endsWith('.json')

    if (!isJson && size > LARGE_FILE_THRESHOLD) {
      onChange({
        path: filePath,
        name: filePath,
        text: '',
        isLargeFile: true,
      })
    } else {
      const fileText = await fs.readTextFile(filePath)
      onChange({
        path: filePath,
        name: filePath,
        text: fileText,
      })
    }
  }

  return (
    <Wrapper>
      <div className="upload-filename">{file?.name}</div>
      <a className="link" onClick={handleClick}>
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
  }
`

export default Upload
