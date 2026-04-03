/**
 * @jest-environment node
 */
import { expect, test, describe } from '@jest/globals'

import { isSafeUrl, validateCustomRpcUrl } from '../rpc'

describe('isSafeUrl', () => {
  // Valid URLs
  test('accepts valid HTTPS URL', () => {
    expect(isSafeUrl('https://rpc.mainnet.near.org')).toBe(true)
  })

  test('accepts HTTPS URL with path', () => {
    expect(isSafeUrl('https://mainnet.helius-rpc.com/v1/key')).toBe(true)
  })

  test('accepts HTTPS URL on port 443', () => {
    expect(isSafeUrl('https://rpc.example.com:443')).toBe(true)
  })

  // Protocol checks
  test('rejects HTTP URL', () => {
    expect(isSafeUrl('http://rpc.example.com')).toBe(false)
  })

  test('rejects FTP URL', () => {
    expect(isSafeUrl('ftp://rpc.example.com')).toBe(false)
  })

  // Port checks
  test('rejects non-443 port', () => {
    expect(isSafeUrl('https://rpc.example.com:8545')).toBe(false)
  })

  // Malformed URLs
  test('rejects malformed URL', () => {
    expect(isSafeUrl('not-a-url')).toBe(false)
  })

  test('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false)
  })

  // Localhost and special hostnames
  test('rejects localhost', () => {
    expect(isSafeUrl('https://localhost')).toBe(false)
  })

  test('rejects 0.0.0.0', () => {
    expect(isSafeUrl('https://0.0.0.0')).toBe(false)
  })

  test('rejects [::1]', () => {
    expect(isSafeUrl('https://[::1]')).toBe(false)
  })

  // IPv4 private ranges
  test('rejects 127.x.x.x loopback', () => {
    expect(isSafeUrl('https://127.0.0.1')).toBe(false)
    expect(isSafeUrl('https://127.255.255.255')).toBe(false)
  })

  test('rejects 10.x.x.x private', () => {
    expect(isSafeUrl('https://10.0.0.1')).toBe(false)
    expect(isSafeUrl('https://10.255.255.255')).toBe(false)
  })

  test('rejects 0.x.x.x', () => {
    expect(isSafeUrl('https://0.0.0.0')).toBe(false)
  })

  test('rejects 172.16-31.x.x private', () => {
    expect(isSafeUrl('https://172.16.0.1')).toBe(false)
    expect(isSafeUrl('https://172.31.255.255')).toBe(false)
  })

  test('accepts 172.15.x.x (not private)', () => {
    expect(isSafeUrl('https://172.15.0.1')).toBe(true)
  })

  test('accepts 172.32.x.x (not private)', () => {
    expect(isSafeUrl('https://172.32.0.1')).toBe(true)
  })

  test('rejects 192.168.x.x private', () => {
    expect(isSafeUrl('https://192.168.0.1')).toBe(false)
    expect(isSafeUrl('https://192.168.1.100')).toBe(false)
  })

  test('rejects 169.254.x.x link-local', () => {
    expect(isSafeUrl('https://169.254.0.1')).toBe(false)
  })

  // IPv6 private ranges
  test('rejects fc00::/7 unique local', () => {
    expect(isSafeUrl('https://[fc00::1]')).toBe(false)
    expect(isSafeUrl('https://[fd00::1]')).toBe(false)
  })

  test('rejects fe80::/10 link-local', () => {
    expect(isSafeUrl('https://[fe80::1]')).toBe(false)
  })

  // IPv4-mapped IPv6 bypass
  test('rejects IPv4-mapped IPv6 loopback ::ffff:127.0.0.1', () => {
    expect(isSafeUrl('https://[::ffff:127.0.0.1]')).toBe(false)
  })

  test('rejects IPv4-mapped IPv6 private ::ffff:10.0.0.1', () => {
    expect(isSafeUrl('https://[::ffff:10.0.0.1]')).toBe(false)
  })

  test('rejects IPv4-mapped IPv6 private ::ffff:192.168.1.1', () => {
    expect(isSafeUrl('https://[::ffff:192.168.1.1]')).toBe(false)
  })

  test('rejects IPv4-mapped IPv6 private ::ffff:172.16.0.1', () => {
    expect(isSafeUrl('https://[::ffff:172.16.0.1]')).toBe(false)
  })

  test('rejects IPv4-mapped IPv6 link-local ::ffff:169.254.0.1', () => {
    expect(isSafeUrl('https://[::ffff:169.254.0.1]')).toBe(false)
  })

  test('accepts IPv4-mapped IPv6 public address', () => {
    expect(isSafeUrl('https://[::ffff:8.8.8.8]')).toBe(true)
  })
})

describe('validateCustomRpcUrl', () => {
  test('returns falsy input as-is', () => {
    expect(validateCustomRpcUrl(undefined)).toBe(undefined)
    expect(validateCustomRpcUrl(null)).toBe(null)
    expect(validateCustomRpcUrl('')).toBe('')
  })

  test('returns trimmed valid URL', () => {
    expect(validateCustomRpcUrl('  https://rpc.example.com  ')).toBe(
      'https://rpc.example.com'
    )
  })

  test('throws on invalid URL', () => {
    expect(() => validateCustomRpcUrl('http://rpc.example.com')).toThrow(
      'Invalid RPC URL'
    )
  })

  test('throws on private IP', () => {
    expect(() => validateCustomRpcUrl('https://192.168.1.1')).toThrow(
      'Invalid RPC URL'
    )
  })

  test('throws on IPv4-mapped IPv6 private', () => {
    expect(() =>
      validateCustomRpcUrl('https://[::ffff:127.0.0.1]')
    ).toThrow('Invalid RPC URL')
  })
})
