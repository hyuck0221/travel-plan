const NVIDIA_API_BASE_URL = 'https://integrate.api.nvidia.com/v1'
const MAX_MESSAGES = 50
const MAX_MESSAGE_CONTENT = 30000
const MAX_TOTAL_CONTENT = 120000

function safeString(value, maxLength = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function proxyError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw proxyError('AI 메시지가 없습니다.')
  }

  let totalContent = 0
  const normalized = messages
    .slice(-MAX_MESSAGES)
    .filter(message => ['system', 'user', 'assistant'].includes(message?.role))
    .map(message => {
      const content = typeof message.content === 'string'
        ? message.content.slice(0, MAX_MESSAGE_CONTENT)
        : JSON.stringify(message.content || '').slice(0, MAX_MESSAGE_CONTENT)
      totalContent += content.length
      return { role: message.role, content }
    })

  if (normalized.length === 0) throw proxyError('AI 메시지 형식이 올바르지 않습니다.')
  if (totalContent > MAX_TOTAL_CONTENT) throw proxyError('AI 요청이 너무 큽니다.')
  return normalized
}

function boundedNumber(value, minimum, maximum) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : undefined
}

function chatRequestFromBody(body) {
  const request = isRecord(body?.request) ? body.request : body
  const model = safeString(request?.model || body?.modelId, 180)
  if (!model) throw proxyError('NVIDIA 모델을 선택해주세요.')

  const payload = {
    model,
    messages: normalizeMessages(request?.messages),
    stream: false,
  }
  const temperature = boundedNumber(request?.temperature, 0, 2)
  const topP = boundedNumber(request?.top_p, 0, 1)
  const maxTokens = boundedNumber(request?.max_tokens, 1, 8192)
  if (temperature !== undefined) payload.temperature = temperature
  if (topP !== undefined) payload.top_p = topP
  if (maxTokens !== undefined) payload.max_tokens = Math.round(maxTokens)

  // The browser only sends a boolean intent here. Never forward a caller
  // supplied schema or arbitrary request fields to the upstream API.
  if (request?.response_format) payload.response_format = { type: 'json_object' }
  return payload
}

function extractUpstreamMessage(payload, fallback) {
  if (typeof payload === 'string' && payload.trim()) return payload.trim().slice(0, 2000)
  if (payload?.error && typeof payload.error === 'string') return payload.error
  if (payload?.error?.message) return payload.error.message
  if (payload?.message) return payload.message
  return fallback
}

export function createNvidiaUpstreamRequest(body) {
  const apiKey = safeString(body?.apiKey, 1000)
  if (!apiKey) throw proxyError('NVIDIA API key를 입력해주세요.')

  const operation = safeString(body?.operation, 20).toLowerCase()
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }

  if (operation === 'models') {
    return {
      url: `${NVIDIA_API_BASE_URL}/models`,
      options: { method: 'GET', headers },
    }
  }

  if (operation === 'chat') {
    return {
      url: `${NVIDIA_API_BASE_URL}/chat/completions`,
      options: {
        method: 'POST',
        headers,
        body: JSON.stringify(chatRequestFromBody(body)),
      },
    }
  }

  throw proxyError('지원하지 않는 NVIDIA 요청입니다.')
}

export async function fetchNvidiaUpstream(body, signal) {
  const request = createNvidiaUpstreamRequest(body)
  let response
  try {
    response = await fetch(request.url, { ...request.options, signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw proxyError('NVIDIA API에 연결하지 못했습니다.', 502)
  }

  const contentType = response.headers.get('content-type') || ''
  let payload
  try {
    payload = contentType.includes('json') ? await response.json() : await response.text()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const error = proxyError(
      extractUpstreamMessage(payload, 'NVIDIA API 요청이 실패했습니다.') + ` (${response.status})`,
      response.status,
    )
    error.payload = payload
    throw error
  }

  return payload
}
