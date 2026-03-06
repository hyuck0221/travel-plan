/**
 * URL-safe base64 encoding for Korean UTF-8 strings
 */

export function encodeState(state) {
  try {
    const json = JSON.stringify(state)
    const bytes = new TextEncoder().encode(json)
    let binary = ''
    bytes.forEach(b => { binary += String.fromCharCode(b) })
    const base64 = btoa(binary)
    // Make URL-safe
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  } catch {
    return ''
  }
}

export function decodeState(encoded) {
  try {
    // Restore URL-safe base64 to standard base64
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    // Add padding if needed
    const pad = base64.length % 4
    if (pad) base64 += '='.repeat(4 - pad)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const json = new TextDecoder().decode(bytes)
    return JSON.parse(json)
  } catch {
    return null
  }
}
