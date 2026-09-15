const VITE_ENV = import.meta.env || {}
const MCP_ENDPOINT = VITE_ENV.VITE_MCP_ENDPOINT || '/mcp'

let requestId = 0
let initialized = false

function nextRequestId() {
  requestId += 1
  return requestId
}

async function readRpcResponse(response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('text/event-stream')) {
    const text = await response.text()
    const dataLine = text
      .split('\n')
      .map(line => line.trim())
      .find(line => line.startsWith('data:'))
    if (!dataLine) throw new Error('MCP 응답을 읽을 수 없습니다.')
    return JSON.parse(dataLine.slice(5).trim())
  }

  return response.json()
}

async function rpcRequest(method, params = {}, signal) {
  const id = nextRequestId()
  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal,
  })

  if (!response.ok) {
    throw new Error('MCP 요청 실패 (' + response.status + ')')
  }

  const payload = await readRpcResponse(response)
  if (payload?.error) {
    throw new Error(payload.error.message || 'MCP 요청을 처리하지 못했습니다.')
  }
  return payload?.result
}

async function ensureInitialized(signal) {
  if (initialized) return

  await rpcRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'travelink-browser-agent', version: '1.0.0' },
  }, signal)

  // 현재 서비스는 stateless JSON-RPC 서버이므로 알림 결과를 기다리지 않는다.
  try {
    await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
  }

  initialized = true
}

function parseToolText(result) {
  if (result?.isError) {
    const errorText = result.content?.find(part => part.type === 'text')?.text
    throw new Error(errorText || 'MCP 도구 실행에 실패했습니다.')
  }

  const text = result?.content?.find(part => part.type === 'text')?.text
  if (!text) return result

  try { return JSON.parse(text) } catch { return text }
}

async function callMcpTool(name, args, signal) {
  await ensureInitialized(signal)
  const result = await rpcRequest('tools/call', {
    name,
    arguments: args,
  }, signal)
  return parseToolText(result)
}

function normalizeSearchItems(payload) {
  const items = Array.isArray(payload) ? payload : payload?.items
  if (!Array.isArray(items)) return []

  return items
    .map(item => ({
      title: String(item.title || item.destination || '').trim(),
      category: String(item.category || '').trim(),
      address: String(item.address || '').trim(),
      roadAddress: String(item.roadAddress || '').trim(),
      lat: Number(item.lat),
      lng: Number(item.lng),
    }))
    .filter(item => item.title && Number.isFinite(item.lat) && Number.isFinite(item.lng))
}

async function searchViaAppApi(query, signal) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  })

  if (!response.ok) throw new Error('장소 검색 실패 (' + response.status + ')')
  return normalizeSearchItems(await response.json())
}

/**
 * Browser-side agent intentionally exposes only place search to the MCP layer.
 * Link creation is a separate, user-invoked share action and is never called here.
 * Vite development falls back to /api/search because the stateless MCP endpoint
 * is served by Vercel in production.
 */
export async function searchPlaces(query, signal) {
  const trimmedQuery = String(query || '').trim()
  if (!trimmedQuery) return []

  try {
    const payload = await callMcpTool('search_places', { query: trimmedQuery }, signal)
    return normalizeSearchItems(payload)
  } catch (mcpError) {
    if (mcpError?.name === 'AbortError') throw mcpError
    try {
      return await searchViaAppApi(trimmedQuery, signal)
    } catch (apiError) {
      if (apiError?.name === 'AbortError') throw apiError
      const error = new Error('장소 검색을 완료하지 못했습니다.')
      error.cause = mcpError
      throw error
    }
  }
}

export function resetMcpSession() {
  initialized = false
}
