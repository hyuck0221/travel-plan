import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeExternalModels, parseJsonObject } from './externalProvider.js'

test('normalizes OpenAI-compatible model lists and removes non-chat models', () => {
  const models = normalizeExternalModels({
    data: [
      { id: 'gpt-4.1', owned_by: 'openai' },
      { id: 'text-embedding-3-small', owned_by: 'openai' },
      { id: 'gpt-4.1' },
    ],
  })

  assert.deepEqual(models, [{ id: 'gpt-4.1', label: 'gpt-4.1' }])
})

test('normalizes Gemini model names and checks generation support', () => {
  const models = normalizeExternalModels({
    models: [
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ],
  })

  assert.deepEqual(models, [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }])
})

test('parses custom API header and body objects', () => {
  assert.deepEqual(parseJsonObject('{"Authorization":"Bearer test"}', 'Header'), {
    Authorization: 'Bearer test',
  })
  assert.deepEqual(parseJsonObject({ model: 'custom' }, 'Body'), { model: 'custom' })
  assert.throws(() => parseJsonObject('[]', 'Body'), /객체 형식/)
})

