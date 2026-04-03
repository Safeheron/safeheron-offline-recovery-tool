const isPrivateIPv4 = (a, b) =>
  a === 127 ||
  a === 10 ||
  a === 0 ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168) ||
  (a === 169 && b === 254)

const isSafeUrl = url => {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') {
    return false
  }

  if (parsed.port && parsed.port !== '443') {
    return false
  }

  const hostname = parsed.hostname.toLowerCase()

  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]'
  ) {
    return false
  }

  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    if (isPrivateIPv4(a, b)) {
      return false
    }
  }

  if (hostname.startsWith('[')) {
    const ipv6 = hostname.slice(1, -1).toLowerCase()
    if (
      ipv6 === '::1' ||
      ipv6.startsWith('fc') ||
      ipv6.startsWith('fd') ||
      ipv6.startsWith('fe80')
    ) {
      return false
    }

    // Block IPv4-mapped IPv6 addresses
    // Node.js normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1 (hex form)
    const v4MappedHexMatch = ipv6.match(
      /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/
    )
    if (v4MappedHexMatch) {
      const high = parseInt(v4MappedHexMatch[1], 16)
      const a = (high >> 8) & 0xff
      const b = high & 0xff
      if (isPrivateIPv4(a, b)) {
        return false
      }
    }

    // Also handle dotted-decimal form (::ffff:127.0.0.1) in case URL parser doesn't normalize
    const v4MappedDotMatch = ipv6.match(/^::ffff:(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (v4MappedDotMatch) {
      const [, a, b] = v4MappedDotMatch.map(Number)
      if (isPrivateIPv4(a, b)) {
        return false
      }
    }
  }

  return true
}

const validateCustomRpcUrl = rpc => {
  if (!rpc) {
    return rpc
  }

  const normalized = rpc.trim()
  if (!isSafeUrl(normalized)) {
    throw new Error(
      'Invalid RPC URL. Please use an HTTPS endpoint on the public internet.'
    )
  }

  return normalized
}

module.exports = {
  isSafeUrl,
  validateCustomRpcUrl,
}
