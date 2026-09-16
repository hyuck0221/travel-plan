import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createExternalEngine,
  normalizeExternalModels,
  parseJsonObject,
  validateExternalConnection,
} from './externalProvider.js'

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

test('routes NVIDIA model discovery and chat through the same-origin proxy', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options, body: JSON.parse(options.body || '{}') })
    if (calls.at(-1).body.operation === 'models') {
      return new Response(JSON.stringify({ data: [{ id: 'meta/llama-3.1-8b-instruct' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"intent":"answer","message":"연결 성공"}' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const connection = await validateExternalConnection({ provider: 'nvidia', apiKey: 'nvidia-test-key' })
    assert.deepEqual(connection.models, [{ id: 'meta/llama-3.1-8b-instruct', label: 'meta/llama-3.1-8b-instruct' }])

    const engine = createExternalEngine({
      provider: 'nvidia',
      apiKey: 'nvidia-test-key',
      modelId: 'meta/llama-3.1-8b-instruct',
    })
    const response = await engine.chat.completions.create({
      messages: [{ role: 'user', content: '안녕' }],
      temperature: 0.1,
      top_p: 0.8,
      max_tokens: 64,
      response_format: { type: 'json_object' },
    })

    assert.equal(response.choices[0].message.content, '{"intent":"answer","message":"연결 성공"}')
    assert.equal(calls.length, 2)
    assert.equal(calls.every(call => call.url === '/api/ai'), true)
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[0].body.apiKey, 'nvidia-test-key')
    assert.equal(calls[1].body.request.model, 'meta/llama-3.1-8b-instruct')
    assert.deepEqual(calls[1].body.request.response_format, { type: 'json_object' })
  } finally {
    globalThis.fetch = originalFetch
  }
})
