/**
 * URL-safe base64 encoding with Pure Binary Serialization (No JSON)
 */

// Helper: UUID string to 16-byte Uint8Array
function uuidToBytes(uuid) {
  if (!uuid || uuid.length !== 36) return new Uint8Array(16)
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

// Helper: 16-byte Uint8Array to UUID string
function bytesToUuid(bytes) {
  let hex = ''
  for (let i = 0; i < 16; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function encodeState(state) {
  try {
    const encoder = new TextEncoder()
    const titleBytes = encoder.encode(state.title || '')
    const items = state.items || []

    // Calculate buffer size (roughly)
    let size = 1 + 1 + titleBytes.length + 16 + 2 // version(1) + titleLen(1) + title + planId(16) + itemCount(2)
    const encodedItems = items.map(item => {
      const dest = encoder.encode(item.destination || '')
      const addr = encoder.encode(item.address || '')
      const memo = encoder.encode(item.memo || '')
      const date = encoder.encode(item.date || '') // YYYY-MM-DD (10 chars)
      const time = encoder.encode(item.time || '') // HH:mm (5 chars)
      const category = encoder.encode(item.category || '')
      const cost = encoder.encode(item.cost || '')

      size += 1 + dest.length + 1 + addr.length + 8 + 2 + memo.length + 1 + date.length + 1 + time.length + 16 + 1 + category.length + 1 + cost.length
      return { dest, addr, memo, date, time, lat: item.lat, lng: item.lng, id: item.id, category, cost }
    })

    const buffer = new ArrayBuffer(size)
    const view = new DataView(buffer)
    let offset = 0

    // Header
    view.setUint8(offset++, 3) // Version 3 (Binary + category + cost)
    view.setUint8(offset++, titleBytes.length)
    new Uint8Array(buffer, offset, titleBytes.length).set(titleBytes)
    offset += titleBytes.length
    
    new Uint8Array(buffer, offset, 16).set(uuidToBytes(state.id))
    offset += 16
    
    view.setUint16(offset, items.length)
    offset += 2

    // Items
    for (const i of encodedItems) {
      // Lat/Lng (Float32 = 4 bytes each)
      view.setFloat32(offset, i.lat || 0); offset += 4
      view.setFloat32(offset, i.lng || 0); offset += 4

      // Strings
      const writeStr = (bytes) => {
        const len = Math.min(bytes.length, 255)
        view.setUint8(offset++, len)
        new Uint8Array(buffer, offset, len).set(bytes.slice(0, len))
        offset += len
      }
      
      const writeLongStr = (bytes) => {
        const len = Math.min(bytes.length, 65535)
        view.setUint16(offset, len); offset += 2
        new Uint8Array(buffer, offset, len).set(bytes.slice(0, len))
        offset += len
      }

      writeStr(i.dest)
      writeStr(i.addr)
      writeLongStr(i.memo)
      writeStr(i.date)
      writeStr(i.time)
      new Uint8Array(buffer, offset, 16).set(uuidToBytes(i.id))
      offset += 16
      writeStr(i.category)
      writeStr(i.cost)
    }

    // Slice to actual used size
    const finalBuffer = buffer.slice(0, offset)
    
    // Compression
    const stream = new Blob([finalBuffer]).stream()
    const compressedStream = stream.pipeThrough(new CompressionStream('deflate'))
    const compressedBuffer = await new Response(compressedStream).arrayBuffer()
    
    const bytes = new Uint8Array(compressedBuffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  } catch (e) {
    console.error('Encode error:', e)
    return ''
  }
}

export async function decodeState(encoded) {
  if (!encoded) return null
  try {
    const standardBase64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(standardBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    
    let buffer;
    try {
      const stream = new Blob([bytes.buffer]).stream()
      const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate'))
      buffer = await new Response(decompressedStream).arrayBuffer()
    } catch (e) {
      // Fallback for legacy JSON-based URLs
      const json = new TextDecoder().decode(bytes.buffer)
      const data = JSON.parse(json)
      if (!Array.isArray(data)) return data // Already an object
      // If it's Version 1 array-based
      if (data[0] === 1) {
        const [, title, planId, items] = data
        return {
          id: planId.length > 30 ? planId : bytesToUuid(base64ToBytes(planId)), 
          title,
          items: items.map(i => ({
            destination: i[0], address: i[1], lat: i[2], lng: i[3],
            memo: i[4], date: i[5], time: i[6], id: i[7]
          }))
        }
      }
      return data
    }

    const view = new DataView(buffer)
    let offset = 0
    const version = view.getUint8(offset++)

    if (version === 2 || version === 3) {
      const titleLen = view.getUint8(offset++)
      const title = new TextDecoder().decode(new Uint8Array(buffer, offset, titleLen))
      offset += titleLen

      const planId = bytesToUuid(new Uint8Array(buffer, offset, 16))
      offset += 16

      const itemCount = view.getUint16(offset)
      offset += 2

      const items = []
      for (let i = 0; i < itemCount; i++) {
        const lat = view.getFloat32(offset); offset += 4
        const lng = view.getFloat32(offset); offset += 4

        const readStr = () => {
          const len = view.getUint8(offset++)
          const str = new TextDecoder().decode(new Uint8Array(buffer, offset, len))
          offset += len
          return str
        }
        const readLongStr = () => {
          const len = view.getUint16(offset); offset += 2
          const str = new TextDecoder().decode(new Uint8Array(buffer, offset, len))
          offset += len
          return str
        }

        const destination = readStr()
        const address = readStr()
        const memo = readLongStr()
        const date = readStr()
        const time = readStr()
        const id = bytesToUuid(new Uint8Array(buffer, offset, 16))
        offset += 16

        let category = ''
        let cost = ''
        if (version === 3) {
          category = readStr()
          cost = readStr()
        }

        items.push({ destination, address, lat, lng, memo, date, time, id, category, cost })
      }
      return { id: planId, title, items }
    }
    
    // Legacy support for plain JSON
    return JSON.parse(new TextDecoder().decode(buffer))
  } catch (e) {
    console.error('Decode error:', e)
    return null
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
