import { RouteObject } from 'react-router-dom'

import Home from '@/views/home/Home'
import PrivateKeyRecovery from '@/views/recovery/PrivateKeyRecovery'
import BackupVerify from '@/views/verify/BackupVerify'
import MnemonicToKey from '@/views/verify/MnemonicToKey'

const routes: RouteObject[] = [
  {
    path: '/',
    element: Home,
  },
  {
    path: '/recovery',
    element: PrivateKeyRecovery,
  },
  {
    path: '/verify',
    element: BackupVerify,
  },
  {
    path: '/mnemonicToKey',
    element: MnemonicToKey,
  },
]

export default routes
