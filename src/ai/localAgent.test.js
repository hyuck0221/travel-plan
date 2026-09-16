import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyExplicitDeletes,
  applyExplicitDestinationEdits,
  applyExplicitDestinationRequests,
  applyExplicitEdits,
  applyMutationCommand,
  applyPlanOperation,
  answerScheduleQuestion,
  buildPlanOperations,
  compactConversationHistory,
  getLocalEngine,
  normalizeGeneratedDayItems,
  executeScheduleTool,
  isScheduleMutationRequest,
  parseAgentAction,
  parseControlDecision,
  parseRouteDecision,
  parseTripRequest,
  runLocalAgent,
  sanitizeSearchQuery,
  validateTripPlan,
  LOCAL_MODEL_FALLBACK_ID,
  LOCAL_MODEL_ID,
} from './localAgent.js'
import { resetMcpSession } from './mcpClient.js'

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

test('uses Qwen 3 1.7B as the default browser model and fallback', () => {
  assert.equal(LOCAL_MODEL_ID, 'Qwen3-1.7B-q4f16_1-MLC')
  assert.equal(LOCAL_MODEL_FALLBACK_ID, 'Qwen3-1.7B-q4f16_1-MLC')
})

test('does not retry the same unavailable WebGPU engine during the failure cooldown', { concurrency: false }, async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let gpuReads = 0
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      get gpu() {
        gpuReads += 1
        return null
      },
    },
  })

  try {
    await assert.rejects(getLocalEngine(), /WebGPU/)
    await assert.rejects(getLocalEngine(), /WebGPU/)
    assert.equal(gpuReads, 1)
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, 'navigator', originalDescriptor)
    else delete globalThis.navigator
  }
})

test('parses the first-stage answer or control route', () => {
  assert.deepEqual(parseRouteDecision('{"route":"answer"}'), { route: 'answer' })
  assert.deepEqual(parseRouteDecision('<think>분류</think>{"route":"control"}'), { route: 'control' })
})

test('parses a separated schedule tool decision', () => {
  assert.deepEqual(parseControlDecision('{"tool":"update_schedule","needsPlan":true,"query":""}'), {
    tool: 'update_schedule',
    needsPlan: true,
    query: '',
  })
  assert.deepEqual(parseControlDecision('{"tool":"add","needsPlan":false,"query":""}'), {
    tool: 'add_schedule',
    needsPlan: false,
    query: '',
  })
})

test('executes add, update, delete, and load as separate browser tools', async () => {
  const currentPlan = {
    title: '서울 여행',
    items: [
      { id: 'place-1', destination: '경복궁', date: '2026-09-15', time: '10:00', memo: '입장' },
      { id: 'place-2', destination: '성수동', date: '2026-09-15', time: '15:00', memo: '' },
    ],
  }

  const loaded = await executeScheduleTool('load_plan', null, { currentPlan })
  assert.equal(loaded.plan.items.length, 2)

  const added = await executeScheduleTool('add_schedule', {
    intent: 'add',
    operations: [{ action: 'add', destination: '서울숲', date: '2026-09-15', time: '18:00' }],
  }, { currentPlan, prompt: '서울숲을 일정에 추가해줘.' })
  assert.equal(added.items.length, 3)
  assert.equal(added.items.at(-1).destination, '서울숲')

  const updated = await executeScheduleTool('update_schedule', {
    intent: 'update',
    operations: [{ action: 'update', target: '경복궁', time: '11:00' }],
  }, { currentPlan, prompt: '경복궁 시간을 바꿔줘.' })
  assert.equal(updated.items[0].time, '11:00')
  assert.equal(updated.items[1].destination, '성수동')

  const deleted = await executeScheduleTool('delete_schedule', {
    intent: 'delete',
    operations: [{ action: 'delete', target: '성수동' }],
  }, { currentPlan, prompt: '성수동을 삭제해줘.' })
  assert.deepEqual(deleted.items.map(item => item.destination), ['경복궁'])
})

