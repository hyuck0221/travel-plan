const PROVIDER_ENDPOINTS = Object.freeze({
  openai: {
    modelsUrl: 'https://api.openai.com/v1/models',
    chatUrl: 'https://api.openai.com/v1/chat/completions',
  },
  anthropic: {
    modelsUrl: 'https://api.anthropic.com/v1/models',
    chatUrl: 'https://api.anthropic.com/v1/messages',
  },
  gemini: {
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  grok: {
    modelsUrl: 'https://api.x.ai/v1/models',
    chatUrl: 'https://api.x.ai/v1/chat/completions',
  },
  nvidia: {
    modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
    chatUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
  },
})

function safeString(value, maxLength = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function parseJsonObject(value, label = 'JSON') {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  const text = safeString(value)
  if (!text) return {}
  let parsed
  try { parsed = JSON.parse(text) } catch {
    throw new Error(`${label} 형식이 올바르지 않습니다.`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label}은 객체 형식이어야 합니다.`)
  }
  return parsed
}

function providerHeaders(providerId, apiKey) {
  if (providerId === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

function cleanGeminiModelId(value) {
  return safeString(value, 180).replace(/^models\//u, '')
}

function errorMessage(payload, fallback) {
  const error = payload?.error
  if (typeof error === 'string') return error
  if (error?.message) return error.message
  if (payload?.message) return payload.message
  return fallback
}

async function readResponse(response, fallback) {
  const contentType = response.headers.get('content-type') || ''
  let payload
  try {
    payload = contentType.includes('json') ? await response.json() : await response.text()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : errorMessage(payload, fallback)
    throw new Error(`${message} (${response.status})`)
  }
  return payload
}

function modelIdFromEntry(entry) {
  return cleanGeminiModelId(entry?.id || entry?.name || entry?.model || entry?.modelId)
}

function modelLabelFromEntry(entry, id) {
  return safeString(entry?.display_name || entry?.displayName || entry?.name || id, 180)
    .replace(/^models\//u, '') || id
}

function isLikelyChatModel(id, entry) {
  const value = id.toLowerCase()
  if (entry?.supportedGenerationMethods && !entry.supportedGenerationMethods.some(method => (
    /generatecontent|chat|completion/i.test(method)
  ))) return false
  return !/(?:embedding|moderation|transcription|translation|tts|whisper|image|rerank|search-preview)/u.test(value)
}

export function normalizeExternalModels(payload) {
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.items)
          ? payload.items
          : []

  const seen = new Set()
  return entries
    .map(entry => {
      const id = modelIdFromEntry(entry)
      return { id, label: modelLabelFromEntry(entry, id), entry }
    })
    .filter(model => model.id && isLikelyChatModel(model.id, model.entry))
    .filter(model => {
      if (seen.has(model.id)) return false
      seen.add(model.id)
      return true
    })
    .map(({ id, label }) => ({ id, label }))
}

function customConfigFromValue(custom) {
  const url = safeString(custom?.url, 2000)
  if (!url) throw new Error('URL을 입력해주세요.')
  try { new URL(url) } catch { throw new Error('URL 형식이 올바르지 않습니다.') }
  const headers = parseJsonObject(custom?.headers, 'Header')
  const body = parseJsonObject(custom?.body, 'Body')
  return { url, headers, body }
}

function requestBodyForCustom(body, params) {
  const replace = value => {
    if (value === '{{messages}}') return params.messages || []
    if (value === '{{model}}') return params.model || ''
    if (value === '{{prompt}}') return params.messages?.at(-1)?.content || ''
    if (Array.isArray(value)) return value.map(replace)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]))
    if (typeof value === 'string') return value
    return value
  }
  const nextBody = replace(body)
  if (nextBody && typeof nextBody === 'object') {
    if (Object.prototype.hasOwnProperty.call(nextBody, 'messages')) nextBody.messages = params.messages || []
    if (Object.prototype.hasOwnProperty.call(nextBody, 'model') && params.model) nextBody.model = params.model
  }
  return nextBody
}

async function fetchModelsForProvider(providerId, apiKey, signal) {
  const endpoint = PROVIDER_ENDPOINTS[providerId]
  if (!endpoint) throw new Error('지원하지 않는 AI 서비스입니다.')

  const headers = providerId === 'gemini'
    ? { 'Content-Type': 'application/json' }
    : providerHeaders(providerId, apiKey)
  const url = providerId === 'gemini'
    ? `${endpoint.modelsUrl}?key=${encodeURIComponent(apiKey)}`
    : endpoint.modelsUrl
  const response = await fetch(url, { headers, signal })
  const payload = await readResponse(response, '모델 목록을 불러오지 못했습니다.')
  const models = normalizeExternalModels(payload)
  if (models.length === 0) throw new Error('사용할 수 있는 채팅 모델을 찾지 못했습니다.')
  return models
}

export async function validateExternalConnection(config, signal) {
  const providerId = safeString(config?.provider, 40).toLowerCase()
  if (providerId === 'custom') {
    const custom = customConfigFromValue(config?.custom)
    const headers = { 'Content-Type': 'application/json', ...custom.headers }
    const response = await fetch(custom.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(custom.body),
      signal,
    })
    const payload = await readResponse(response, '사용자 API에 연결하지 못했습니다.')
    const modelId = safeString(custom.body?.model || custom.body?.modelId, 180) || 'custom'
    return {
      models: [{ id: modelId, label: modelId }],
      custom: { url: custom.url, headers: custom.headers, body: custom.body, rawHeaders: JSON.stringify(custom.headers), rawBody: JSON.stringify(custom.body) },
      payload,
    }
  }

  const apiKey = safeString(config?.apiKey, 1000)
  if (!apiKey) throw new Error('API key를 입력해주세요.')
  const models = await fetchModelsForProvider(providerId, apiKey, signal)
  return { models }
}

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(message => ['system', 'user', 'assistant'].includes(message?.role))
    .map(message => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content || ''),
    }))
}

function toCompletionResponse(payload) {
  if (payload?.choices) return payload
  if (typeof payload?.output_text === 'string') {
    return { choices: [{ message: { content: payload.output_text } }] }
  }
  if (typeof payload?.text === 'string') {
    return { choices: [{ message: { content: payload.text } }] }
  }
  if (typeof payload?.content === 'string') {
    return { choices: [{ message: { content: payload.content } }] }
  }
  if (Array.isArray(payload?.content)) {
    return { choices: [{ message: { content: payload.content.map(part => part?.text || '').join('') } }] }
  }
  if (Array.isArray(payload?.candidates)) {
    const content = payload.candidates[0]?.content?.parts?.map(part => part?.text || '').join('') || ''
    return { choices: [{ message: { content } }] }
  }
  return { choices: [{ message: { content: JSON.stringify(payload || {}) } }] }
}

async function callOpenAiCompatible(providerId, config, params, signal) {
  const endpoint = PROVIDER_ENDPOINTS[providerId]
  const response = await fetch(endpoint.chatUrl, {
    method: 'POST',
    headers: providerHeaders(providerId, config.apiKey),
    body: JSON.stringify({
      model: config.modelId,
      messages: normalizeMessages(params.messages),
      temperature: params.temperature,
      top_p: params.top_p,
      max_tokens: params.max_tokens,
      // WebLLM 내부 스키마는 OpenAI 호환 API의 표준 형식과 다르므로
      // 외부 API에는 JSON 출력 모드로만 변환해 전달한다.
      ...(params.response_format ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal,
  })
  return toCompletionResponse(await readResponse(response, 'AI 응답을 받지 못했습니다.'))
}

async function callAnthropic(config, params, signal) {
  const messages = normalizeMessages(params.messages)
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
  const response = await fetch(PROVIDER_ENDPOINTS.anthropic.chatUrl, {
    method: 'POST',
    headers: providerHeaders('anthropic', config.apiKey),
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: params.max_tokens || 512,
      temperature: params.temperature,
      ...(system ? { system } : {}),
      messages: messages.filter(message => message.role !== 'system'),
    }),
    signal,
  })
  return toCompletionResponse(await readResponse(response, 'AI 응답을 받지 못했습니다.'))
}

async function callGemini(config, params, signal) {
  const messages = normalizeMessages(params.messages)
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
  const contents = messages
    .filter(message => message.role !== 'system')
    .map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))
  const modelId = cleanGeminiModelId(config.modelId)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(config.apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: {
        temperature: params.temperature,
        topP: params.top_p,
        maxOutputTokens: params.max_tokens,
        ...(params.response_format ? { responseMimeType: 'application/json' } : {}),
      },
    }),
    signal,
  })
  return toCompletionResponse(await readResponse(response, 'AI 응답을 받지 못했습니다.'))
}

async function callCustom(config, params, signal) {
  const custom = customConfigFromValue(config.custom)
  const headers = { 'Content-Type': 'application/json', ...custom.headers }
  const response = await fetch(custom.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBodyForCustom(custom.body, params)),
    signal,
  })
  return toCompletionResponse(await readResponse(response, '사용자 API 응답을 받지 못했습니다.'))
}

export function createExternalEngine(config, signal) {
  const providerId = safeString(config?.provider, 40).toLowerCase()
  return {
    chat: {
      completions: {
        create: params => {
          if (providerId === 'anthropic') return callAnthropic(config, params, signal)
          if (providerId === 'gemini') return callGemini(config, params, signal)
          if (providerId === 'custom') return callCustom(config, params, signal)
          return callOpenAiCompatible(providerId, config, params, signal)
        },
      },
    },
  }
}
