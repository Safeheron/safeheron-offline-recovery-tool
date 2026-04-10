import { StrictMode } from 'react'
import { render } from 'react-dom'
import '@/assets/styles/global.css'
import { ThemeProvider } from 'styled-components'

import { theme } from '@/configs'
import { injectColorTokens } from '@/configs/injectTokens'
import App from '@/App'

injectColorTokens()

render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </StrictMode>,
  document.getElementById('app')
)
