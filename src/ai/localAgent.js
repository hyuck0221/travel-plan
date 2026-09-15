import { searchPlaces } from './mcpClient.js'

export const LOCAL_MODEL_ID = 'Qwen2.5-3B-Instruct-q4f16_1-MLC'
export const LOCAL_MODEL_LABEL = 'Qwen 2.5 3B'

let enginePromise = null
let engineInstance = null
let engineLoadToken = null
let worker = null
let progressListener = null
let engineReady = false

const ACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: { type: 'string', enum: ['apply', 'search', 'answer'] },
    title: { type: 'string' },
    message: { type: 'string' },
    query: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          destination: { type: 'string' },
          address: { type: 'string' },
          lat: { type: 'number' },
          lng: { type: 'number' },
          memo: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          category: { type: 'string' },
          cost: { type: 'string' },
        },
        required: ['destination', 'address', 'memo', 'date', 'time', 'category', 'cost'],
      },
    },
  },
  required: ['mode', 'title', 'message', 'query', 'items'],
}

const SYSTEM_PROMPT = [
  '너는 Travelink 브라우저 일정 편집 도우미다.',
  '사용자의 요청을 현재 여행 일정에 적용하거나 질문에 답하는 JSON 하나로만 답한다. 마크다운, 설명, 코드블록은 쓰지 않는다.',
  '',
  '규칙:',
  '1. mode는 apply, search, answer 중 하나다.',
  '2. 사용자가 추가·삭제·수정·변경·이동·시간 조정·일정 생성처럼 일정 변경을 명확히 요청했을 때만 mode=apply를 사용한다.',
  '3. 일정 조회, 요약, 설명, 추천, 비교, 여행지 정보, 일반 대화처럼 일정 변경이 아닌 요청은 mode=answer를 사용한다. 이때 message에 질문에 대한 실제 답변을 쓰고 items는 빈 배열로 둔다. 일정에 아무것도 적용하지 않는다.',
  '4. 장소 검색만 요청했을 때는 mode=search와 query를 사용한다. 검색 뒤에는 검색 결과를 참고해 mode=answer로 실제 답변을 작성한다.',
  '5. apply일 때 items는 최종 일정 전체 목록이다. 기존 일정의 id는 그대로 보존하고, 새 일정은 id를 비워 둔다. 사용자가 삭제를 요청한 항목은 최종 목록에서 제외한다.',
  '6. 장소명, 날짜(YYYY-MM-DD), 시간(HH:mm), 메모, 카테고리(hotel/restaurant/cafe/attraction/shopping/transport/activity/nature), 비용 문자열을 가능한 한 채운다. 모르는 값은 빈 문자열이다.',
  '7. 장소가 여러 개면 사용자의 순서와 시간 흐름을 유지한다. 현재 일정의 의도하지 않은 항목을 임의로 지우지 않는다.',
  '8. 좌표는 알고 있을 때만 숫자로 넣고, 모르면 생략한다. 브라우저가 장소 검색 결과로 보강한다.',
  '9. 제목을 바꾸라는 요청이 없으면 기존 title을 유지한다.',
  '',
  '출력 JSON 형식:',
  '{"mode":"apply|search|answer","title":"제목","message":"질문에 대한 답변 또는 완료 메시지","query":"검색어 또는 빈 문자열","items":[{"id":"기존 id 또는 빈 문자열","destination":"장소","address":"","lat":0,"lng":0,"memo":"","date":"YYYY-MM-DD","time":"HH:mm","category":"","cost":""}]}',
].join('\n')

function emitProgress(report) {
  progressListener?.({
    progress: Number.isFinite(report?.progress) ? report.progress : 0,
    text: report?.text || '',
  })
}

function createAbortError() {
  return new DOMException('Aborted', 'AbortError')
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError()
}

export function isLocalEngineReady() {
  return engineReady
}

export async function getLocalEngine(onProgress) {
  if (!globalThis.navigator?.gpu) {
    throw new Error('이 브라우저는 WebGPU를 지원하지 않아 로컬 AI를 실행할 수 없습니다.')
  }

  progressListener = onProgress
  if (enginePromise) return enginePromise

  const loadToken = { cancelled: false, reject: null, promise: null }
  engineLoadToken = loadToken
  const loadPromise = (async () => {
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
    if (loadToken.cancelled) throw createAbortError()
    worker = worker || new Worker(new URL('./llm.worker.js', import.meta.url), { type: 'module' })
    return CreateWebWorkerMLCEngine(worker, LOCAL_MODEL_ID, {
      initProgressCallback: emitProgress,
    })
  })()
  const cancellationPromise = new Promise((_, reject) => { loadToken.reject = reject })
  const pendingPromise = Promise.race([loadPromise, cancellationPromise])
  loadToken.promise = pendingPromise
  enginePromise = pendingPromise

  try {
    const engine = await pendingPromise
    if (loadToken.cancelled) throw createAbortError()
    engineInstance = engine
    engineReady = true
    return engine
  } catch (error) {
    if (enginePromise === pendingPromise) {
      engineReady = false
      engineInstance = null
      enginePromise = null
      engineLoadToken = null
      worker?.terminate()
      worker = null
    }
    throw error
  }
}

/** 모델 로딩 중인 Web Worker와 대기 Promise를 즉시 취소한다. */
export function cancelLocalEngineLoad() {
  if (engineReady || !enginePromise || !engineLoadToken) return

  const loadToken = engineLoadToken
  loadToken.cancelled = true
  loadToken.reject?.(createAbortError())
  worker?.terminate()
  worker = null
  engineReady = false
  engineInstance = null
  enginePromise = null
  engineLoadToken = null
  progressListener = null
}

/** 현재 진행 중인 WebLLM 토큰 생성을 즉시 중단한다. */
export function interruptLocalEngineGeneration() {
  try {
    const interruption = engineInstance?.interruptGenerate?.()
    interruption?.catch?.(() => {})
  } catch {}
}

function compactPlan(plan) {
  return {
    title: String(plan?.title || ''),
    items: Array.isArray(plan?.items) ? plan.items.map(item => ({
      id: item.id,
      destination: item.destination || '',
      address: item.address || '',
      lat: Number.isFinite(Number(item.lat)) ? Number(item.lat) : undefined,
      lng: Number.isFinite(Number(item.lng)) ? Number(item.lng) : undefined,
      memo: item.memo || '',
      date: item.date || '',
      time: item.time || '',
      category: item.category || '',
      cost: item.cost || '',
    })) : [],
  }
}

/**
 * 채팅 UI에 남아 있는 대화를 다음 로컬 모델 요청에도 전달한다.
 * 일정 전체 상태는 currentPlan으로 별도 전달하므로, 대화는 최근 메시지만
 * 제한해 브라우저 메모리와 작은 모델의 컨텍스트를 동시에 보호한다.
 */
