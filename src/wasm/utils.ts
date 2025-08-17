export const stringToUint8Array = (str: string) => {
  const arr: number[] = []
  for (let i = 0, j = str.length; i < j; ++i) {
    arr.push(str.charCodeAt(i))
  }

  return new Uint8Array(arr)
}

export const int32ToUint8Array = (int32: number) => {
  const bytes = new Uint8Array(4)
  bytes[0] = int32 & 0x000000ff
  bytes[1] = (int32 >> 8) & 0x000000ff
  bytes[2] = (int32 >> 16) & 0x000000ff
  bytes[3] = (int32 >> 24) & 0x000000ff
  return bytes
}

export function uint8ArrayToInt32(bytes: Uint8Array<ArrayBufferLike>) {
  let ret = bytes[0] & 0xff
  ret |= (bytes[1] << 8) & 0xff00
  ret |= (bytes[2] << 16) & 0xff0000
  ret |= (bytes[3] << 24) & 0xff000000
  return ret
}

export function uint8ArrayToString(bytes: Uint8Array, offset: number) {
  let dataString = ''
  for (let i = 0; i < offset; i++) {
    dataString += String.fromCharCode(bytes[i])
  }

  return dataString
}

export const getInvokeWasmMethod = (wasmInstance: any) => <T extends string>(method: T, params: any) => {
  const plainOutput = false

  let inputPtr
  let inputBuffer
  let wasmInvokeResult = -1

  const mallocByteBuffer = (len: number): { ptr: any; uint8Array: Uint8Array } => {
    const ptr = wasmInstance._malloc(len)
    return {
      ptr,
      uint8Array: new Uint8Array(wasmInstance.HEAPU8.buffer, ptr, len),
    }
  }

  const { ptr: outputPtr, uint8Array: outputPtrBuffer } =
    mallocByteBuffer(4)

  const { ptr: outLenPtr, uint8Array: outLenBuff } = mallocByteBuffer(4)

  outputPtrBuffer.set(int32ToUint8Array(0))
  outLenBuff.set(int32ToUint8Array(0))

  console.time(`[Execute WASM]:(${method})`)
  if (Number.isInteger(params)) {
    wasmInvokeResult = wasmInstance[method](
      params,
      outputPtrBuffer.byteOffset,
      outLenBuff.byteOffset,
    )
  } else if (!params) {
    wasmInvokeResult = wasmInstance[method](
      outputPtrBuffer.byteOffset,
      outLenBuff.byteOffset,
    )
  } else {
    const inputData = stringToUint8Array(JSON.stringify(params))
    const inputSize = inputData.length

    const input = mallocByteBuffer(inputSize + 1)

    inputBuffer = input.uint8Array

    inputBuffer.set(Buffer.alloc(inputBuffer.length).fill(0))
    inputPtr = input.ptr

    inputBuffer.set(inputData)

    try {
      wasmInvokeResult = wasmInstance[method](
        inputBuffer.byteOffset,
        inputData.byteLength,
        outputPtrBuffer.byteOffset,
        outLenBuff.byteOffset,
      )
    } catch (error) {
      console.error('[WASM ERROR]: ', error)
    }
  }
  console.timeEnd(`[Execute WASM]:(${method})`)
  console.log(`WASM [${method}] execute result: ${wasmInvokeResult}`)

  // some method only return 0 for success, otherwise return other code
  if (plainOutput) {
    return wasmInvokeResult === 0
  }

  const outLen = uint8ArrayToInt32(outLenBuff)

  const outputMemoryPtr = uint8ArrayToInt32(outputPtrBuffer)

  const outputBuffer = new Uint8Array(wasmInstance.HEAPU8.buffer, outputMemoryPtr, outLen)

  const outJsonString = uint8ArrayToString(outputBuffer, outLen)

  const copiedOutput = ''.concat(outJsonString)
  const outJson = JSON.parse(copiedOutput)

  if (inputPtr) wasmInstance._free(inputPtr)
  wasmInstance._free(outputPtr)
  wasmInstance._free(outLenPtr)

  return outJson
}
