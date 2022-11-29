import { StrictMode } from 'react'
import { render } from 'react-dom'

import App from '@/App'
import '@/assets/styles/global.css'

render(
  <StrictMode>
    <App />
  </StrictMode>,
  document.getElementById('app')
)
