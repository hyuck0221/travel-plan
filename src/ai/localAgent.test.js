import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyExplicitDeletes,
  applyExplicitDestinationEdits,
  applyExplicitDestinationRequests,
  applyExplicitEdits,
  applyPlanOperation,
  buildPlanOperations,
  buildTripBlueprint,
  compactConversationHistory,
  parseAgentAction,
  parseTripRequest,
  validateTripPlan,
} from './localAgent.js'

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

test('extracts JSON when the model adds prose or trailing commas', () => {
  const action = parseAgentAction('완료했어요. {"mode":"apply","title":"서울","message":"완료","query":"","items":[],}')

  assert.equal(action.mode, 'apply')
  assert.equal(action.title, '서울')
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

test('creates a deterministic three-day blueprint for a full-trip request', () => {
  const request = parseTripRequest('서울 2박 3일 일정 짜줘.', new Date(2026, 8, 15))
  assert.deepEqual(request, {
    destination: '서울',
    destinationKey: '서울',
    nights: 2,
    days: 3,
    slotsPerDay: 3,
    startDate: '2026-09-15',
  })

  const blueprint = buildTripBlueprint(request)
  assert.equal(blueprint.length, 9)
  assert.deepEqual([...new Set(blueprint.map(item => item.date))], [
    '2026-09-15',
    '2026-09-16',
    '2026-09-17',
  ])
  assert.deepEqual(blueprint.slice(0, 3).map(item => item.time), ['10:00', '13:00', '17:00'])
  assert.equal(validateTripPlan(blueprint, request).valid, true)
  assert.equal(new Set(blueprint.map(item => item.destination)).size, 9)
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