test('parses a compact mutation command without requiring the entire itinerary', () => {
  const action = parseAgentAction(JSON.stringify({
    intent: 'update',
    message: '경복궁 시간을 변경했습니다.',
    query: '',
    operations: [{ action: 'update', target: '경복궁', time: '11:00' }],
  }))

  assert.equal(action.mode, 'apply')
  assert.equal(action.intent, 'update')
  assert.equal(action.operations[0].target, '경복궁')
  assert.equal(action.operations[0].time, '11:00')
  assert.deepEqual(action.items, [])
})

test('applies only the requested card fields from a compact mutation command', () => {
  const currentItems = [
    { id: 'place-1', destination: '경복궁', date: '2026-09-15', time: '10:00', memo: '입장', lat: 37.58, lng: 126.97 },
    { id: 'place-2', destination: '남산서울타워', date: '2026-09-15', time: '15:00', memo: '전망', lat: 37.55, lng: 126.98 },
  ]
  const result = applyMutationCommand({
    intent: 'update',
    operations: [{ action: 'update', target: '경복궁', time: '11:00' }],
  }, currentItems, '경복궁 시간을 11시로 바꿔줘.')

  assert.equal(result.changed, true)
  assert.equal(result.items[0].time, '11:00')
  assert.equal(result.items[0].memo, '입장')
  assert.equal(result.items[0].lat, 37.58)
  assert.equal(result.items[1].time, '15:00')
})

test('replaces an existing plan with only AI-selected add operations for a full trip', () => {
  const result = applyMutationCommand({
    intent: 'replace',
    operations: [
      { action: 'add', target: 'AI가 선택한 첫 방문지', date: '2026-09-15', time: '09:30', memo: '오전 일정' },
      { action: 'add', destination: 'AI가 선택한 둘째 방문지', date: '2026-09-16', time: '13:00', memo: '오후 일정' },
    ],
  }, [
    { id: 'old-1', destination: '기존 장소', date: '2026-09-15', time: '10:00' },
  ], '리옹 1박 2일 일정을 처음부터 만들어줘.', { replaceAll: true })

  assert.deepEqual(result.items.map(item => item.destination), [
    'AI가 선택한 첫 방문지',
    'AI가 선택한 둘째 방문지',
  ])
  assert.equal(result.items.some(item => item.destination === '기존 장소'), false)
  assert.equal(result.items[0].memo, '오전 일정')
})

test('answers confident schedule questions from browser state without model prose', () => {
  const answer = answerScheduleQuestion('현재 일정 요약해줘.', {
    title: '서울 여행',
    items: [
      { destination: '경복궁', date: '2026-09-15', time: '10:00' },
      { destination: '성수동', date: '2026-09-16', time: '15:00' },
    ],
  })

  assert.match(answer, /총 2개/)
  assert.match(answer, /경복궁/)
  assert.match(answer, /성수동/)
})

test('does not treat a general travel question as an empty-plan answer', () => {
  assert.equal(answerScheduleQuestion('서울은 언제 여행하기 좋아?', { title: '', items: [] }), null)
})

test('parses fenced local-model JSON', () => {
  const fence = String.fromCharCode(96)
  const action = parseAgentAction([
    fence + fence + fence + 'json',
    '{"mode":"apply","title":"제주 여행","message":"완료","query":"","items":[]}',
    fence + fence + fence,
  ].join('\n'))

  assert.equal(action.mode, 'apply')
  assert.equal(action.title, '제주 여행')
  assert.deepEqual(action.items, [])
})

test('removes thinking blocks before parsing', () => {
  const action = parseAgentAction([
    '<think>내부 추론</think>',
    '{"mode":"answer","title":"","message":"현재 일정입니다.","query":"","items":[]}',
  ].join('\n'))

  assert.equal(action.mode, 'answer')
  assert.equal(action.message, '현재 일정입니다.')
})