export function compactConversationHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter(message => ['user', 'assistant'].includes(message?.role))
    .slice(-10)
    .map(message => ({
      role: message.role,
      content: safeString(message.content, 1200),
    }))
    .filter(message => message.content)
}

function stripThinking(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|(?:im_end|endoftext|eot_id|end|assistant)\|>/gi, '')
    .trim()
}

function extractJsonCandidates(text) {
  const candidates = []
  for (let start = 0; start < text.length; start += 1) {
    // 임베디드 배열(items)의 []를 최상위 응답으로 오인하지 않도록
    // 설명 속 JSON 객체만 후보로 수집한다. 최상위 배열은 호출부에서 별도 처리한다.
    if (text[start] !== '{') continue

    const stack = []
    let inString = false
    let escaped = false
    for (let index = start; index < text.length; index += 1) {
      const char = text[index]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') { inString = true; continue }
      if (char === '{' || char === '[') stack.push(char)
      if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '['
        if (stack.pop() !== expected) break
        if (stack.length === 0) {
          candidates.push(text.slice(start, index + 1))
          break
        }
      }
    }
  }
  return candidates
}

function tryParseJson(candidate) {
  const attempts = [candidate, candidate.replace(/,\s*([}\]])/g, '$1')]
  if (!candidate.includes('"') && candidate.includes("'")) attempts.push(candidate.replace(/'/g, '"'))

  for (const attempt of attempts) {
    try { return JSON.parse(attempt) } catch {}
  }
  return null
}

export function parseAgentAction(rawText) {
  const fence = String.fromCharCode(96)
  const cleaned = stripThinking(rawText)
    .replace(new RegExp('^' + fence + fence + fence + '(?:json)?\\s*', 'i'), '')
    .replace(new RegExp('\\s*' + fence + fence + fence + '$'), '')
    .trim()

  const candidates = []
  if (cleaned.startsWith('{') || cleaned.startsWith('[')) candidates.push(cleaned)
  candidates.push(...extractJsonCandidates(cleaned))

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate)
    if (parsed == null) continue
    const action = Array.isArray(parsed)
      ? { mode: 'apply', items: parsed }
      : parsed?.action && typeof parsed.action === 'object'
        ? { ...parsed, ...parsed.action }
        : parsed
    const message = typeof action?.message === 'string'
      ? action.message
      : typeof action?.answer === 'string'
        ? action.answer
        : typeof action?.response === 'string'
          ? action.response
          : ''
    const mode = typeof action?.mode === 'string' ? action.mode : action?.items ? 'apply' : message ? 'answer' : ''
    if (!['apply', 'search', 'answer'].includes(mode)) continue
    return {
      mode,
      title: typeof action.title === 'string' ? action.title : '',
      message,
      query: typeof action.query === 'string' ? action.query : '',
      items: Array.isArray(action.items) ? action.items : [],
    }
  }

  throw new Error('로컬 AI의 일정 형식을 해석하지 못했습니다. 요청을 조금 더 구체적으로 적어주세요.')
}

function modelText(response) {
  const content = response?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : part?.text || '').join('')
  if (content && typeof content === 'object') return content.text || JSON.stringify(content)
  return response?.choices?.[0]?.message?.reasoning_content || ''
}

