export const LOCAL_MODEL_ID = 'Qwen2.5-3B-Instruct-q4f16_1-MLC'
export const LOCAL_MODEL_LABEL = 'Qwen 2.5 3B'
export const LOCAL_MODEL_FALLBACK_ID = 'Qwen3-1.7B-q4f16_1-MLC'
export const LOCAL_MODEL_FALLBACK_LABEL = 'Qwen 3 1.7B'

// WebLLM 0.2.85에 포함된 Qwen 계열 모델만 노출한다.
// 기본 모델은 3B 모델로 고정하고, 나머지는 사용자가
// 기기의 WebGPU 메모리에 맞춰 선택한다.
export const LOCAL_MODEL_OPTIONS = Object.freeze([
  { id: LOCAL_MODEL_ID, label: LOCAL_MODEL_LABEL, badge: '기본' },
  { id: 'Qwen3-4B-q4f16_1-MLC', label: 'Qwen 3 4B', badge: '상위' },
  { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 7B', badge: '상위' },
  { id: 'Qwen3-8B-q4f16_1-MLC', label: 'Qwen 3 8B', badge: '고성능' },
  { id: 'Qwen3.5-4B-q4f16_1-MLC', label: 'Qwen 3.5 4B', badge: '고성능' },
  { id: LOCAL_MODEL_FALLBACK_ID, label: LOCAL_MODEL_FALLBACK_LABEL, badge: '가벼움' },
])

export const API_PROVIDER_OPTIONS = Object.freeze([
  { id: 'openai', label: 'ChatGPT', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Claude', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini', label: 'Gemini', keyUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'grok', label: 'Grok', keyUrl: 'https://console.x.ai/' },
  { id: 'nvidia', label: 'NVIDIA', keyUrl: 'https://build.nvidia.com/' },
  { id: 'custom', label: '기타', keyUrl: '' },
])

export const AI_CONFIG_STORAGE_KEY = 'travelink-ai-config'

const LOCAL_MODEL_IDS = new Set(LOCAL_MODEL_OPTIONS.map(model => model.id))
const API_PROVIDER_IDS = new Set(API_PROVIDER_OPTIONS.map(provider => provider.id))

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeStoredString(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function normalizeStoredModels(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(model => isRecord(model) && typeof model.id === 'string' && model.id.trim())
    .slice(0, 100)
    .map(model => ({
      id: safeStoredString(model.id, 180),
      label: safeStoredString(model.label, 180) || safeStoredString(model.id, 180),
    }))
}

function normalizeStoredCustom(value) {
  if (!isRecord(value)) return null
  const url = safeStoredString(value.url, 2000).trim()
  if (!url) return null
  return {
    url,
    headers: typeof value.headers === 'string' ? value.headers.slice(0, 12000) : value.headers || {},
    body: typeof value.body === 'string' ? value.body.slice(0, 24000) : value.body || {},
  }
}

export function createDefaultAiConfig() {
  return {
    mode: 'local',
    localModelId: LOCAL_MODEL_ID,
    external: null,
  }
}

export function normalizeAiConfig(value) {
  const fallback = createDefaultAiConfig()
  const localModelId = LOCAL_MODEL_IDS.has(value?.localModelId) ? value.localModelId : fallback.localModelId

  if (value?.mode !== 'api' || !isRecord(value.external)) {
    return { ...fallback, localModelId }
  }

  const provider = typeof value.external.provider === 'string' ? value.external.provider.toLowerCase() : ''
  const modelId = safeStoredString(value.external.modelId, 180).trim()
  if (!API_PROVIDER_IDS.has(provider) || !modelId) {
    return { ...fallback, localModelId }
  }

  const external = {
    provider,
    modelId,
    models: normalizeStoredModels(value.external.models),
    connected: Boolean(value.external.connected),
  }

  if (provider === 'custom') {
    const custom = normalizeStoredCustom(value.external.custom)
    if (!custom) return { ...fallback, localModelId }
    external.custom = custom
  } else {
    const apiKey = safeStoredString(value.external.apiKey, 1000).trim()
    if (!apiKey) return { ...fallback, localModelId }
    external.apiKey = apiKey
  }

  return {
    mode: 'api',
    localModelId,
    external,
  }
}

function getStorage() {
  if (typeof window === 'undefined') return null
  try { return window.localStorage } catch { return null }
}

export function loadAiConfig() {
  const storage = getStorage()
  if (!storage) return createDefaultAiConfig()
  try {
    const raw = storage.getItem(AI_CONFIG_STORAGE_KEY)
    return raw ? normalizeAiConfig(JSON.parse(raw)) : createDefaultAiConfig()
  } catch {
    return createDefaultAiConfig()
  }
}

export function saveAiConfig(value) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(normalizeAiConfig(value)))
  } catch {
    // 저장소 접근이 제한되거나 용량이 부족해도 AI 실행 자체는 계속한다.
  }
}