test('accepts answer aliases from a chat response', () => {
  const action = parseAgentAction('{"answer":"현재 일정은 첫째 날에 경복궁이 있어요."}')

  assert.equal(action.mode, 'answer')
  assert.equal(action.message, '현재 일정은 첫째 날에 경복궁이 있어요.')
})

test('extracts JSON when the model adds prose or trailing commas', () => {
  const action = parseAgentAction('완료했어요. {"mode":"apply","title":"서울","message":"완료","query":"","items":[],}')

  assert.equal(action.mode, 'apply')
  assert.equal(action.title, '서울')
})

test('repairs common local-model JSON variants before applying a command', () => {
  const action = parseAgentAction('결과입니다. {mode: \'apply\', title: \'제주\', message: \'완료\', items: [],}')

  assert.equal(action.mode, 'apply')
  assert.equal(action.title, '제주')
  assert.equal(action.message, '완료')
})

test('accepts a top-level item array as an apply response', () => {
  const action = parseAgentAction('[{"destination":"서울"}]')

  assert.equal(action.mode, 'apply')
  assert.equal(action.items[0].destination, '서울')
})

test('rejects a response without a supported mode', () => {
  assert.throws(
    () => parseAgentAction('{"mode":"unknown","title":"","message":"","query":"","items":[]}'),
    /해석하지 못했습니다/,
  )
})

test('keeps explicit time and memo edits when the tiny model echoes the current card', () => {
  const currentItems = [{
    id: 'seoul-1', destination: '서울', date: '2026-09-15', time: '07:00', memo: '행사 및 취미를 즐기세요.',
  }]
  const result = applyExplicitEdits(
    '현재 일정의 서울 방문 시간을 10:00으로 바꾸고 메모를 아침 산책으로 수정해줘.',
    currentItems.map(item => ({ ...item })),
    currentItems,
  )

  assert.equal(result[0].time, '10:00')
  assert.equal(result[0].memo, '아침 산책')
})

test('turns an AI result into visible card-level add, update, and delete operations', () => {
  const currentPlan = {
    title: '서울 여행',
    items: [
      { id: 'seoul-1', destination: '경복궁', date: '2026-09-15', time: '10:00', memo: '입장' },
      { id: 'seoul-2', destination: '남산타워', date: '2026-09-15', time: '15:00', memo: '' },
    ],
  }
  const nextPlan = {
    title: '서울 여행',
    items: [
      { id: 'seoul-1', destination: '경복궁', date: '2026-09-15', time: '11:00', memo: '예약 확인' },
      { id: 'seoul-3', destination: '익선동', date: '2026-09-15', time: '18:00', memo: '저녁 산책' },
    ],
  }

  const operations = buildPlanOperations(currentPlan, nextPlan)
  assert.deepEqual(operations.map(operation => operation.type), ['delete', 'update', 'add'])

  let items = currentPlan.items
  for (const operation of operations) items = applyPlanOperation(items, operation)
  assert.deepEqual(items, nextPlan.items)
})

test('explicitly deleting the only matching card does not get blocked as an accidental empty plan', () => {
  const currentItems = [{ id: 'seoul-1', destination: '서울역', date: '', time: '' }]
  const result = applyExplicitDeletes('서울역 삭제해줘.', [], currentItems)
  assert.deepEqual(result, [])
})

test('preserves the exact place name from an add request before map enrichment', () => {
  const result = applyExplicitDestinationRequests(
    '서울역을 일정에 추가해줘.',
    [{ id: 'ai-item', destination: '서울', lat: 37.5, lng: 126.9 }],
    [],
  )

  assert.equal(result[0].destination, '서울역')
  assert.equal(result[0].lat, null)
  assert.equal(result[0].lng, null)
})

test('extracts a place from a contextual add request', () => {
  const result = applyExplicitDestinationRequests(
    '비어 있는 시간에는 카페를 하나 추가해줘.',
    [{ id: 'ai-item', destination: '서울' }],
    [],
  )

  assert.equal(result[0].destination, '카페')

  const withoutParticle = applyExplicitDestinationRequests(
    '부산역 추가해줘.',
    [{ id: 'ai-item', destination: '서울' }],
    [],
  )
  assert.equal(withoutParticle[0].destination, '부산역')
})