function safeString(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function isScheduleMutationRequest(prompt) {
  const text = safeString(prompt, 1200)
  if (!text) return false

  const fullTripRequest = /(?:\d+\s*박\s*\d+\s*일|\d+\s*일).*?(?:일정|여행|코스).*?(?:추천|짜|만들|구성|계획)/u.test(text)
  if (fullTripRequest) return true

  const questionLike = /[?？]|(?:어때|어떤가|일까|인가|해도\s*(?:돼|될까)|하면\s*(?:어때|좋|될까)|가능(?:할까|해)|괜찮|추천|알려|설명|요약|보여|비교|언제|어디|몇|뭐|무엇|왜|어떻게)/u.test(text)
  if (questionLike) return false

  return /(?:추가|더해|넣어|등록|생성|삭제해|지워|빼줘|제거해|수정해|바꿔|변경해|교체|이동해|옮겨|정리해|재구성해|만들어|짜줘|구성해|계획해|채워|보강해|설정해|지정해|조정해|맞춰|다듬어|개선해|늘려|줄여|앞당겨|늦춰|예약해)/u.test(text)
}

function extractPlainChatAnswer(rawText) {
  const fence = String.fromCharCode(96)
  const cleaned = stripThinking(rawText)
    .replace(new RegExp('^' + fence + fence + fence + '(?:json)?\\s*', 'i'), '')
    .replace(new RegExp('\\s*' + fence + fence + fence + '$'), '')
    .trim()
  if (!cleaned || cleaned.startsWith('{') || cleaned.startsWith('[')) return ''
  return safeString(cleaned, 2000)
}

function isCoordinate(value) {
  return value !== '' && value != null && Number.isFinite(Number(value))
}

function normalizeDestination(value) {
  return safeString(value, 180).toLowerCase().replace(/\s+/g, '')
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

function findMatchingCurrentItem(candidate, currentItems, usedIds) {
  if (candidate.id && currentItems.some(item => item.id === candidate.id)) {
    return currentItems.find(item => item.id === candidate.id)
  }

  const destination = normalizeDestination(candidate.destination)
  if (!destination) return null
  return currentItems.find(item => (
    !usedIds.has(item.id)
    && normalizeDestination(item.destination) === destination
    && (!candidate.date || !item.date || candidate.date === item.date)
  )) || null
}

function normalizeDate(value) {
  const date = safeString(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

function normalizeTime(value) {
  const time = safeString(value, 5)
  return /^\d{2}:\d{2}$/.test(time) ? time : ''
}

function candidateValue(candidate, key, fallback = '') {
  return Object.prototype.hasOwnProperty.call(candidate || {}, key) ? candidate[key] : fallback
}

function normalizeItems(action, currentItems) {
  const usedIds = new Set()
  const items = action.items.slice(0, 40).map((candidate = {}, index) => {
    const source = findMatchingCurrentItem(candidate, currentItems, usedIds)
    const id = source?.id || (candidate.id && String(candidate.id).length < 80 ? String(candidate.id) : makeId())
    usedIds.add(id)

    const destination = safeString(candidateValue(candidate, 'destination', source?.destination), 180)
    const destinationChanged = source && normalizeDestination(destination) !== normalizeDestination(source.destination)
    const hasCandidateCoordinates = isCoordinate(candidate.lat) && isCoordinate(candidate.lng)
    const hasSourceCoordinates = isCoordinate(source?.lat) && isCoordinate(source?.lng)

    return {
      id,
      date: normalizeDate(candidateValue(candidate, 'date', source?.date)),
      time: normalizeTime(candidateValue(candidate, 'time', source?.time)),
      destination,
      address: safeString(candidateValue(candidate, 'address', source?.address), 240),
      memo: safeString(candidateValue(candidate, 'memo', source?.memo), 800),
      lat: hasCandidateCoordinates && !destinationChanged
        ? Number(candidate.lat)
        : destinationChanged ? null : hasSourceCoordinates ? Number(source.lat) : null,
      lng: hasCandidateCoordinates && !destinationChanged
        ? Number(candidate.lng)
        : destinationChanged ? null : hasSourceCoordinates ? Number(source.lng) : null,
      order: source?.order ?? (Date.now() + index),
      category: safeString(candidateValue(candidate, 'category', source?.category), 40),
      cost: safeString(candidateValue(candidate, 'cost', source?.cost), 40),
    }
  })

  return items
}

function parseExplicitTime(prompt) {
  const match = String(prompt || '').match(/(?:(오전|오후)\s*)?(\d{1,2})(?:(?:\s*:\s*)(\d{2})|\s*시(?:\s*(\d{1,2})\s*분?)?)/u)
  if (!match) return ''

  let hour = Number(match[2])
  const minute = Number(match[3] ?? match[4] ?? 0)
  if (match[1] === '오후' && hour < 12) hour += 12
  if (match[1] === '오전' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return ''
  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
}

function parseExplicitDate(prompt, now = new Date()) {
  const text = String(prompt || '')
  const isoMatch = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/u)
  const monthDayMatch = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/u)
  const year = isoMatch ? Number(isoMatch[1]) : now.getFullYear()
  const month = Number(isoMatch ? isoMatch[2] : monthDayMatch?.[1])
  const day = Number(isoMatch ? isoMatch[3] : monthDayMatch?.[2])
  if (!month || !day) return ''

  const candidate = new Date(year, month - 1, day)
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return ''
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

const TRIP_DESTINATION_ALIASES = [
  { key: '서울', aliases: ['서울특별시', '서울시', '서울'] },
  { key: '부산', aliases: ['부산광역시', '부산시', '부산'] },
  { key: '제주', aliases: ['제주특별자치도', '제주도', '제주시', '제주'] },
]

// 장소를 자유롭게 만들어내는 대신, 자주 요청되는 도시는 검증된 대표 장소
// 후보를 먼저 사용한다. 각 후보의 좌표와 주소는 실행 시 search_places로 확인한다.
const TRIP_POI_LIBRARY = {
  서울: [
    { destination: '경복궁', query: '경복궁', category: 'attraction', memo: '대표 궁궐과 고궁 산책' },
    { destination: '북촌한옥마을', query: '북촌한옥마을', category: 'attraction', memo: '한옥 골목 산책' },
    { destination: '인사동', query: '인사동', category: 'shopping', memo: '전통 거리와 공방 구경' },
    { destination: '국립중앙박물관', query: '국립중앙박물관', category: 'attraction', memo: '전시 관람' },
    { destination: '남산서울타워', query: '남산서울타워', category: 'attraction', memo: '서울 전망 감상' },
    { destination: '익선동', query: '익선동', category: 'cafe', memo: '골목 카페와 저녁 산책' },
    { destination: '성수동', query: '성수동', category: 'shopping', memo: '편집숍과 카페 탐방' },
    { destination: '광장시장', query: '광장시장', category: 'restaurant', memo: '시장 먹거리와 점심 식사' },
    { destination: '여의도 한강공원', query: '여의도 한강공원', category: 'nature', memo: '한강변 산책과 휴식' },
  ],
  부산: [
    { destination: '해운대해수욕장', query: '해운대해수욕장', category: 'nature', memo: '해변 산책' },
    { destination: '동백섬', query: '동백섬', category: 'nature', memo: '해안 산책로 걷기' },
    { destination: '광안리해수욕장', query: '광안리해수욕장', category: 'nature', memo: '광안대교 야경 감상' },
    { destination: '감천문화마을', query: '감천문화마을', category: 'attraction', memo: '골목과 전망 구경' },
    { destination: '자갈치시장', query: '자갈치시장', category: 'restaurant', memo: '시장 먹거리' },
    { destination: '흰여울문화마을', query: '흰여울문화마을', category: 'attraction', memo: '절벽 해안 마을 산책' },
    { destination: '태종대', query: '태종대', category: 'nature', memo: '해안 절경 감상' },
    { destination: '송도해상케이블카', query: '송도해상케이블카', category: 'activity', memo: '바다 위 케이블카' },
    { destination: '국제시장', query: '국제시장', category: 'shopping', memo: '시장과 먹거리 탐방' },
  ],
  제주: [
    { destination: '성산일출봉', query: '성산일출봉', category: 'nature', memo: '제주 동쪽 대표 풍경' },
    { destination: '섭지코지', query: '섭지코지', category: 'nature', memo: '해안 산책' },
    { destination: '우도', query: '우도', category: 'nature', memo: '섬 하루 여행' },
    { destination: '동문시장', query: '제주 동문시장', category: 'restaurant', memo: '제주 먹거리 탐방' },
    { destination: '제주국립박물관', query: '제주국립박물관', category: 'attraction', memo: '제주 역사와 전시 관람' },
    { destination: '함덕해수욕장', query: '함덕해수욕장', category: 'nature', memo: '바다와 해변 휴식' },
    { destination: '한라산', query: '한라산', category: 'nature', memo: '산과 숲 풍경 감상' },
    { destination: '애월 카페거리', query: '애월 카페거리', category: 'cafe', memo: '해안 카페에서 휴식' },
    { destination: '용두암', query: '용두암', category: 'attraction', memo: '제주 도착 전후 산책' },
  ],
}

const GENERIC_TRIP_SLOTS = [
  { label: '대표 관광지', searchTerm: '관광지', category: 'attraction', memo: '대표 명소 방문' },
  { label: '현지 맛집', searchTerm: '맛집', category: 'restaurant', memo: '현지 음식으로 식사' },
  { label: '카페와 산책', searchTerm: '카페', category: 'cafe', memo: '카페에서 쉬며 주변 산책' },
  { label: '전망 명소', searchTerm: '전망대', category: 'nature', memo: '지역 풍경 감상' },
]

const TRIP_TIMES = ['10:00', '13:00', '17:00', '20:00']

function formatLocalDate(date) {
  return date.getFullYear()
    + '-' + String(date.getMonth() + 1).padStart(2, '0')
    + '-' + String(date.getDate()).padStart(2, '0')
}

function addDaysToIso(dateString, days) {
  const [year, month, day] = String(dateString || '').split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, day || 1)
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

function findTripDestination(text) {
  const alias = TRIP_DESTINATION_ALIASES
    .flatMap(entry => entry.aliases.map(value => ({ ...entry, value })))
    .sort((left, right) => right.value.length - left.value.length)
    .find(entry => text.includes(entry.value))
  if (alias) return { key: alias.key, display: alias.key }

  const durationIndex = text.search(/\d+\s*(?:박\s*\d+\s*일|일)/u)
  const prefix = (durationIndex >= 0 ? text.slice(0, durationIndex) : text)
    .replace(/(?:처음부터|새로|다시|전체|모든|전부|여행|일정|코스|짜줘|만들어줘|구성해줘|계획해줘)/gu, ' ')
    .replace(/(?:에서|으로|로|의|에|도)\s*$/u, '')
    .trim()
  const words = prefix.split(/\s+/u).filter(Boolean)
  const display = words.slice(-2).join(' ').trim()
  return display ? { key: display, display } : null
}

/**
 * 전체 여행 생성 요청인지 브라우저에서 먼저 판별한다.
 * 작은 모델에게 날짜 수와 카드 수를 맡기지 않기 위한 하이브리드 플래너의
 * 입력 계약이다. 명시적인 시작일이 없으면 오늘부터 시작한다.
 */
export function parseTripRequest(prompt, now = new Date()) {
  const text = safeString(prompt, 1200)
  const nightsDays = text.match(/(\d+)\s*박\s*(\d+)\s*일/u)
  const dayOnly = nightsDays ? null : text.match(/(?:^|\s)(\d+)\s*일(?:\s*(?:일정|여행|코스))?/u)
  const duration = nightsDays || dayOnly
  if (!duration || !/(?:일정|여행|코스|짜|만들|구성|계획|세워|추천)/u.test(text)) return null

  const nights = nightsDays ? Number(nightsDays[1]) : Math.max(Number(duration[1]) - 1, 0)
  const days = nightsDays ? Number(nightsDays[2]) : Number(duration[1])
  if (!Number.isInteger(days) || days < 1 || days > 14) return null

  const destination = findTripDestination(text)
  if (!destination) return null

  const requestedSlots = text.match(/하루\s*(\d+)\s*(?:곳|개|장소)?/u)
  let slotsPerDay = requestedSlots ? Number(requestedSlots[1]) : 3
  if (/여유|느긋|천천히/u.test(text) && !requestedSlots) slotsPerDay = 2
  if (/알차|빡빡|많이/u.test(text) && !requestedSlots) slotsPerDay = 4
  slotsPerDay = Math.min(Math.max(Number.isFinite(slotsPerDay) ? slotsPerDay : 3, 2), 4)

  return {
    destination: destination.display,
    destinationKey: destination.key,
    nights,
    days,
    slotsPerDay,
    startDate: parseExplicitDate(text, now) || formatLocalDate(now),
  }
}

function tripLibraryFor(request) {
  return TRIP_POI_LIBRARY[request.destinationKey] || []
}

/** 일정 생성 전에 날짜·시간·장소 슬롯을 결정론적으로 만든다. */
export function buildTripBlueprint(request) {
  const items = []
  const library = tripLibraryFor(request)

  for (let dayIndex = 0; dayIndex < request.days; dayIndex += 1) {
    for (let slotIndex = 0; slotIndex < request.slotsPerDay; slotIndex += 1) {
      const index = dayIndex * request.slotsPerDay + slotIndex
      const knownPoi = library[index]
      const genericSlot = GENERIC_TRIP_SLOTS[slotIndex % GENERIC_TRIP_SLOTS.length]
      const destination = knownPoi?.destination || `${request.destination} ${genericSlot.label} ${dayIndex + 1}`
      items.push({
        id: makeId(),
        date: addDaysToIso(request.startDate, dayIndex),
        time: TRIP_TIMES[slotIndex],
        destination,
        address: '',
        memo: knownPoi?.memo || `${dayIndex + 1}일차 ${genericSlot.memo}`,
        lat: null,
        lng: null,
        order: Date.now() + index,
        category: knownPoi?.category || genericSlot.category,
        cost: '',
        searchQuery: knownPoi?.query || `${request.destination} ${genericSlot.searchTerm}`,
        useSearchTitle: !knownPoi,
      })
    }
  }
  return items
}

/**
 * 모델이 만든 전체 일정이 최소한의 구조를 만족하는지 검사한다.
 * 실패하면 브라우저 플래너가 다시 생성하므로 한 장짜리 엉뚱한 일정이
 * 전체 여행 계획으로 저장되는 것을 막는다.
 */
export function validateTripPlan(items, { days, startDate } = {}) {
  const safeItems = Array.isArray(items) ? items : []
  const issues = []
  const dates = new Set(safeItems.map(item => normalizeDate(item?.date)).filter(Boolean))
  const destinations = new Set(safeItems.map(item => normalizeDestination(item?.destination)).filter(Boolean))
  const countsByDate = new Map()
  safeItems.forEach(item => {
    const date = normalizeDate(item?.date)
    if (date) countsByDate.set(date, (countsByDate.get(date) || 0) + 1)
  })

  if (!Number.isInteger(days) || days < 1) issues.push('여행 일수가 없습니다.')
  else {
    const expectedDates = new Set(Array.from({ length: days }, (_, index) => addDaysToIso(startDate, index)))
    if (dates.size !== days || [...expectedDates].some(date => !dates.has(date))) {
      issues.push('여행 날짜가 요청한 일수만큼 이어지지 않습니다.')
    }
    for (const date of expectedDates) {
      if ((countsByDate.get(date) || 0) < 2) issues.push(`${date} 일정이 두 개보다 적습니다.`)
    }
    if (destinations.size < days * 2) issues.push('서로 다른 장소가 충분하지 않습니다.')
  }
  if (safeItems.some(item => !safeString(item?.destination, 180))) issues.push('장소명이 비어 있습니다.')

  return { valid: issues.length === 0, issues }
}

async function buildDeterministicTripItems(request, signal, onEvent, searchResults = new Map()) {
  const blueprint = buildTripBlueprint(request)
  const usedDestinations = new Set()
  const items = []

  for (const item of blueprint) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const query = item.searchQuery
    onEvent?.({ type: 'search-start', itemId: item.id, query, label: query + ' 지도에서 검색 중' })
    let results = searchResults.get(normalizeDestination(query))
    if (!results) {
      try {
        results = await searchPlaces(query, signal)
        throwIfAborted(signal)
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        throwIfAborted(signal)
        results = []
        onEvent?.({ type: 'warning', label: query + ' 검색에 실패해 장소명만 반영합니다.' })
      }
      searchResults.set(normalizeDestination(query), results)
    }

    const best = results.find(result => !usedDestinations.has(normalizeDestination(result.title))) || results[0]
    const destination = item.useSearchTitle && best?.title ? best.title : item.destination
    usedDestinations.add(normalizeDestination(destination))
    const { searchQuery, useSearchTitle, ...baseItem } = item
    const enriched = best
      ? {
        ...baseItem,
        destination,
        address: best.roadAddress || best.address || '',
        lat: best.lat,
        lng: best.lng,
      }
      : baseItem
    items.push(enriched)

    if (best) onEvent?.({ type: 'search-result', itemId: item.id, query, label: best.title + ' 위치를 찾았습니다' })
    else onEvent?.({ type: 'warning', label: query + ' 위치를 찾지 못해 장소명만 반영합니다.' })
  }

  return { items, searchResults }
}

function parseExplicitMemo(prompt) {
  const text = String(prompt || '')
  const quoted = text.match(/(?:메모|노트|비고)[^"'“”‘’「」]*["'“”‘’「」]([^"'“”‘’「」]+)["'“”‘’「」]/u)
  if (quoted?.[1]) return safeString(quoted[1], 800)

  const plain = text.match(/(?:메모|노트|비고)(?:\s*(?:을|를|에|도))?\s+(.+?)\s*(?:으로|로)\s*(?:수정|변경|바꿔|추가|남겨|적어|써)/u)
  return plain?.[1] ? safeString(plain[1], 800) : ''
}

function cleanPlaceCandidate(value) {
  return safeString(value, 180)
    .replace(/^.*(?:일정|여행|코스|장소|목록|시간|틈|타이밍)\s*(?:에|에는|에서|으로|로)?\s+/u, '')
    .replace(/^.*(?:삭제|지워|빼|제거|수정|변경|바꿔|하고|그리고|및)\s+/u, '')
    .replace(/^(?:현재|기존|지금|내|우리)\s+/u, '')
    .replace(/\s*(?:일정|여행|코스|장소|목록)\s*$/u, '')
    .trim()
}

function uniqueStrings(values) {
  return [...new Set(values.map(cleanPlaceCandidate).filter(value => (
    value.length > 1
    && !/^(?:현재|기존|지금|내|우리|일정|여행|코스|장소|목록)$/u.test(value)
  )))]
}

function extractExplicitAddDestinations(prompt) {
  if (!/(?:추가|더해|넣어|등록|생성)/u.test(prompt)) return []

  const destinations = []
  const particlePattern = /(?:^|[,，\s])([^,，.!?]{1,80}?)\s*(?:을|를)\s*(?:일정|여행|코스|장소|목록)?\s*(?:에)?\s*(?:하나|한\s*곳|한\s*개)?\s*(?:추가|넣|더해|등록|생성)/gu
  const particleMatches = [...String(prompt || '').matchAll(particlePattern)]
  for (const match of particleMatches) {
    const candidate = match[1].split(/\s*(?:삭제|지워|빼|제거|수정|변경|바꿔|하고|그리고|및)\s*/u).pop()
    destinations.push(...candidate.split(/\s*(?:과|와|및|그리고)\s*/u))
  }

  // 조사가 생략된 “부산역 추가” 형태도 작은 모델의 장소명 보정 대상으로 삼는다.
  if (particleMatches.length === 0) {
    const directPattern = /(?:^|[,，\s])([^,，.!?]{1,80}?)\s*(?:하나|한\s*곳|한\s*개)?\s*(?:일정|여행|코스|장소|목록)?\s*(?:에)?\s*(?:추가|넣|더해|등록|생성)/gu
    for (const match of String(prompt || '').matchAll(directPattern)) {
      destinations.push(...match[1].split(/\s*(?:삭제|지워|빼|제거|수정|변경|바꿔|하고|그리고|및)\s*/u).pop().split(/\s*(?:과|와|및|그리고)\s*/u))
    }
  }

  return uniqueStrings(destinations)
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractExplicitDestinationReplacements(prompt, currentItems) {
  const replacements = []
  for (const target of findExplicitEditTargets(prompt, currentItems)) {
    const destination = safeString(target.destination, 180)
    if (!destination) continue
    const pattern = new RegExp(
      escapeRegExp(destination)
      + '\\s*(?:일정|장소|방문|여행)?\\s*(?:을|를)\\s+(.{1,80}?)\\s*(?:으로|로)\\s*(?:바꿔|변경|수정|교체)',
      'u',
    )
    const match = String(prompt || '').match(pattern)
    const nextDestination = cleanPlaceCandidate(match?.[1] || '')
    if (nextDestination && nextDestination !== destination) {
      replacements.push({ target, destination: nextDestination })
    }
  }
  return replacements
}

function findExplicitEditTargets(prompt, currentItems) {
  const text = normalizeDestination(prompt)
  const mentioned = currentItems.filter(item => {
    const destination = normalizeDestination(item.destination)
    return destination && text.includes(destination)
  })
  if (mentioned.length > 0) return mentioned

  // 단일 카드에서 “현재 일정”이라고 요청하면 해당 카드를 편집 대상으로 본다.
  if (currentItems.length === 1 && /현재|기존|일정|시간|날짜|메모|노트|비고/u.test(prompt)) return currentItems
  return []
}

/**
 * 0.5B급 모델이 기존 카드의 전체 JSON을 그대로 되돌려주는 경우에도
 * 사용자가 명시한 시간·날짜·메모 변경은 브라우저에서 안전하게 보정한다.
 * 모델이 새 카드를 누락했을 때는 기존 카드를 복원해 의도치 않은 삭제도 막는다.
 */
export function applyExplicitEdits(prompt, modelItems, currentItems) {
  const time = parseExplicitTime(prompt)
  const date = parseExplicitDate(prompt)
  const memo = parseExplicitMemo(prompt)
  if (!time && !date && !memo) return modelItems

  const targets = findExplicitEditTargets(prompt, currentItems)
  if (targets.length === 0) return modelItems
  const targetIds = new Set(targets.map(item => item.id))
  const nextItems = modelItems.slice()

  for (const target of targets) {
    if (!nextItems.some(item => item.id === target.id)) nextItems.push({ ...target })
  }

  return nextItems.map(item => {
    if (!targetIds.has(item.id)) return item
    return {
      ...item,
      ...(time ? { time } : {}),
      ...(date ? { date } : {}),
      ...(memo ? { memo } : {}),
    }
  })
}

/**
 * 작은 모델이 “서울역”을 “서울”처럼 축약해 반환해도,
 * 사용자가 추가하라고 직접 적은 장소명은 원문을 기준으로 보존한다.
 * 좌표는 장소명이 바뀌었으므로 enrichItems가 다시 지도 검색하도록 비운다.
 */
export function applyExplicitDestinationRequests(prompt, modelItems, currentItems) {
  const destinations = extractExplicitAddDestinations(prompt)
  if (destinations.length === 0) return modelItems

  const currentIds = new Set(currentItems.map(item => item.id))
  const nextItems = modelItems.slice()
  const additions = nextItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !currentIds.has(item.id))

  destinations.forEach((destination, destinationIndex) => {
    let entry = additions[destinationIndex]
    if (!entry) {
      const template = additions[0]?.item || currentItems[currentItems.length - 1] || {}
      const item = {
        id: makeId(),
        date: template.date || '',
        time: template.time || '',
        destination: '',
        address: '',
        memo: '',
        lat: null,
        lng: null,
        order: Date.now() + nextItems.length,
        category: '',
        cost: '',
      }
      nextItems.push(item)
      entry = { item, index: nextItems.length - 1 }
    }

    nextItems[entry.index] = {
      ...nextItems[entry.index],
      destination,
      address: '',
      lat: null,
      lng: null,
    }
  })

  return nextItems
}

export function applyExplicitDestinationEdits(prompt, modelItems, currentItems) {
  const replacements = extractExplicitDestinationReplacements(prompt, currentItems)
  if (replacements.length === 0) return modelItems

  const nextItems = modelItems.slice()
  for (const { target, destination } of replacements) {
    const index = nextItems.findIndex(item => item.id === target.id)
    const base = index >= 0 ? nextItems[index] : { ...target }
    const updated = { ...base, destination, address: '', lat: null, lng: null }
    if (index >= 0) nextItems[index] = updated
    else nextItems.push(updated)
  }
  return nextItems
}

function hasRemovalRequest(prompt) {
  return /삭제|지워|빼|제거|없애|제외/u.test(prompt)
}

function isWholePlanReplacement(prompt) {
  return /(?:처음부터|새로|전체|모든|전부).*(?:일정|여행|코스).*(?:만들|구성|재구성|다시)/u.test(prompt)
}

function isWholePlanDeletion(prompt) {
  return /(?:전체|모든|전부|다)\s*(?:일정|항목|여행)?\s*(?:을|를)?\s*(?:삭제|지워|비워|없애|제거)/u.test(prompt)
}

export function applyExplicitDeletes(prompt, modelItems, currentItems) {
  if (!hasRemovalRequest(prompt)) return modelItems
  if (isWholePlanDeletion(prompt)) return []

  const targets = findExplicitEditTargets(prompt, currentItems)
  if (targets.length === 0) return modelItems
  const targetIds = new Set(targets.map(item => item.id))
  return modelItems.filter(item => !targetIds.has(item.id))
}

function preserveUnmentionedCurrentItems(prompt, nextItems, currentItems) {
  if (currentItems.length === 0 || isWholePlanReplacement(prompt) || isWholePlanDeletion(prompt)) return nextItems

  const isEditingRequest = /추가|더해|넣어|수정|변경|시간|날짜|메모|동선|정리|채워|보강|바꿔|삭제|제거/u.test(prompt)
  if (!isEditingRequest) return nextItems

  const nextIds = new Set(nextItems.map(item => item.id))
  const deletedIds = hasRemovalRequest(prompt)
    ? new Set(findExplicitEditTargets(prompt, currentItems).map(item => item.id))
    : new Set()
  const missing = currentItems.filter(item => !nextIds.has(item.id) && !deletedIds.has(item.id))
  return missing.length > 0 ? [...nextItems, ...missing] : nextItems
}

const ITEM_COMPARISON_FIELDS = [
  'date', 'time', 'destination', 'address', 'memo', 'lat', 'lng', 'category', 'cost', 'order',
]

function sameItemField(left, right, field) {
  if (field === 'lat' || field === 'lng' || field === 'order') {
    const leftNumber = Number(left?.[field])
    const rightNumber = Number(right?.[field])
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber
  }
  return String(left?.[field] ?? '') === String(right?.[field] ?? '')
}

function itemsAreEqual(left, right) {
  return ITEM_COMPARISON_FIELDS.every(field => sameItemField(left, right, field))
}

/**
 * 최종 일정과 현재 일정을 카드 단위 작업으로 나눈다.
 * 브라우저는 이 목록을 순서대로 실행하므로 AI가 카드를 직접 만지는 것처럼
 * 추가·수정·삭제가 화면에 순차적으로 나타나고, undo는 첫 작업 하나로 묶인다.
 */
export function buildPlanOperations(currentPlan, nextPlan) {
  const currentItems = Array.isArray(currentPlan?.items) ? currentPlan.items : []
  const nextItems = Array.isArray(nextPlan?.items) ? nextPlan.items : []
  const currentById = new Map(currentItems.map(item => [item.id, item]))
  const nextById = new Map(nextItems.map(item => [item.id, item]))
  const operations = []

  for (const item of currentItems) {
    if (!nextById.has(item.id)) operations.push({ type: 'delete', before: item, itemId: item.id })
  }
  for (const item of nextItems) {
    const before = currentById.get(item.id)
    if (!before) operations.push({ type: 'add', item, itemId: item.id })
    else if (!itemsAreEqual(before, item)) operations.push({ type: 'update', before, item, itemId: item.id })
  }
  if (String(currentPlan?.title || '') !== String(nextPlan?.title || '')) {
    operations.push({ type: 'title', itemId: null })
  }
  return operations
}

export function applyPlanOperation(items, operation) {
  if (operation.type === 'add') return [...items, operation.item]
  if (operation.type === 'delete') return items.filter(item => item.id !== operation.itemId)
  if (operation.type === 'update') return items.map(item => item.id === operation.itemId ? { ...item, ...operation.item } : item)
  return items
}

function operationLabel(operation) {
  const name = safeString(operation.item?.destination || operation.before?.destination, 100) || '새 일정'
  if (operation.type === 'add') return name + ' 일정 추가 중'
  if (operation.type === 'delete') return name + ' 일정 삭제 중'
  if (operation.type === 'update') return name + ' 일정 수정 중'
  return '여행 제목 수정 중'
}

function shouldProtectCurrentItems(prompt, currentItems, nextItems) {
  if (currentItems.length === 0 || nextItems.length > 0) return false
  if (isWholePlanDeletion(prompt)) return false
  if (hasRemovalRequest(prompt)) {
    const targets = findExplicitEditTargets(prompt, currentItems)
    if (targets.length === currentItems.length) return false
  }
  return true
}

async function enrichItems(items, currentItems, signal, onEvent, knownResults = new Map()) {
  const existingById = new Map(currentItems.map(item => [item.id, item]))
  const searchCache = new Map(knownResults)
  const enriched = []

  for (const item of items) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const existing = existingById.get(item.id)
    const changedDestination = existing && normalizeDestination(existing.destination) !== normalizeDestination(item.destination)
    const needsSearch = item.destination && (!isCoordinate(item.lat) || !isCoordinate(item.lng) || changedDestination)

    if (!needsSearch) {
      enriched.push(item)
      continue
    }

    const query = item.destination
    onEvent?.({ type: 'search-start', itemId: item.id, query, label: query + ' 위치 확인 중' })
    let results = searchCache.get(normalizeDestination(query))
    if (!results) {
      try {
        results = await searchPlaces(query, signal)
        throwIfAborted(signal)
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        throwIfAborted(signal)
        results = []
        onEvent?.({ type: 'warning', label: query + ' 좌표를 확인하지 못해 장소명만 반영합니다.' })
      }
      searchCache.set(normalizeDestination(query), results)
    }

    const best = results[0]
    if (best) {
      enriched.push({
        ...item,
        address: item.address || best.roadAddress || best.address,
        lat: best.lat,
        lng: best.lng,
      })
      onEvent?.({ type: 'search-result', itemId: item.id, query, label: best.title + ' 위치를 찾았습니다' })
    } else {
      enriched.push(item)
    }
  }

  return enriched
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

    let timer
    const handleAbort = () => {
      clearTimeout(timer)
      reject(createAbortError())
    }

    timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

async function createCompletion(engine, messages, { strictJson = true, signal } = {}) {
  throwIfAborted(signal)
  const request = {
    model: LOCAL_MODEL_ID,
    messages,
    temperature: 0.15,
    top_p: 0.8,
    max_tokens: 1200,
    stream: false,
  }

  if (!strictJson) {
    const response = await engine.chat.completions.create({ ...request, messages })
    throwIfAborted(signal)
    return response
  }

  // WebLLM의 기본 JSON grammar는 모델별 schema compiler 차이의 영향을 받지
  // 않아 작은 모델에서도 가장 안정적으로 JSON 응답을 강제한다.
  try {
    const response = await engine.chat.completions.create({
      ...request,
      messages,
      response_format: { type: 'json_object' },
    })
    throwIfAborted(signal)
    return response
  } catch (jsonModeError) {
    if (signal?.aborted) throw createAbortError()
    // 구버전 WebLLM/브라우저에서 JSON mode가 실패하면 schema를 한 번 시도하고,
    // 마지막에는 일반 생성으로 내려가 runLocalAgent의 재파싱 루프가 처리한다.
    try {
      const response = await engine.chat.completions.create({
        ...request,
        messages,
        response_format: { type: 'json_object', schema: JSON.stringify(ACTION_SCHEMA) },
      })
      throwIfAborted(signal)
      return response
    } catch (schemaError) {
      if (signal?.aborted) throw createAbortError()
      try {
        const response = await engine.chat.completions.create({ ...request, messages })
        throwIfAborted(signal)
        return response
      } catch (fallbackError) {
        if (signal?.aborted) throw createAbortError()
        throw jsonModeError
      }
    }
  }
}

export async function runLocalAgent({ prompt, currentPlan, conversationHistory = [], signal, onEvent, onApplyPlan, onProgress, isLocked = false }) {
  const cleanPrompt = safeString(prompt, 1200)
  if (!cleanPrompt) throw new Error('AI에게 시킬 작업을 입력해주세요.')
  throwIfAborted(signal)

  const mutationRequested = isScheduleMutationRequest(cleanPrompt)
  onEvent?.({
    type: 'stage',
    key: 'analyze',
    label: mutationRequested ? '일정 변경 요청을 해석 중' : '질문 내용을 확인 중',
    responseMode: mutationRequested ? 'apply' : 'answer',
  })
  const currentItems = currentPlan?.items || []
  const tripRequest = parseTripRequest(cleanPrompt)
  let action = null
  let lastRawText = ''
  const searchResults = new Map()

  if (isLocked && mutationRequested) {
    const lockedAction = {
      mode: 'answer',
      title: currentPlan?.title || '',
      message: '현재 일정이 잠겨 있어 변경하지 않았습니다. 잠금을 해제한 후 다시 요청해주세요.',
      query: '',
      items: [],
    }
    onEvent?.({ type: 'done', label: lockedAction.message })
    return { action: lockedAction, plan: null }
  }

  if (tripRequest && mutationRequested) {
    // 여행 기간이 명시된 전체 생성은 작은 모델에게 맡기지 않는다. 모델이
    // 한 장짜리 응답을 만들거나 긴 JSON 복구를 반복하는 동안 기다리지 않고,
    // 브라우저 플래너가 날짜·슬롯·지도 검색을 바로 오케스트레이션한다.
    onEvent?.({ type: 'stage', key: 'blueprint', label: '여행 기간과 하루별 일정 뼈대 구성 중' })
    const generated = await buildDeterministicTripItems(tripRequest, signal, onEvent, searchResults)
    throwIfAborted(signal)
    const generatedQuality = validateTripPlan(generated.items, tripRequest)
    if (!generatedQuality.valid) {
      throw new Error('여행 일정의 날짜와 장소를 충분히 구성하지 못했습니다. 기간을 줄이거나 장소를 더 구체적으로 적어주세요.')
    }
    action = {
      mode: 'apply',
      title: `${tripRequest.destination} ${tripRequest.nights}박 ${tripRequest.days}일 여행`,
      message: `${tripRequest.days}일 일정의 장소를 검색해 화면에 반영했습니다.`,
      query: '',
      items: generated.items,
    }
    onEvent?.({ type: 'stage', key: 'validate', label: '검색 결과와 날짜별 일정 품질 검사 중' })
  } else {
    const engine = await getLocalEngine(onProgress)
    throwIfAborted(signal)

    const compactCurrentPlan = compactPlan(currentPlan)
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...compactConversationHistory(conversationHistory),
      {
        role: 'user',
        content: JSON.stringify({
          today: new Date().toISOString().slice(0, 10),
          request: cleanPrompt,
          requestType: mutationRequested ? 'schedule_mutation' : 'chat_answer',
          currentPlan: compactCurrentPlan,
        }),
      },
    ]
    const searchedQueries = new Set()
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await createCompletion(engine, messages, { signal })
      throwIfAborted(signal)
      const rawText = modelText(response)
      lastRawText = rawText
      try {
        action = parseAgentAction(rawText)
      } catch (error) {
        if (attempt === 3) break
        onEvent?.({ type: 'stage', key: 'repair', label: 'AI 응답을 일정 JSON으로 다시 정리 중' })
        messages.push(
          { role: 'assistant', content: rawText || '(빈 응답)' },
          {
            role: 'user',
            content: '이전 응답은 JSON이 아니어서 사용할 수 없다. 설명하지 말고, 반드시 첫 글자가 {이고 마지막 글자가 }인 유효한 JSON 객체 하나만 다시 출력해줘. mode, title, message, query, items 키를 모두 포함해줘.',
          },
        )
        continue
      }

      if (!mutationRequested && action.mode === 'apply') {
        if (attempt === 3) break
        onEvent?.({ type: 'stage', key: 'repair', label: '일정 변경 없이 질문 답변 형식으로 다시 정리 중' })
        messages.push(
          { role: 'assistant', content: rawText || '(빈 응답)' },
          {
            role: 'user',
            content: '사용자는 일정 변경을 요청하지 않았다. 기존 일정은 절대 수정하지 말고, 질문에 대한 실제 답변을 작성해줘. mode=answer, items=[], message에는 자연스러운 한국어 답변을 넣어줘.',
          },
        )
        action = null
        continue
      }

      if (action.mode !== 'search' || !action.query) break

      const normalizedQuery = normalizeDestination(action.query)
      if (searchedQueries.has(normalizedQuery)) {
        onEvent?.({ type: 'stage', key: 'repair', label: '같은 검색이 반복되어 브라우저 일정 편집으로 전환 중' })
        break
      }
      searchedQueries.add(normalizedQuery)
      onEvent?.({ type: 'stage', key: 'search', label: action.query + ' 장소 검색 중' })
      let results
      try {
        results = await searchPlaces(action.query, signal)
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        throwIfAborted(signal)
        onEvent?.({ type: 'warning', label: action.query + ' 검색을 완료하지 못했습니다.' })
        break
      }
      throwIfAborted(signal)
      searchResults.set(normalizeDestination(action.query), results)
      messages.push(
        { role: 'assistant', content: rawText },
        {
          role: 'user',
          content: (mutationRequested
            ? '검색 결과를 참고해서 요청을 일정에 반영할지 판단하고, 반드시 위 JSON 형식의 apply 또는 answer로 답해줘.'
            : '사용자는 일정 변경을 요청하지 않았다. 검색 결과를 참고해 질문에 실제로 답하고, 기존 일정은 절대 수정하지 말아줘. mode=answer, items=[]로 답해줘.')
            + ' 검색 결과: ' + JSON.stringify(results.slice(0, 5)),
        },
      )
    }
  }

  throwIfAborted(signal)

  if (!action) {
    // 모델이 끝까지 자연어만 반환해도, 기존 카드의 명시적인 시간·날짜·메모
    // 수정은 브라우저에서 복구해 사용자가 JSON 오류를 다시 만지지 않게 한다.
    const recoveredItems = applyExplicitDestinationRequests(
      cleanPrompt,
      applyExplicitDestinationEdits(
        cleanPrompt,
        applyExplicitEdits(
          cleanPrompt,
          applyExplicitDeletes(cleanPrompt, currentItems, currentItems),
          currentItems,
        ),
        currentItems,
      ),
      currentItems,
    )
    if (mutationRequested && recoveredItems !== currentItems) {
      action = {
        mode: 'apply',
        title: currentPlan?.title || '',
        message: '요청한 카드 정보를 화면에 반영했습니다.',
        query: '',
        items: recoveredItems,
      }
      onEvent?.({ type: 'stage', key: 'repair', label: '명시한 카드 변경을 브라우저에서 복구 중' })
    } else if (!mutationRequested) {
      const answer = extractPlainChatAnswer(lastRawText)
      if (answer) {
        action = {
          mode: 'answer',
          title: currentPlan?.title || '',
          message: answer,
          query: '',
          items: [],
        }
      }
    }
    if (!action) {
      throw new Error(lastRawText ? '로컬 AI 응답을 일정 JSON으로 변환하지 못했습니다. 요청을 조금 더 구체적으로 적어주세요.' : 'AI 작업 결과가 없습니다.')
    }
  }

  if (!mutationRequested && action.mode === 'apply') {
    action = {
      mode: 'answer',
      title: currentPlan?.title || '',
      message: safeString(action.message, 2000) || extractPlainChatAnswer(lastRawText) || '현재 일정은 변경하지 않았습니다. 일정에 대해 궁금한 점을 조금 더 구체적으로 적어주세요.',
      query: '',
      items: [],
    }
  }

  if (action.mode !== 'apply') {
    // 작은 모델이 검색/답변으로 끝내더라도, 사용자가 카드에 명시한
    // 삭제·시간·날짜·메모 변경은 브라우저에서 놓치지 않고 적용한다.
    const explicitlyChangedItems = applyExplicitDestinationRequests(
      cleanPrompt,
      applyExplicitDestinationEdits(
        cleanPrompt,
        applyExplicitEdits(
          cleanPrompt,
          applyExplicitDeletes(cleanPrompt, currentItems, currentItems),
          currentItems,
        ),
        currentItems,
      ),
      currentItems,
    )
    if (mutationRequested && explicitlyChangedItems !== currentItems) {
      action = {
        mode: 'apply',
        title: currentPlan?.title || '',
        message: '요청한 카드 변경을 화면에 반영했습니다.',
        query: '',
        items: explicitlyChangedItems,
      }
      onEvent?.({ type: 'stage', key: 'repair', label: '명시한 카드 변경을 브라우저에서 복구 중' })
    } else {
      action = {
        ...action,
        title: currentPlan?.title || action.title || '',
        message: safeString(action.message, 2000) || extractPlainChatAnswer(lastRawText) || '요청을 확인했습니다.',
        items: [],
      }
      onEvent?.({ type: 'done', label: action.message })
      return { action, plan: null }
    }
  }
  const normalizedItems = normalizeItems(action, currentItems)
  const deletedItems = applyExplicitDeletes(cleanPrompt, normalizedItems, currentItems)
  const correctedItems = applyExplicitEdits(cleanPrompt, deletedItems, currentItems)
  const destinationEditedItems = applyExplicitDestinationEdits(cleanPrompt, correctedItems, currentItems)
  const requestedItems = applyExplicitDestinationRequests(cleanPrompt, destinationEditedItems, currentItems)
  const safeItems = preserveUnmentionedCurrentItems(cleanPrompt, requestedItems, currentItems)
  if (shouldProtectCurrentItems(cleanPrompt, currentItems, safeItems)) {
    throw new Error('기존 일정이 모두 사라지는 결과라 적용을 멈췄습니다. 삭제할 범위를 더 구체적으로 적어주세요.')
  }

  onEvent?.({ type: 'stage', key: 'search', label: '일정 장소의 위치 정보 보강 중' })
  const enrichedItems = await enrichItems(safeItems, currentItems, signal, onEvent, searchResults)
  throwIfAborted(signal)
  const nextPlan = {
    title: safeString(action.title || currentPlan?.title, 80),
    items: enrichedItems,
  }

  const operations = buildPlanOperations(currentPlan, nextPlan)
  onEvent?.({ type: 'stage', key: 'apply', label: operations.length + '개 일정 작업을 화면에 적용 중' })
  let workingItems = currentItems.slice()
  for (const [index, operation] of operations.entries()) {
    throwIfAborted(signal)
    workingItems = applyPlanOperation(workingItems, operation)
    onApplyPlan?.(
      { title: nextPlan.title, items: workingItems },
      { history: index === 0 ? 'push' : 'replace' },
    )
    onEvent?.({
      type: 'operation',
      operation: operation.type,
      itemId: operation.itemId,
      label: operationLabel(operation),
    })
    await wait(220, signal)
  }

  const message = action.message || enrichedItems.length + '개 일정을 반영했습니다.'
  onEvent?.({ type: 'done', label: message })
  return { action, plan: nextPlan }
}

export async function unloadLocalEngine() {
  if (!enginePromise) return
  if (!engineReady) {
    cancelLocalEngineLoad()
    return
  }
  try { await (await enginePromise).unload() } catch {}
  engineReady = false
  engineInstance = null
  worker?.terminate()
  worker = null
  enginePromise = null
  engineLoadToken = null
  progressListener = null
}
