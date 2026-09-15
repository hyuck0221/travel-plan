import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resetMcpSession,
  searchPlaces,
} from './mcpClient.js'

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mcpSearchResponse(items) {
  return jsonResponse({
    result: {
      content: [{ type: 'text', text: JSON.stringify(items) }],
    },
  })
}

function place(title) {
  return { title, address: '서울', roadAddress: '서울', lat: 37.5, lng: 127 }
}

test('retries a no-result place search with a lightly changed query', async () => {
  const originalFetch = globalThis.fetch
  const requestedQueries = []
  resetMcpSession()

  globalThis.fetch = async (url, options = {}) => {
    if (url !== '/mcp') throw new Error('unexpected endpoint')
    const body = JSON.parse(options.body || '{}')
    if (body.method === 'initialize') return jsonResponse({ result: {} })
    if (body.method === 'notifications/initialized') return jsonResponse({})
    requestedQueries.push(body.params?.arguments?.query)
    if (body.params?.arguments?.query === '국립중앙박물관') {
      return mcpSearchResponse([place('국립중앙박물관')])
    }
    return mcpSearchResponse([])
  }

  try {
    const results = await searchPlaces('국립 중앙 박물관', undefined, { timeoutMs: 20 })
    assert.equal(results[0].title, '국립중앙박물관')
    assert.deepEqual(requestedQueries, ['국립 중앙 박물관', '국립중앙박물관'])
  } finally {
    globalThis.fetch = originalFetch
    resetMcpSession()
  }
})

test('stops after three empty search attempts as a search timeout', async () => {
  const originalFetch = globalThis.fetch
  const requestedQueries = []
  resetMcpSession()

  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}')
    if (body.method === 'initialize') return jsonResponse({ result: {} })
    if (body.method === 'notifications/initialized') return jsonResponse({})
    requestedQueries.push(body.params?.arguments?.query)
    return mcpSearchResponse([])
  }

  try {
    await assert.rejects(
      searchPlaces('검색되지 않는 장소', undefined, { timeoutMs: 20 }),
      error => error?.name === 'SearchTimeoutError' && error?.reason === 'no-results',
    )
    assert.equal(requestedQueries.length, 3)
  } finally {
    globalThis.fetch = originalFetch
    resetMcpSession()
  }
})

test('stops after three three-second-equivalent attempts', async () => {
  const originalFetch = globalThis.fetch
  const requestedQueries = []
  resetMcpSession()

  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}')
    if (body.method === 'initialize') return jsonResponse({ result: {} })
    if (body.method === 'notifications/initialized') return jsonResponse({})
    requestedQueries.push(body.params?.arguments?.query)
    return new Promise((_, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'))
      if (options.signal?.aborted) abort()
      else options.signal?.addEventListener('abort', abort, { once: true })
    })
  }

  try {
    await assert.rejects(
      searchPlaces('응답이 너무 느린 장소', undefined, { timeoutMs: 5 }),
      error => error?.name === 'SearchTimeoutError' && error?.reason === 'timeout',
    )
    assert.equal(requestedQueries.length, 3)
  } finally {
    globalThis.fetch = originalFetch
    resetMcpSession()
  }
})
