import { FC } from 'react'
import { dialog, fs } from '@tauri-apps/api'
import styled from 'styled-components'

import { useTranslation } from '@/i18n'

export interface FileInfo {
  name: string
  text: string
  path: string
}
interface Props {
  onChange: (fileInfo: FileInfo) => void
  file?: FileInfo
}

const Upload: FC<Props> = ({ onChange, file }) => {
  const { t } = useTranslation()
  const handleClick = async () => {
    const filePath = (await dialog.open({
      filters: [
        {
          name: 'csv',
          extensions: ['csv'],
        },
      ],
    })) as string
    const fileText = await fs.readTextFile(filePath)
    onChange({
      path: filePath,
      name: filePath,
      text: fileText,
    })
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
  height: 46px;
  display: flex;
  align-items: center;
  background-color: var(--input-color);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  position: relative;
  padding: 0 12px;
  font-size: 12px;

  input[type='file'] {
    display: none;
  }

  .upload-filename {
    flex: 1;
  }

  .upload-filename + .link {
    flex: none;
  }
`

export default Upload
