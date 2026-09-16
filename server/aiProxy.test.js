import test from 'node:test'
import assert from 'node:assert/strict'
import { createNvidiaUpstreamRequest } from './aiProxy.js'

test('builds a restricted NVIDIA chat request for the server proxy', () => {
  const request = createNvidiaUpstreamRequest({
    operation: 'chat',
    apiKey: ' nvidia-test-key ',
    request: {
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{ role: 'system', content: 'JSON으로 답해줘.' }, { role: 'user', content: '제주 일정' }],
      temperature: 9,
      top_p: -1,
      max_tokens: 99999,
      response_format: { type: 'json_schema', schema: { secret: true } },
      extra_body: { shouldNotForward: true },
    },
  })

  assert.equal(request.url, 'https://integrate.api.nvidia.com/v1/chat/completions')
  assert.equal(request.options.headers.Authorization, 'Bearer nvidia-test-key')
  assert.deepEqual(JSON.parse(request.options.body), {
    model: 'meta/llama-3.1-8b-instruct',
    messages: [
      { role: 'system', content: 'JSON으로 답해줘.' },
      { role: 'user', content: '제주 일정' },
    ],
    stream: false,
    temperature: 2,
    top_p: 0,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  })
})

test('rejects proxy requests without an NVIDIA key or supported operation', () => {
  assert.throws(
    () => createNvidiaUpstreamRequest({ operation: 'models' }),
    /NVIDIA API key를 입력해주세요/,
  )
  assert.throws(
    () => createNvidiaUpstreamRequest({ operation: 'embeddings', apiKey: 'test' }),
    /지원하지 않는 NVIDIA 요청/,
  )
})