test('recognizes an explicit destination replacement', () => {
  const currentItems = [{ id: 'place-1', destination: '서울', lat: 37.5, lng: 126.9 }]
  const result = applyExplicitDestinationEdits(
    '서울을 부산으로 바꿔줘.',
    currentItems,
    currentItems,
  )

  assert.equal(result[0].destination, '부산')
  assert.equal(result[0].lat, null)
  assert.equal(result[0].lng, null)
})

test('extracts only trip metadata without using a destination library', () => {
  const request = parseTripRequest('리옹 2박 3일 일정 짜줘.', new Date(2026, 8, 15))
  assert.deepEqual(request, {
    destination: '리옹',
    nights: 2,
    days: 3,
    slotsPerDay: 3,
    startDate: '2026-09-15',
  })

  const aiItems = Array.from({ length: 9 }, (_, index) => ({
    destination: 'AI가 선택한 장소 ' + index,
    date: `2026-09-${String(15 + Math.floor(index / 3)).padStart(2, '0')}`,
    time: ['09:30', '13:00', '17:30'][index % 3],
  }))
  assert.equal(validateTripPlan(aiItems, request).valid, true)
})

test('requires the requested number of cards per day for a full trip', () => {
  const request = parseTripRequest('제주 2박 3일 일정 만들어줘.', new Date(2026, 8, 15))
  const incomplete = Array.from({ length: 6 }, (_, index) => ({
    destination: '제주 장소 ' + index,
    date: `2026-09-${String(15 + Math.floor(index / 2)).padStart(2, '0')}`,
    time: ['09:00', '15:00'][index % 2],
  }))
  const complete = Array.from({ length: 9 }, (_, index) => ({
    destination: '제주 명소 ' + index,
    date: `2026-09-${String(15 + Math.floor(index / 3)).padStart(2, '0')}`,
    time: ['09:00', '12:30', '16:00'][index % 3],
  }))

  assert.equal(validateTripPlan(incomplete, request).valid, false)
  assert.equal(validateTripPlan(complete, request).valid, true)
})

test('normalizes missing and duplicate daily times without losing unique places', () => {
  const items = normalizeGeneratedDayItems([
    { destination: '성산일출봉', time: '09:00' },
    { destination: '섭지코지', time: '09:00' },
    { destination: '동문시장', time: '' },
  ], '2026-09-15')

  assert.equal(items.length, 3)
  assert.deepEqual(items.map(item => item.date), ['2026-09-15', '2026-09-15', '2026-09-15'])
  assert.equal(new Set(items.map(item => item.time)).size, 3)
})

test('rejects a tiny model result that collapses a three-day trip into one card', () => {
  const request = parseTripRequest('서울 2박 3일 일정 짜줘.', new Date(2026, 8, 15))
  const collapsed = [{ destination: '서울', date: '2026-09-15', time: '07:00' }]
  const quality = validateTripPlan(collapsed, request)

  assert.equal(quality.valid, false)
  assert.match(quality.issues.join(' '), /여행 날짜|일정이 두 개|서로 다른 장소/)
})

test('keeps only recent user and assistant messages for the next model context', () => {
  const history = [
    { role: 'system', content: '무시할 시스템 메시지' },
    ...Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: '메시지 ' + index,
    })),
  ]

  const compacted = compactConversationHistory(history)
  assert.equal(compacted.length, 10)
  assert.equal(compacted[0].content, '메시지 2')
  assert.equal(compacted[9].content, '메시지 11')
  assert.equal(compacted.every(message => message.role === 'user' || message.role === 'assistant'), true)
})

