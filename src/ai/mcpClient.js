const VITE_ENV = import.meta.env || {}
const MCP_ENDPOINT = VITE_ENV.VITE_MCP_ENDPOINT || '/mcp'

export const SEARCH_ATTEMPT_TIMEOUT_MS = 3000
export const SEARCH_MAX_ATTEMPTS = 3

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

function normalizeSearchQuery(query) {
  return String(query || '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/["'“”‘’`]/g, '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 네이버 지역 검색은 짧은 장소명일수록 안정적이므로, 결과가 없을 때만
 * 공백·지역 접두어·검색 보조어를 조금씩 바꾼다. 호출부에서 이미 문장을
 * 장소명으로 정리한 뒤 사용하지만, 이 함수도 마지막 안전망으로 쿼리를
 * 제한한다.
 */
export function buildSearchQueryVariants(query) {
  const base = normalizeSearchQuery(query)
  if (!base) return []

  const compact = base.replace(/\s+/g, '')
  const withoutCityPrefix = base.replace(
    /^(?:대한민국\s*)?(?:서울특별시|서울시|서울|부산광역시|부산시|부산|제주특별자치도|제주도|제주시|제주)\s+/u,
    '',
  )
  const candidates = [
    base,
    compact,
    withoutCityPrefix,
    base + ' 위치',
    base + ' 장소',
  ]

  return [...new Set(candidates.map(normalizeSearchQuery).filter(Boolean))]
    .slice(0, SEARCH_MAX_ATTEMPTS)
}

function createSearchTimeoutError(query, reason = 'timeout') {
  const error = new Error(reason === 'no-results' ? '장소 검색 결과가 없습니다.' : '장소 검색 시간이 초과되었습니다.')
  error.name = 'SearchTimeoutError'
  error.query = query
  error.reason = reason
  error.attempts = SEARCH_MAX_ATTEMPTS
  return error
}

function createAttemptController(parentSignal, timeoutMs) {
  const controller = new AbortController()
  let timedOut = false
  let timer = null

  const abortFromParent = () => controller.abort()
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort()
    else parentSignal.addEventListener('abort', abortFromParent, { once: true })
  }

  timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer)
      parentSignal?.removeEventListener('abort', abortFromParent)
    },
  }
}

async function searchPlacesOnce(query, signal) {
  try {
    const payload = await callMcpTool('search_places', { query }, signal)
    return normalizeSearchItems(payload)
  } catch (mcpError) {
    if (mcpError?.name === 'AbortError') throw mcpError
    try {
      return await searchViaAppApi(query, signal)
    } catch (apiError) {
      if (apiError?.name === 'AbortError') throw apiError
      const error = new Error('장소 검색을 완료하지 못했습니다.')
      error.cause = mcpError
      throw error
    }
  }
}

/**
 * Browser-side agent intentionally exposes only place search to the MCP layer.
 * Link creation is a separate, user-invoked share action and is never called here.
 * Vite development falls back to /api/search because the stateless MCP endpoint
 * is served by Vercel in production.
 */
export async function searchPlaces(query, signal, options = {}) {
  const queries = buildSearchQueryVariants(query)
  if (queries.length === 0) return []

  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(1, Number(options.timeoutMs))
    : SEARCH_ATTEMPT_TIMEOUT_MS
  const maxAttempts = Math.min(
    SEARCH_MAX_ATTEMPTS,
    Number.isFinite(Number(options.maxAttempts)) ? Math.max(1, Number(options.maxAttempts)) : SEARCH_MAX_ATTEMPTS,
  )
  const attempts = queries.slice(0, maxAttempts)
  let timeoutCount = 0
  let emptyCount = 0
  let lastError = null
  let receivedResponse = false
  const onAttempt = typeof options.onAttempt === 'function' ? options.onAttempt : null

  for (const [index, searchQuery] of attempts.entries()) {
    if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError')
    onAttempt?.({ query: searchQuery, attempt: index + 1, maxAttempts: attempts.length })
    const attempt = createAttemptController(signal, timeoutMs)
    try {
      const results = await searchPlacesOnce(searchQuery, attempt.signal)
      receivedResponse = true
      if (results.length > 0) return results
      emptyCount += 1
    } catch (error) {
      if (signal?.aborted) throw signal.reason || error
      if (attempt.didTimeout()) {
        timeoutCount += 1
        lastError = createSearchTimeoutError(query)
      } else {
        lastError = error
      }
    } finally {
      attempt.cleanup()
    }
  }

  // 세 번 모두 3초 제한에 걸리거나, 세 번 모두 빈 결과면 3아웃으로 확정한다.
  // 일부 시도에서만 빈 결과가 나온 경우에는 마지막까지 검색을 계속한다.
  if (timeoutCount === attempts.length && attempts.length === SEARCH_MAX_ATTEMPTS) {
    throw lastError || createSearchTimeoutError(query, 'timeout')
  }
  if (emptyCount === attempts.length && attempts.length === SEARCH_MAX_ATTEMPTS) {
    throw createSearchTimeoutError(query, 'no-results')
  }
  if (lastError && !receivedResponse && timeoutCount === 0) throw lastError
  return []
}

export function isSearchTimeoutError(error) {
  return error?.name === 'SearchTimeoutError'
}

export function getSearchTimeoutMessage(query, reason = 'timeout') {
  if (reason === 'no-results') {
    return `${String(query || '').trim()} 검색 결과가 없어 3회 재검색 후 중단되었습니다.`
  }
  return `${String(query || '').trim()} 검색이 3회 연속 시간 초과되어 중단되었습니다.`
}

export function resetMcpSession() {
  initialized = false
}
