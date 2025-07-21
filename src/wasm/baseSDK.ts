import { getInvokeWasmMethod } from './utils'

type MethodReturn<T> = {
  success: boolean
  data: T
}

class BaseSDK {
  readonly invokeWasmMethod: <R>(method: string, params: any) => MethodReturn<R>

  constructor(instance: WebAssembly.Instance) {
    this.invokeWasmMethod = getInvokeWasmMethod(instance)
  }
}

export default BaseSDK