test('distinguishes chat questions from explicit schedule changes', () => {
  assert.equal(isScheduleMutationRequest('현재 일정 중에서 가장 여유로운 날이 언제야?'), false)
  assert.equal(isScheduleMutationRequest('서울에서 가볼 만한 맛집을 추천해줘.'), false)
  assert.equal(isScheduleMutationRequest('경복궁을 삭제해도 돼?'), false)
  assert.equal(isScheduleMutationRequest('현재 일정 요약해줘.'), false)
  assert.equal(isScheduleMutationRequest('성수동 일정을 하나 추가해줘.'), true)
  assert.equal(isScheduleMutationRequest('성수동 일정을 조금 더 늘려줄래?'), true)
  assert.equal(isScheduleMutationRequest('경복궁 시간을 11시로 바꿔줘.'), true)
  assert.equal(isScheduleMutationRequest('서울 2박 3일 일정 짜줘.'), true)
  assert.equal(isScheduleMutationRequest('서울 2박 3일 일정 알려줘.'), false)
})

test('does not send schedule edit instructions to Naver as a place query', () => {
  const currentItems = [{ id: 'place-1', destination: '성수동', date: '2026-09-16' }]

  assert.equal(
    sanitizeSearchQuery('특정 일정을 고쳐줘', '특정 일정을 고쳐줘', currentItems),
    '',
  )
  assert.equal(
    sanitizeSearchQuery('성수동 일정을 조금 더 늘려줘', '성수동 일정을 조금 더 늘려줘', currentItems),
    '성수동',
  )
  assert.equal(
    sanitizeSearchQuery('경복궁을 남산서울타워로 바꿔줘', '경복궁을 남산서울타워로 바꿔줘', [
      { id: 'place-1', destination: '경복궁' },
    ]),
    '남산서울타워',
  )
  assert.equal(
    sanitizeSearchQuery('서울 맛집 추천해줘', '서울 맛집 추천해줘', []),
    '서울 맛집',
  )
})

test('stops an already-cancelled agent before starting any orchestration', async () => {
  const controller = new AbortController()
  controller.abort()
  const events = []

  await assert.rejects(
    runLocalAgent({
      prompt: '서울 2박 3일 일정 짜줘.',
      signal: controller.signal,
      onEvent: event => events.push(event),
    }),
    error => error?.name === 'AbortError',
  )

  assert.deepEqual(events, [])
})

test('creates a three-day itinerary from operations-only model output', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const chatRequests = []
  resetMcpSession()

  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}')
    if (url === '/api/ai') {
      chatRequests.push(body)
      const request = JSON.parse(body.request.messages.at(-1).content)
      const day = request.fullTripDay
      const operations = Array.from({ length: day.slots }, (_, index) => ({
        action: 'add',
        target: `제주 테스트 장소 ${day.day}-${index + 1}`,
        date: day.date,
        time: '09:00',
        memo: `${day.day}일차 일정`,
      }))
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ mode: 'apply', operations }) } }],
      })
    }
    if (url === '/mcp') {
      if (body.method === 'initialize') return jsonResponse({ result: {} })
      if (body.method === 'notifications/initialized') return jsonResponse({})
      const query = body.params?.arguments?.query || '제주 장소'
      return mcpSearchResponse([{
        title: query,
        address: '제주특별자치도',
        roadAddress: '제주특별자치도',
        lat: 33.4,
        lng: 126.5,
      }])
    }
    throw new Error('unexpected endpoint: ' + url)
  }

  try {
    const result = await runLocalAgent({
      prompt: '제주 2박 3일 일정 만들어줘.',
      currentPlan: { title: '', items: [] },
      aiConfig: {
        mode: 'api',
        external: {
          provider: 'nvidia',
          apiKey: 'nvidia-test-key',
          modelId: 'meta/llama-3.1-8b-instruct',
          connected: true,
        },
      },
      signal: new AbortController().signal,
      onApplyPlan: () => {},
    })

    assert.equal(chatRequests.length, 3)
    assert.equal(chatRequests.every(request => request.operation === 'chat'), true)
    assert.equal(result.action.mode, 'apply')
    assert.equal(result.plan.items.length, 9)
    assert.equal(new Set(result.plan.items.map(item => item.destination)).size, 9)
    assert.deepEqual([...new Set(result.plan.items.map(item => item.date))], [
      result.plan.items[0].date,
      result.plan.items[3].date,
      result.plan.items[6].date,
    ])
    for (const date of new Set(result.plan.items.map(item => item.date))) {
      const dayItems = result.plan.items.filter(item => item.date === date)
      assert.equal(dayItems.length, 3)
      assert.equal(new Set(dayItems.map(item => item.time)).size, 3)
      assert.equal(dayItems.every(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)), true)
    }
  } finally {
    globalThis.fetch = originalFetch
    resetMcpSession()
  }
})

