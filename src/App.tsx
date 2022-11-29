import { FC } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'

import routes from '@/router'
import NetworkCheck from '@/components/NetworkCheck'

const App: FC = () => (
  <Router>
    <Routes>
      {routes.map((route: any) => (
        <Route key={route.path} path={route.path} element={<route.element />} />
      ))}
    </Routes>
    <NetworkCheck />
  </Router>
)

export default App
