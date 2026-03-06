/**
 * URL-safe base64 encoding with data compression (Field Mapping)
 */

// Field Mapping: Key -> Short Key
const KEY_MAP = {
  title: 'T',
  items: 'I',
  id: 'i', // omitted in encoding, recreated in decoding
  date: 'd',
  time: 't',
  destination: 'n',
  address: 'a',
  memo: 'm',
  lat: 'la',
  lng: 'lo',
}

// Reverse Map: Short Key -> Key
const REV_MAP = Object.entries(KEY_MAP).reduce((acc, [k, v]) => ({ ...acc, [v]: k }), {})

export function encodeState(state) {
  try {
    // 1. Map to short keys and omit empty fields / IDs
    const compact = {
      [KEY_MAP.title]: state.title || '',
      [KEY_MAP.items]: (state.items || []).map(item => {
        const mapped = {}
        // Omit ID (36 chars) and empty fields
        if (item.date) mapped[KEY_MAP.date] = item.date
        if (item.time) mapped[KEY_MAP.time] = item.time
        if (item.destination) mapped[KEY_MAP.destination] = item.destination
        if (item.address) mapped[KEY_MAP.address] = item.address
        if (item.memo) mapped[KEY_MAP.memo] = item.memo
        if (item.lat !== null && item.lat !== undefined) mapped[KEY_MAP.lat] = item.lat
        if (item.lng !== null && item.lng !== undefined) mapped[KEY_MAP.lng] = item.lng
        return mapped
      })
    }

    const json = JSON.stringify(compact)
    const bytes = new TextEncoder().encode(json)
    let binary = ''
    bytes.forEach(b => { binary += String.fromCharCode(b) })
    const base64 = btoa(binary)
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  } catch (e) {
    console.error('Encode error:', e)
    return ''
  }
}

export function decodeState(encoded) {
  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    if (pad) base64 += '='.repeat(4 - pad)
    
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const json = new TextDecoder().decode(bytes)
    const compact = JSON.parse(json)

    // 2. Restore to original keys and recreate IDs
    return {
      title: compact[KEY_MAP.title] || '',
      items: (compact[KEY_MAP.items] || []).map(item => ({
        id: crypto.randomUUID(), // Recreate ID on load
        date: item[KEY_MAP.date] || '',
        time: item[KEY_MAP.time] || '',
        destination: item[KEY_MAP.destination] || '',
        address: item[KEY_MAP.address] || '',
        memo: item[KEY_MAP.memo] || '',
        lat: item[KEY_MAP.lat] !== undefined ? item[KEY_MAP.lat] : null,
        lng: item[KEY_MAP.lng] !== undefined ? item[KEY_MAP.lng] : null,
      }))
    }
  } catch (e) {
    console.error('Decode error:', e)
    return null
  }
}
