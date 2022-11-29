export function sleep(num: number) {
  return new Promise(resolve => {
    setTimeout(resolve, num)
  })
}

export function padToLength(byteStr: string, byteLen: number) {
  let result = byteStr
  while (byteLen * 2 > result.length) {
    result = `0${result}`
  }
  return result
}

function zero2(word: string) {
  if (word.length === 1) return `0${word}`
  return word
}

function toHex(msg: any[]) {
  let res = ''
  for (let i = 0; i < msg.length; i++) res += zero2(msg[i].toString(16))
  return res
}

export function safeJSONParse(data: string, defaultVal: any = {}) {
  try {
    return JSON.parse(data)
  } catch (err: any) {
    return defaultVal
  }
}

export function toCompressedPubKeyHex(keyPoint: any) {
  return toHex(keyPoint.encode(true, 'hex'))
}

export function toUncompressedPubKeyHex(keyPoint: any) {
  const x = keyPoint.getX().toString(16).padStart(64, '0')
  const y = keyPoint.getY().toString(16).padStart(64, '0')
  return `04${x}${y}`
}
