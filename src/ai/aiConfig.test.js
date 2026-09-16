import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_CONFIG_STORAGE_KEY,
  LOCAL_MODEL_OPTIONS,
  loadAiConfig,
  saveAiConfig,
} from './aiConfig.js'

function withFakeStorage(run) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window')
  const previousWindow = globalThis.window
  const values = new Map()
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  }
  try {
    return run(values)
  } finally {
    if (hadWindow) globalThis.window = previousWindow
    else delete globalThis.window
  }
}

test('persists the selected local model without saving chat history', () => {
  withFakeStorage(values => {
    const config = { mode: 'local', localModelId: LOCAL_MODEL_OPTIONS[1].id, external: null }
    saveAiConfig(config)

    assert.equal(values.has(AI_CONFIG_STORAGE_KEY), true)
    assert.deepEqual(loadAiConfig(), config)
    assert.equal(values.has('travelink-ai-chat'), false)
  })
})

test('places Qwen 3 1.7B first as the default local model', () => {
  assert.equal(LOCAL_MODEL_OPTIONS[0].id, 'Qwen3-1.7B-q4f16_1-MLC')
  assert.equal(LOCAL_MODEL_OPTIONS[0].label, 'Qwen 3 1.7B')
  assert.equal(LOCAL_MODEL_OPTIONS[0].badge, '기본')
  assert.equal(LOCAL_MODEL_OPTIONS.some(model => /Qwen 2\.5|Qwen 2\.6/u.test(model.label)), false)
})

test('persists an external provider connection and selected model', () => {
  withFakeStorage(() => {
    const config = {
      mode: 'api',
      localModelId: LOCAL_MODEL_OPTIONS[0].id,
      external: {
        provider: 'openai',
        apiKey: 'test-key',
        modelId: 'gpt-test',
        models: [{ id: 'gpt-test', label: 'GPT Test' }],
        connected: true,
      },
    }

    saveAiConfig(config)
    assert.deepEqual(loadAiConfig(), config)
  })
})