test('falls back to searched places when the model repeatedly returns invalid JSON', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const chatRequests = []
  resetMcpSession()

  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}')
    if (url === '/api/ai') {
      chatRequests.push(body)
      return jsonResponse({ choices: [{ message: { content: '일정을 만들 수 없습니다.' } }] })
    }
    if (url === '/mcp') {
      if (body.method === 'initialize') return jsonResponse({ result: {} })
      if (body.method === 'notifications/initialized') return jsonResponse({})
      const query = body.params?.arguments?.query || '제주'
      return mcpSearchResponse(Array.from({ length: 10 }, (_, index) => ({
        title: `${query} 검색 장소 ${index + 1}`,
        address: '제주특별자치도',
        roadAddress: '제주특별자치도',
        lat: 33.4 + index / 100,
        lng: 126.5 + index / 100,
      })))
    }
    throw new Error('unexpected endpoint: ' + url)
  }

  try {
    const result = await runLocalAgent({
      prompt: '제주 2박 3일 일정 만들어줘.',
      currentPlan: { title: '', items: [] },
      aiConfig: {
        mode: 'api',
        external: {
          provider: 'nvidia',
          apiKey: 'nvidia-test-key',
          modelId: 'meta/llama-3.1-8b-instruct',
          connected: true,
        },
      },
      signal: new AbortController().signal,
      onApplyPlan: () => {},
    })

    assert.equal(chatRequests.length, 3)
    assert.equal(result.action.mode, 'apply')
    assert.match(result.action.message, /검색된 장소/)
    assert.equal(result.plan.items.length, 9)
    assert.equal(result.plan.items.every(item => item.address === '제주특별자치도'), true)
  } finally {
    globalThis.fetch = originalFetch
    resetMcpSession()
  }
})

test('completes a trip request from search results when WebGPU is unavailable', { concurrency: false }, async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalFetch = globalThis.fetch
  resetMcpSession()
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  })
  globalThis.fetch = async (url, options = {}) => {
    if (url !== '/mcp') throw new Error('local fallback should not call an AI API')
    const body = JSON.parse(options.body || '{}')
    if (body.method === 'initialize') return jsonResponse({ result: {} })
    if (body.method === 'notifications/initialized') return jsonResponse({})
    return mcpSearchResponse(Array.from({ length: 3 }, (_, index) => ({
      title: `제주 대체 장소 ${index + 1}`,
      address: '제주특별자치도',
      roadAddress: '제주특별자치도',
      lat: 33.4 + index / 100,
      lng: 126.5 + index / 100,
    })))
  }

  try {
    const result = await runLocalAgent({
      prompt: '제주 1일 일정 만들어줘.',
      currentPlan: { title: '', items: [] },
      signal: new AbortController().signal,
      onApplyPlan: () => {},
    })

    assert.equal(result.action.mode, 'apply')
    assert.match(result.action.message, /검색된 장소/)
    assert.equal(result.plan.items.length, 3)
  } finally {
    globalThis.fetch = originalFetch
    if (originalDescriptor) Object.defineProperty(globalThis, 'navigator', originalDescriptor)
    else delete globalThis.navigator
    resetMcpSession()
  }
})
