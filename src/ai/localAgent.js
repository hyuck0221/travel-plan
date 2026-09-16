import { getSearchTimeoutMessage, isSearchTimeoutError, searchPlaces } from './mcpClient.js'
import { createDefaultAiConfig, LOCAL_MODEL_FALLBACK_ID, LOCAL_MODEL_FALLBACK_LABEL, LOCAL_MODEL_ID, LOCAL_MODEL_LABEL } from './aiConfig.js'
import { createExternalEngine } from './externalProvider.js'

export {
  createDefaultAiConfig,
  LOCAL_MODEL_FALLBACK_ID,
  LOCAL_MODEL_FALLBACK_LABEL,
  LOCAL_MODEL_ID,
  LOCAL_MODEL_LABEL,
  LOCAL_MODEL_OPTIONS,
} from './aiConfig.js'

let enginePromise = null
let engineInstance = null
let engineLoadToken = null
let worker = null
let progressListener = null
let engineReady = false
let activeModelId = LOCAL_MODEL_ID
let loadingModelId = ''
let loadedModelPreferenceId = ''

const MUTATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['add', 'update', 'delete', 'replace', 'search', 'answer', 'none'] },
    message: { type: 'string' },
    title: { type: 'string' },
    query: { type: 'string' },
    target: { type: 'string' },
    targetId: { type: 'string' },
    destination: { type: 'string' },
    date: { type: 'string' },
    time: { type: 'string' },
    memo: { type: 'string' },
    category: { type: 'string' },
    cost: { type: 'string' },
    address: { type: 'string' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'delete', 'replace'] },
          target: { type: 'string' },
          targetId: { type: 'string' },
          destination: { type: 'string' },
          address: { type: 'string' },
          memo: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          category: { type: 'string' },
          cost: { type: 'string' },
        },
        required: ['action'],
      },
    },
  },
  required: ['intent', 'message', 'query', 'operations'],
}

// 모든 요청을 일정 편집 명령으로 보내면 작은 모델이 질문까지 add/update로
// 오인한다. 첫 호출은 출력 토큰을 거의 쓰지 않는 라우터로 분리한다.
const ROUTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    route: { type: 'string', enum: ['answer', 'control'] },
  },
  required: ['route'],
}

const CONTROL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tool: {
      type: 'string',
      enum: ['load_plan', 'add_schedule', 'update_schedule', 'delete_schedule', 'replace_schedule', 'search_places', 'none'],
    },
    needsPlan: { type: 'boolean' },
    query: { type: 'string' },
  },
  required: ['tool', 'needsPlan', 'query'],
}

const LOCAL_SCHEDULE_TOOLS = Object.freeze([
  'load_plan',
  'add_schedule',
  'update_schedule',
  'delete_schedule',
  'replace_schedule',
  'search_places',
])

const TOOL_LABELS = Object.freeze({
  load_plan: '현재 일정을 불러오는 중',
  add_schedule: '새 일정 추가 작업을 준비 중',
  update_schedule: '기존 일정 수정 작업을 준비 중',
  delete_schedule: '기존 일정 삭제 작업을 준비 중',
  replace_schedule: '전체 일정 생성 작업을 준비 중',
  search_places: '장소 검색 작업을 준비 중',
})

const ROUTER_SYSTEM_PROMPT = [
  '너는 Travelink의 첫 단계 요청 라우터다.',
  '사용자의 의도를 판단해 JSON 하나만 출력한다.',
  '일정 카드의 추가·수정·삭제·교체·시간 변경처럼 브라우저 데이터를 바꾸라는 명령이면 route=control이다.',
  '일정 조회·요약·추천·장소 정보·사용법·일반 대화·가능 여부 질문처럼 답변만 하면 되면 route=answer다.',
  '“추천해줘”는 일정에 실제 카드를 만들라는 말이 없으면 answer다. “추가해줘/넣어줘/삭제해줘/바꿔줘/짜줘”처럼 실제 반영을 요구할 때만 control이다.',
  '답변 내용이나 일정 작업을 생성하지 말고 route만 판단한다.',
].join('\n')

const CONTROL_SYSTEM_PROMPT = [
  '너는 Travelink의 두 번째 단계 일정 도구 선택기다.',
  '답변 문장을 쓰지 말고 JSON 하나만 출력한다. 브라우저가 선택한 도구를 실행한다.',
  'tool은 정확히 하나만 고른다.',
  'add_schedule: 기존 일정에 새 카드나 장소를 추가한다.',
  'update_schedule: 기존 카드의 장소·날짜·시간·메모·비용·순서를 바꾼다.',
  'delete_schedule: 기존 카드 하나 이상을 삭제한다.',
  'replace_schedule: 여행 기간 전체를 처음부터 새로 구성한다.',
  'search_places: 일정 변경 없이 지도에서 장소를 찾는 명시적 검색이다.',
  'load_plan: 현재 일정 상태를 읽어야 한다는 뜻이다. 실제 수정·삭제 도구가 필요한 경우 needsPlan=true도 함께 쓴다.',
  '현재/기존/지금 일정, 특정 장소, 동선, 시간, 날짜, 메모를 언급하거나 수정·삭제하는 요청은 needsPlan=true다.',
  '새 일정만 추가하고 기존 카드와 관계가 없으면 needsPlan=false다.',
  'query는 search_places일 때만 구체적인 장소명 하나를 넣고, 그 외에는 빈 문자열이다.',
].join('\n')

const MUTATION_SYSTEM_PROMPT = [
  '너는 Travelink 브라우저 일정 편집 명령 변환기다.',
  '사용자의 명확한 일정 변경 요청을 현재 일정에 적용할 최소 작업 JSON으로 변환한다. 전체 일정을 다시 쓰지 않는다.',
  '',
  '규칙:',
  '1. intent는 add, update, delete, replace, search, answer, none 중 하나다.',
  '2. operations에는 실제로 필요한 작업만 넣는다. 변경하지 않는 기존 일정을 복사하지 않는다.',
  '3. update/delete/replace의 target은 현재 일정의 정확한 장소명 또는 id를 사용한다.',
  '4. add의 destination은 장소명만 쓴다. 사용자의 지시문 전체를 장소명으로 만들지 않는다.',
  '5. 시간은 HH:mm, 날짜는 YYYY-MM-DD 형식이다. 모르는 필드는 생략하거나 빈 문자열로 둔다.',
  '6. 장소 검색이 필요할 때만 intent=search 또는 query를 사용한다. query는 네이버 지도에 전달할 구체적인 장소명 하나만 넣는다.',
  '7. query에 일정, 수정, 삭제, 추가, 해줘 같은 지시어를 넣지 않는다. 장소가 분명하지 않으면 query는 빈 문자열이다.',
  '8. 일정 조회·요약·추천·일반 대화는 answer 또는 none으로 처리하고 operations는 빈 배열로 둔다.',
  '9. 확실하지 않은 대상은 임의로 수정·삭제하지 말고 operations를 빈 배열로 둔다.',
  '10. selectedTool이 제공되면 그 도구에 맞는 operations만 만든다. add_schedule은 add, update_schedule은 update, delete_schedule은 delete만 사용한다.',
  '11. fullTrip이 제공되면 intent=replace로 하고, 요청한 날짜 수와 하루 장소 수에 맞춰 모든 장소를 operations의 add로 직접 선택한다.',
  '12. fullTrip의 각 add에는 실제 방문할 장소명, 연속된 날짜, 현실적인 시간, 짧은 메모를 넣는다. 장소명·시간·메모를 미리 정해진 목록에서 고르지 말고 사용자 요청과 여행지 맥락에 맞게 직접 판단한다.',
  '13. 주소와 좌표는 만들지 않는다. 브라우저가 각 장소명을 지도에서 검색해 확인한다.',
  '14. fullTripDay가 제공되면 해당 날짜 하루만 작성한다. 정확히 지정된 개수만큼 add operations를 만들고, 각 작업에 그 날짜와 HH:mm 시간을 반드시 넣는다.',
  '15. fullTripDay에서는 기존 일정의 장소를 복사하지 말고, 이미 선택된 장소와 겹치지 않는 실제 장소를 새로 고른다.',
  '16. fullTripDay.slots가 1이면 operations에 action=add 작업을 정확히 하나 넣는다. 빈 operations나 answer/search 응답을 내지 않는다.',
  '',
  '출력 JSON 형식:',
  '{"intent":"update","message":"변경 내용을 짧게 설명","query":"","operations":[{"action":"update","target":"성수동","time":"15:00"}]}',
].join('\n')

const ANSWER_SYSTEM_PROMPT = [
  '너는 Travelink의 한국어 여행 일정 대화 도우미다.',
  '사용자의 질문에 실제 내용으로 답한다. 일정은 절대 수정하지 않는다.',
  '현재 일정과 이전 대화가 제공되므로 장소명, 날짜, 시간, 메모를 근거로 답한다.',
  '짧고 자연스러운 한국어 답변만 출력한다. JSON, 마크다운 코드블록, 상태 문구는 출력하지 않는다.',
  '정보가 현재 일정에 없으면 없다고 말하고 필요한 조건을 간단히 물어본다.',
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

/**
 * AI 패널을 연 직후 모델을 백그라운드에서 준비한다.
 *
 * 전체 일정 생성도 모델을 사용하므로, AI 패널을 연 시점에 모델 Promise를
 * 미리 만들어 첫 요청이 별도의 로딩을 기다리지 않도록 한다.
 */
export function warmLocalEngine(onProgress, modelId = LOCAL_MODEL_ID) {
  if (engineReady && engineInstance && loadedModelPreferenceId === modelId) return Promise.resolve(engineInstance)
  return getLocalEngine(onProgress, modelId)
}

export async function getLocalEngine(onProgress, requestedModelId = LOCAL_MODEL_ID) {
  if (!globalThis.navigator?.gpu) {
    throw new Error('이 브라우저는 WebGPU를 지원하지 않아 로컬 AI를 실행할 수 없습니다.')
  }

  const modelId = String(requestedModelId || LOCAL_MODEL_ID)
  progressListener = onProgress
  if (engineReady && engineInstance && loadedModelPreferenceId === modelId) return engineInstance
  if (engineReady && engineInstance && loadedModelPreferenceId !== modelId) await unloadLocalEngine()
  if (enginePromise) {
    if (loadingModelId === modelId) return enginePromise
    cancelLocalEngineLoad()
  }

  const loadToken = { cancelled: false, reject: null, promise: null }
  engineLoadToken = loadToken
  loadingModelId = modelId
  const loadPromise = (async () => {
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
    if (loadToken.cancelled) throw createAbortError()

    const loadModel = async modelId => {
      worker = worker || new Worker(new URL('./llm.worker.js', import.meta.url), { type: 'module' })
      return CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: emitProgress,
      })
    }

    try {
      activeModelId = modelId
      return await loadModel(modelId)
    } catch (primaryError) {
      if (loadToken.cancelled) throw createAbortError()

      if (modelId === LOCAL_MODEL_FALLBACK_ID) throw primaryError

      // Qwen 2.5 3B가 WebGPU 메모리 한도를 넘는 기기에서는 이미 실패한
      // 워커를 재사용하지 않고, 브라우저용 초경량 모델로 한 번만 전환한다.
      worker?.terminate()
      worker = null
      progressListener?.({ progress: 0, text: `${LOCAL_MODEL_FALLBACK_LABEL}로 전환 중` })
      activeModelId = LOCAL_MODEL_FALLBACK_ID
      try {
        return await loadModel(LOCAL_MODEL_FALLBACK_ID)
      } catch (fallbackError) {
        if (loadToken.cancelled) throw createAbortError()
        fallbackError.cause = primaryError
        throw fallbackError
      }
    }
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
    loadedModelPreferenceId = modelId
    return engine
  } catch (error) {
    if (enginePromise === pendingPromise) {
      engineReady = false
      engineInstance = null
      enginePromise = null
      engineLoadToken = null
      loadingModelId = ''
      loadedModelPreferenceId = ''
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
  loadingModelId = ''
  loadedModelPreferenceId = ''
  progressListener = null
  activeModelId = LOCAL_MODEL_ID
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
export function compactConversationHistory(history, { limit = 10, maxContent = 1200 } = {}) {
  return (Array.isArray(history) ? history : [])
    .filter(message => ['user', 'assistant'].includes(message?.role))
    .slice(-Math.max(1, limit))
    .map(message => ({
      role: message.role,
      content: safeString(message.content, maxContent),
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

function normalizeCommandOperations(value) {
  const candidates = Array.isArray(value) ? value : value ? [value] : []
  return candidates
    .slice(0, 20)
    .map(operation => {
      const changes = operation?.changes && typeof operation.changes === 'object' ? operation.changes : {}
      return {
        action: safeString(operation?.action || operation?.operation || operation?.type, 20).toLowerCase(),
        target: safeString(operation?.target || changes.target, 180),
        targetId: safeString(operation?.targetId || operation?.id || changes.targetId || changes.id, 80),
        destination: safeString(operation?.destination || changes.destination, 180),
        address: safeString(operation?.address || changes.address, 240),
        memo: safeString(operation?.memo || changes.memo, 800),
        date: safeString(operation?.date || changes.date, 20),
        time: safeString(operation?.time || changes.time, 20),
        category: safeString(operation?.category || changes.category, 40),
        cost: safeString(operation?.cost || changes.cost, 40),
      }
    })
    .filter(operation => ['add', 'update', 'delete', 'replace'].includes(operation.action))
}

function parseStructuredResponse(rawText) {
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
    if (parsed != null) return parsed
  }

  throw new Error('로컬 AI의 일정 형식을 해석하지 못했습니다. 요청을 조금 더 구체적으로 적어주세요.')
}

export function parseRouteDecision(rawText) {
  const parsed = parseStructuredResponse(rawText)
  const route = safeString(parsed?.route || parsed?.mode, 20).toLowerCase()
  if (!['answer', 'control'].includes(route)) {
    throw new Error('로컬 AI의 요청 분류를 해석하지 못했습니다.')
  }
  return { route }
}

function normalizeToolName(value) {
  const tool = safeString(value, 40).toLowerCase().replace(/[-\s]/g, '_')
  const aliases = {
    add: 'add_schedule',
    create: 'add_schedule',
    update: 'update_schedule',
    edit: 'update_schedule',
    delete: 'delete_schedule',
    remove: 'delete_schedule',
    replace: 'replace_schedule',
    search: 'search_places',
    load: 'load_plan',
    get_plan: 'load_plan',
  }
  return aliases[tool] || tool
}

export function parseControlDecision(rawText) {
  const parsed = parseStructuredResponse(rawText)
  const intent = safeString(parsed?.intent || parsed?.action, 40).toLowerCase()
  const tool = normalizeToolName(parsed?.tool || parsed?.toolName || intent)
  if (!LOCAL_SCHEDULE_TOOLS.includes(tool) && tool !== 'none') {
    throw new Error('로컬 AI의 일정 도구 선택을 해석하지 못했습니다.')
  }
  return {
    tool,
    needsPlan: parsed?.needsPlan === true || parsed?.needsPlan === 'true' || tool === 'update_schedule' || tool === 'delete_schedule',
    query: safeString(parsed?.query, 180),
  }
}

export function parseAgentAction(rawText) {
  const parsed = parseStructuredResponse(rawText)
  const action = Array.isArray(parsed)
    ? { mode: 'apply', items: parsed }
    : parsed?.action && typeof parsed.action === 'object'
      ? { ...parsed, ...parsed.action }
      : parsed
  const operations = normalizeCommandOperations(action?.operations || action?.operation)
  const intent = typeof action?.intent === 'string' ? action.intent.toLowerCase() : ''

  if (intent) {
    const mode = intent === 'search'
      ? 'search'
      : ['add', 'update', 'delete', 'replace'].includes(intent) || operations.length > 0
        ? 'apply'
        : 'answer'
    const message = typeof action?.message === 'string'
      ? action.message
      : typeof action?.answer === 'string'
        ? action.answer
        : ''
    return {
      mode,
      intent,
      title: typeof action.title === 'string' ? action.title : '',
      message,
      query: typeof action.query === 'string' ? action.query : '',
      items: Array.isArray(action.items) ? action.items : [],
      operations,
    }
  }

  const message = typeof action?.message === 'string'
    ? action.message
    : typeof action?.answer === 'string'
      ? action.answer
      : typeof action?.response === 'string'
        ? action.response
        : ''
  const mode = typeof action?.mode === 'string' ? action.mode : action?.items ? 'apply' : message ? 'answer' : ''
  if (!['apply', 'search', 'answer'].includes(mode)) {
    throw new Error('로컬 AI의 일정 형식을 해석하지 못했습니다. 요청을 조금 더 구체적으로 적어주세요.')
  }
  return {
    mode,
    intent: '',
    title: typeof action.title === 'string' ? action.title : '',
    message,
    query: typeof action.query === 'string' ? action.query : '',
    items: Array.isArray(action.items) ? action.items : [],
    operations,
  }
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

  const confirmationQuestion = /(?:해도\s*(?:돼|될까)|해도\s*괜찮|가능(?:할까|해)|괜찮(?:을까|아)|할까)/u.test(text)
  const directCommand = /(?:추가|더해|넣어|등록|생성|삭제해|지워|빼줘|제거해|수정해|바꿔|변경해|교체|이동해|옮겨|정리해|재구성해|만들어|짜줘|구성해|계획해|채워|보강해|설정해|지정해|조정해|맞춰|다듬어|개선해|늘려|줄여|앞당겨|늦춰)(?:\s*(?:줘|주세요|해줘|해주세요|줄래|달라|부탁해|부탁))?/u.test(text)
  if (directCommand && !confirmationQuestion && !/(?:추천|알려|설명|요약|보여|비교)/u.test(text)) return true

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

const SEARCH_INSTRUCTION_PATTERN = /(?:일정|코스|목록|시간|날짜|메모|노트|고쳐|고치|수정|변경|바꾸|교체|삭제|지워|추가|넣어|더해|늘려|줄여|만들|짜|구성|계획|해줘|해주세요|부탁|찾아|검색|알려|추천|조회|확인)/u
const SEARCH_GENERIC_PATTERN = /(?:특정|현재|기존|지금|내|우리|일정|코스|목록|시간|날짜|메모|노트)/u

function stripSearchInstruction(value) {
  return safeString(value, 180)
    .replace(/\s*(?:찾아|검색|알려|추천|조회|확인|고쳐|고치|수정|변경|바꿔|교체|삭제|지워|추가|넣어|더해|늘려|줄여|만들어|짜줘|구성해|계획해)(?:\s*(?:줘|주세요|해줘|해주세요|봐|봐줘))?\s*$/u, '')
    .replace(/\s*(?:해줘|해주세요|부탁해|부탁)\s*$/u, '')
    .replace(/[을를이가은는]$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 모델이 “성수동 일정을 고쳐줘” 같은 사용자 문장 전체를 query로
 * 반환하더라도 지도에는 실제 장소명만 전달한다. 교체·추가 대상과 현재
 * 카드명을 먼저 우선하고, 장소명을 특정할 수 없으면 검색 자체를 막는다.
 */
export function sanitizeSearchQuery(query, prompt = '', currentItems = []) {
  const raw = safeString(query, 180)
  if (!raw) return ''

  const normalizedRaw = normalizeDestination(raw)
  const replacements = extractExplicitDestinationReplacements(prompt, currentItems)
    .map(({ destination }) => safeString(destination, 180))
  const additions = extractExplicitAddDestinations(prompt)
  const currentDestinations = currentItems
    .map(item => safeString(item?.destination, 180))
    .filter(Boolean)

  // 교체할 새 장소를 기존 장소보다 먼저 선택한다.
  for (const destination of [...replacements, ...additions, ...currentDestinations]) {
    const normalizedDestination = normalizeDestination(destination)
    if (normalizedDestination && normalizedRaw.includes(normalizedDestination)) return destination
  }

  const cleaned = stripSearchInstruction(raw)
  if (!cleaned || (SEARCH_INSTRUCTION_PATTERN.test(raw) && SEARCH_GENERIC_PATTERN.test(cleaned))) return ''

  const candidate = cleanPlaceCandidate(cleaned)
  if (!candidate || SEARCH_GENERIC_PATTERN.test(candidate)) return ''
  return candidate
}

function createSearchAttemptReporter(onEvent, signal) {
  return ({ query, attempt, maxAttempts }) => {
    if (attempt <= 1 || signal?.aborted) return
    onEvent?.({
      type: 'stage',
      key: 'search-retry',
      label: `${query} 검색어를 바꿔 다시 검색 중 (${attempt}/${maxAttempts})`,
    })
  }
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
  const date = safeString(value, 30).replace(/\s+/gu, '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date

  const separated = date.match(/^(20\d{2})[년./-](\d{1,2})[월./-](\d{1,2})일?$/u)
  const compact = date.match(/^(20\d{2})(\d{2})(\d{2})$/u)
  const year = Number(separated?.[1] || compact?.[1])
  const month = Number(separated?.[2] || compact?.[2])
  const day = Number(separated?.[3] || compact?.[3])
  if (!year || !month || !day) return ''

  const parsed = new Date(year, month - 1, day)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeTime(value) {
  const time = safeString(value, 30).replace(/\s+/gu, '')
  const clock = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/u)
  const korean = time.match(/^(오전|오후)?(\d{1,2})(?::(\d{2})|시(?:(\d{1,2})분?)?)?$/u)
  if (!clock && !korean) return ''

  let hour = Number(clock?.[1] || korean?.[2])
  const minute = Number(clock?.[2] || korean?.[3] || korean?.[4] || 0)
  if (korean?.[1] === '오후' && hour < 12) hour += 12
  if (korean?.[1] === '오전' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return ''
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
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
  const sourceText = String(text || '')
  const durationMatch = sourceText.match(/\d+\s*박\s*\d+\s*일|\d+\s*일/u)
  const beforeDuration = durationMatch ? sourceText.slice(0, durationMatch.index) : sourceText
  const afterDuration = durationMatch
    ? sourceText.slice(durationMatch.index + durationMatch[0].length)
    : ''
  const source = beforeDuration.trim() || afterDuration
  const cleaned = source
    .replace(/하루\s*\d+\s*(?:곳|개|장소)?/gu, ' ')
    .replace(/(?:처음부터|새로|다시|전체|모든|전부|여행|일정|코스|짜줘|만들어줘|구성해줘|계획해줘|추천해줘|세워줘|여유롭게|알차게|빡빡하게)/gu, ' ')
    .replace(/[,.!?？]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/(?:에서|으로|로|의|에|도)\s*$/u, '')
    .trim()
  const words = cleaned.split(/\s+/u).filter(Boolean)
  const display = words.slice(0, 3).join(' ').trim()
  return display
}

/**
 * 전체 여행 생성 요청에 필요한 기간 메타데이터만 추출한다.
 * 장소·메모·시간은 이 함수에서 만들지 않고 모두 모델이 생성한다.
 * 명시적인 시작일이 없으면 오늘부터 시작한다.
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
    destination,
    nights,
    days,
    slotsPerDay,
    startDate: parseExplicitDate(text, now) || formatLocalDate(now),
  }
}

/**
 * 모델이 만든 전체 일정이 최소한의 구조를 만족하는지 검사한다.
 * 장소 데이터는 검사하지 않고, 모델이 요청한 기간과 카드 수를 지켰는지만
 * 확인해 불완전한 응답이 전체 여행 계획으로 저장되는 것을 막는다.
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
 * 작은 모델이 기존 카드의 전체 JSON을 그대로 되돌려주는 경우에도
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

function formatAnswerDate(date) {
  const value = safeString(date, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '날짜 미정'
  const parsed = new Date(value + 'T00:00:00')
  if (Number.isNaN(parsed.getTime())) return value
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${parsed.getMonth() + 1}월 ${parsed.getDate()}일 (${weekdays[parsed.getDay()]})`
}

function groupItemsByDate(items) {
  const groups = new Map()
  items.forEach(item => {
    const date = item.date || '날짜 미정'
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date).push(item)
  })
  return groups
}

/**
 * 일정 상태만으로 확실하게 답할 수 있는 질문은 모델을 거치지 않는다.
 * 작은 모델이 일정 JSON을 읽고도 “요약이 완료되었습니다”라고 답하는
 * 문제를 없애면서, 이런 질문은 첫 토큰을 기다리지 않고 바로 처리한다.
 */
export function answerScheduleQuestion(prompt, currentPlan) {
  const text = safeString(prompt, 1200)
  // “서울은 언제 여행하기 좋아?”처럼 여행이라는 단어만 포함한 일반
  // 여행 질문은 브라우저의 일정 상태 답변으로 가로채지 않는다.
  if (!/(?:일정|계획|코스)/u.test(text)) return null

  const items = Array.isArray(currentPlan?.items) ? currentPlan.items : []
  if (items.length === 0) return '현재 구성된 일정이 없습니다.'

  if (/(?:몇\s*(?:개|곳|장소)|총\s*몇|몇개|몇곳)/u.test(text)) {
    return `현재 일정은 총 ${items.length}개입니다.`
  }

  if (/(?:가장\s*(?:여유|한가)|여유로운|느긋한|비어\s*있는)/u.test(text)) {
    const groups = [...groupItemsByDate(items)]
    const minCount = Math.min(...groups.map(([, dayItems]) => dayItems.length))
    const relaxedDays = groups
      .filter(([, dayItems]) => dayItems.length === minCount)
      .map(([date]) => formatAnswerDate(date))
    return `${relaxedDays.join(', ')}이(가) 가장 여유롭습니다. 일정 ${minCount}개가 있어요.`
  }

  if (/(?:요약|목록|보여|나열|전체.*알려|일정.*알려)/u.test(text)) {
    const lines = [`현재 일정은 총 ${items.length}개입니다.`]
    for (const [date, dayItems] of groupItemsByDate(items)) {
      const entries = dayItems.map(item => {
        const time = item.time ? `${item.time} ` : ''
        return `${time}${item.destination || '장소 미정'}`
      }).join(', ')
      lines.push(`${formatAnswerDate(date)}: ${entries}`)
    }
    return lines.join('\n')
  }

  return null
}

function commandField(operation, key) {
  if (Object.prototype.hasOwnProperty.call(operation || {}, key)) return operation[key]
  return operation?.changes && typeof operation.changes === 'object' ? operation.changes[key] : undefined
}

function findCommandTarget(operation, items, prompt) {
  const targetId = safeString(commandField(operation, 'targetId'), 80)
  if (targetId) {
    const byId = items.find(item => item.id === targetId)
    if (byId) return byId
  }

  const candidates = [commandField(operation, 'target'), commandField(operation, 'destination')]
    .map(value => cleanPlaceCandidate(value))
    .filter(Boolean)
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeDestination(candidate)
    const exact = items.find(item => normalizeDestination(item.destination) === normalizedCandidate)
    if (exact) return exact
    const partial = items.find(item => {
      const normalizedItem = normalizeDestination(item.destination)
      return normalizedItem && (normalizedItem.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedItem))
    })
    if (partial) return partial
  }

  return findExplicitEditTargets(prompt, items)[0] || null
}

/**
 * 모델은 작은 명령만 반환하고, 실제 카드 객체는 브라우저가 만든다.
 * 따라서 모델이 기존 일정 전체를 누락하거나 필드를 임의로 초기화해도
 * 명령에 포함되지 않은 카드는 그대로 보존된다.
 */
export function applyMutationCommand(command, currentItems, prompt = '', { replaceAll = false } = {}) {
  const sourceItems = Array.isArray(currentItems) ? currentItems : []
  let nextItems = replaceAll ? [] : sourceItems.map(item => ({ ...item }))
  let operations = normalizeCommandOperations(command?.operations)
  if (operations.length === 0 && ['add', 'update', 'delete', 'replace'].includes(command?.intent)) {
    operations = normalizeCommandOperations([{ ...command, action: command.intent }])
  }

  for (const operation of operations) {
    if (operation.action === 'delete') {
      const target = findCommandTarget(operation, nextItems, prompt)
      if (!target) continue
      nextItems = nextItems.filter(item => item.id !== target.id)
      continue
    }

    if (operation.action === 'update' || operation.action === 'replace') {
      const target = findCommandTarget(operation, nextItems, prompt)
      if (!target) continue
      const destination = cleanPlaceCandidate(commandField(operation, 'destination'))
      const date = normalizeDate(commandField(operation, 'date'))
      const time = normalizeTime(commandField(operation, 'time'))
      const patch = {}
      if (destination && normalizeDestination(destination) !== normalizeDestination(target.destination)) {
        patch.destination = destination
        patch.address = ''
        patch.lat = null
        patch.lng = null
      }
      if (date) patch.date = date
      if (time) patch.time = time
      for (const field of ['address', 'memo', 'category', 'cost']) {
        const value = safeString(commandField(operation, field), field === 'memo' ? 800 : 240)
        if (value) patch[field] = value
      }
      if (Object.keys(patch).length > 0) {
        nextItems = nextItems.map(item => item.id === target.id ? { ...item, ...patch } : item)
      }
      continue
    }

    if (operation.action === 'add') {
      // 작은 모델은 add 작업에서도 장소명을 target으로 반환할 수 있다.
      // target을 기존 카드 식별자에만 쓰지 않고 새 장소명 후보로도 허용한다.
      const destination = cleanPlaceCandidate(
        commandField(operation, 'destination') || commandField(operation, 'target'),
      )
      if (!destination) continue
      const template = nextItems[nextItems.length - 1] || {}
      const date = normalizeDate(commandField(operation, 'date')) || parseExplicitDate(prompt) || template.date || ''
      const time = normalizeTime(commandField(operation, 'time')) || parseExplicitTime(prompt) || template.time || ''
      nextItems.push({
        id: makeId(),
        date,
        time,
        destination,
        address: safeString(commandField(operation, 'address'), 240),
        memo: safeString(commandField(operation, 'memo'), 800),
        lat: null,
        lng: null,
        order: Date.now() + nextItems.length,
        category: safeString(commandField(operation, 'category'), 40),
        cost: safeString(commandField(operation, 'cost'), 40),
      })
    }
  }

  return {
    items: nextItems,
    changed: nextItems.length !== sourceItems.length || nextItems.some((item, index) => !itemsAreEqual(item, sourceItems[index])),
  }
}

function fallbackControlDecision(prompt, currentPlan, tripRequest = null, mutationRequested = false) {
  const currentItems = Array.isArray(currentPlan?.items) ? currentPlan.items : []
  if (tripRequest && mutationRequested) {
    return { tool: 'replace_schedule', needsPlan: false, query: '' }
  }
  if (isWholePlanReplacement(prompt)) {
    return { tool: 'replace_schedule', needsPlan: false, query: '' }
  }
  if (hasRemovalRequest(prompt)) {
    return { tool: 'delete_schedule', needsPlan: currentItems.length > 0, query: '' }
  }
  if (
    /(?:수정|변경|바꿔|교체|이동|옮겨|시간|날짜|메모|노트|비고|동선|정리|늘려|줄여|앞당겨|늦춰)/u.test(prompt)
    || findExplicitEditTargets(prompt, currentItems).length > 0
  ) {
    return { tool: 'update_schedule', needsPlan: currentItems.length > 0, query: '' }
  }
  if (!mutationRequested && isPlaceSearchRequest(prompt)) {
    return { tool: 'search_places', needsPlan: false, query: sanitizeSearchQuery(prompt, prompt, currentItems) }
  }
  if (/(?:추가|더해|넣어|등록|생성)/u.test(prompt)) {
    return {
      tool: 'add_schedule',
      needsPlan: currentItems.length > 0 && /(?:현재|기존|지금|내|우리|일정|비어|빈|남은|시간)/u.test(prompt),
      query: '',
    }
  }
  return { tool: mutationRequested ? 'add_schedule' : 'none', needsPlan: false, query: '' }
}

/**
 * 브라우저에서만 실행되는 일정 도구 계층이다.
 * 모델은 도구명을 판단하고, 실제 일정 객체 생성·보존·삭제는 이 계층이
 * 담당한다. 따라서 모델이 전체 JSON을 다시 쓰지 않아도 카드 단위 변경이
 * 가능하고, 현재 일정도 필요한 시점에만 읽어 컨텍스트를 줄일 수 있다.
 */
export async function executeScheduleTool(toolName, command, {
  currentPlan = { title: '', items: [] },
  prompt = '',
  signal,
  onEvent,
} = {}) {
  const tool = normalizeToolName(toolName)
  const currentItems = Array.isArray(currentPlan?.items) ? currentPlan.items : []

  if (tool === 'load_plan') {
    return {
      tool,
      plan: compactPlan(currentPlan),
      items: currentItems.map(item => ({ ...item })),
    }
  }

  if (['add_schedule', 'update_schedule', 'delete_schedule', 'replace_schedule'].includes(tool)) {
    if (tool === 'replace_schedule' && Array.isArray(command?.items)) {
      const items = normalizeItems({ items: command.items }, [])
      return {
        tool,
        items,
        changed: items.length > 0 || currentItems.length === 0,
        plan: { title: safeString(command?.title || currentPlan?.title, 80), items },
      }
    }

    const result = applyMutationCommand(command, currentItems, prompt, {
      replaceAll: tool === 'replace_schedule',
    })
    return {
      tool,
      ...result,
      plan: { title: safeString(command?.title || currentPlan?.title, 80), items: result.items },
    }
  }

  if (tool === 'search_places') {
    const query = sanitizeSearchQuery(
      command?.query || command?.searchQuery || command?.target || '',
      prompt,
      currentItems,
    )
    if (!query) return { tool, query: '', results: [] }

    onEvent?.({ type: 'stage', key: 'search', label: query + ' 장소 검색 중' })
    const results = await searchPlaces(query, signal, {
      onAttempt: createSearchAttemptReporter(onEvent, signal),
    })
    throwIfAborted(signal)
    return { tool, query, results }
  }

  return { tool: 'none', items: currentItems.map(item => ({ ...item })), changed: false }
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

async function enrichItems(items, currentItems, signal, onEvent, knownResults = new Map(), prompt = '') {
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

    const query = sanitizeSearchQuery(item.destination, prompt, currentItems)
    if (!query) {
      // 모델이 장소명 대신 “일정을 수정해줘” 같은 지시문을 카드의
      // destination으로 넣어도 그 문장을 네이버에 전송하지 않는다.
      enriched.push(item)
      continue
    }
    onEvent?.({ type: 'search-start', itemId: item.id, query, label: query + ' 위치 확인 중' })
    let results = searchCache.get(normalizeDestination(query))
    if (!results) {
      try {
        results = await searchPlaces(query, signal, {
          onAttempt: createSearchAttemptReporter(onEvent, signal),
        })
        throwIfAborted(signal)
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        throwIfAborted(signal)
        results = []
        onEvent?.({
          type: 'warning',
          label: isSearchTimeoutError(error)
            ? getSearchTimeoutMessage(query, error.reason)
            : query + ' 좌표를 확인하지 못해 장소명만 반영합니다.',
        })
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

async function createCompletion(engine, messages, {
  strictJson = true,
  schema = MUTATION_SCHEMA,
  maxTokens = strictJson ? 420 : 280,
  signal,
} = {}) {
  throwIfAborted(signal)
  const request = {
    model: activeModelId,
    messages,
    temperature: strictJson ? 0.1 : 0.35,
    top_p: strictJson ? 0.8 : 0.9,
    max_tokens: maxTokens,
    stream: false,
    // Qwen3 fallback의 내부 추론 토큰이 JSON 출력 예산을 모두 소비하지
    // 않도록 비활성화한다. Qwen2.5에서는 이 옵션을 보내지 않는다.
    ...(activeModelId.startsWith('Qwen3') ? { extra_body: { enable_thinking: false } } : {}),
  }

  if (!strictJson) {
    const response = await engine.chat.completions.create({ ...request, messages })
    throwIfAborted(signal)
    return response
  }

  // 스키마가 있는 JSON 호출만 사용한다. 이전에는 먼저 schema 없는
  // json_object를 호출한 뒤 실패하면 다시 호출해 모든 질문이 두 번
  // 생성되었고, WebLLM grammar 오류 때문에 두 번째 질문부터 느려졌다.
  try {
    const response = await engine.chat.completions.create({
      ...request,
      response_format: { type: 'json_object', schema: JSON.stringify(schema) },
    })
    throwIfAborted(signal)
    return response
  } catch (schemaError) {
    if (signal?.aborted) throw createAbortError()
    // 구버전 WebLLM이나 특정 GPU에서 grammar가 지원되지 않는 경우에는
    // 일반 생성으로 한 번만 내려가며, 호출부에서 작은 응답을 복구한다.
    try {
      const response = await engine.chat.completions.create({ ...request })
      throwIfAborted(signal)
      return response
    } catch (fallbackError) {
      if (signal?.aborted) throw createAbortError()
      fallbackError.cause = schemaError
      throw fallbackError
    }
  }
}

const PLACE_SEARCH_REQUEST_PATTERN = /(?:지도|검색|찾아|찾을|맛집|카페|식당|명소|관광지|볼거리|갈\s*만한|가볼\s*만한|추천)/u
const PLAN_LOOKUP_PATTERN = /(?:일정|계획|코스).*(?:요약|목록|보여|나열|언제|몇|알려|확인)/u

function isPlaceSearchRequest(prompt) {
  const text = safeString(prompt, 1200)
  return PLACE_SEARCH_REQUEST_PATTERN.test(text) && !PLAN_LOOKUP_PATTERN.test(text)
}

function buildRouterMessages(prompt, conversationHistory) {
  return [
    { role: 'system', content: ROUTER_SYSTEM_PROMPT },
    ...compactConversationHistory(conversationHistory, { limit: 2, maxContent: 300 }),
    { role: 'user', content: JSON.stringify({ request: prompt }) },
  ]
}

function buildControlMessages(prompt, conversationHistory, tripRequest = null) {
  const request = { request: prompt }
  if (tripRequest) {
    request.fullTrip = {
      destination: tripRequest.destination,
      nights: tripRequest.nights,
      days: tripRequest.days,
      slotsPerDay: tripRequest.slotsPerDay,
    }
  }
  return [
    { role: 'system', content: CONTROL_SYSTEM_PROMPT },
    ...compactConversationHistory(conversationHistory, { limit: 2, maxContent: 300 }),
    { role: 'user', content: JSON.stringify(request) },
  ]
}

async function classifyRequest(engine, prompt, conversationHistory, signal, mutationRequested) {
  try {
    const response = await createCompletion(engine, buildRouterMessages(prompt, conversationHistory), {
      schema: ROUTER_SCHEMA,
      maxTokens: 64,
      signal,
    })
    return parseRouteDecision(modelText(response))
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    // 라우터만 실패한 경우에는 명시적인 변경 정규식을 안전망으로 사용해
    // 질문을 일정 편집으로 잘못 보내지 않도록 한다.
    return { route: mutationRequested ? 'control' : 'answer' }
  }
}

async function analyzeControlRequest(engine, prompt, conversationHistory, currentPlan, tripRequest, signal, mutationRequested) {
  const fallback = fallbackControlDecision(prompt, currentPlan, tripRequest, mutationRequested)
  try {
    const response = await createCompletion(engine, buildControlMessages(prompt, conversationHistory, tripRequest), {
      schema: CONTROL_SCHEMA,
      maxTokens: 100,
      signal,
    })
    const decision = parseControlDecision(modelText(response))
    const mutationTools = ['add_schedule', 'update_schedule', 'delete_schedule', 'replace_schedule']
    if (decision.tool === 'load_plan' || (mutationRequested && !mutationTools.includes(decision.tool))) return fallback
    if (decision.tool === 'update_schedule' || decision.tool === 'delete_schedule') decision.needsPlan = true
    return decision
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return fallback
  }
}

function buildMutationMessages(prompt, currentPlan, conversationHistory, tripRequest = null, dayContext = null, toolContext = null) {
  const request = {
    today: new Date().toISOString().slice(0, 10),
    request: prompt,
    currentPlan: compactPlan(currentPlan),
  }
  if (toolContext?.tool) {
    request.selectedTool = toolContext.tool
    request.planLoaded = Boolean(toolContext.planLoaded)
  }
  if (tripRequest) {
    request.fullTrip = {
      destination: tripRequest.destination,
      nights: tripRequest.nights,
      days: tripRequest.days,
      slotsPerDay: tripRequest.slotsPerDay,
      startDate: tripRequest.startDate,
    }
  }
  if (dayContext) {
    request.fullTripDay = {
      day: dayContext.day,
      date: dayContext.date,
      destination: tripRequest?.destination || '',
      slots: dayContext.slots,
      slot: dayContext.slot || null,
      avoidDestinations: dayContext.avoidDestinations,
    }
  }

  return [
    { role: 'system', content: MUTATION_SYSTEM_PROMPT },
    ...compactConversationHistory(conversationHistory, { limit: 6, maxContent: 700 }),
    { role: 'user', content: JSON.stringify(request) },
  ]
}

function normalizeGeneratedDayItems(items, dayDate, usedDestinations = new Set()) {
  const seenDestinations = new Set()
  return (Array.isArray(items) ? items : [])
    .map(item => {
      const destination = cleanPlaceCandidate(item?.destination)
      return {
        ...item,
        destination,
        // 하루 단위 생성의 날짜는 모델에 다시 물어보지 않고 요청한 날짜를
        // 기준으로 정렬한다. 장소·시간·메모의 선택은 계속 모델이 담당한다.
        date: dayDate,
        time: normalizeTime(item?.time),
      }
    })
    .filter(item => {
      const normalizedDestination = normalizeDestination(item.destination)
      if (!normalizedDestination || !item.time) return false
      if (seenDestinations.has(normalizedDestination) || usedDestinations.has(normalizedDestination)) return false
      seenDestinations.add(normalizedDestination)
      return true
    })
    .sort((left, right) => left.time.localeCompare(right.time))
}

function validateGeneratedDay(items, dayDate, slots) {
  const safeItems = Array.isArray(items) ? items : []
  const issues = []
  if (safeItems.length < slots) issues.push('하루 일정이 ' + slots + '개보다 적습니다.')
  if (safeItems.some(item => item.date !== dayDate)) issues.push('날짜가 요청한 날짜와 다릅니다.')
  if (safeItems.some(item => !normalizeTime(item.time))) issues.push('시간이 비어 있습니다.')
  if (new Set(safeItems.map(item => normalizeDestination(item.destination))).size < Math.min(2, slots)) {
    issues.push('서로 다른 장소가 충분하지 않습니다.')
  }
  return { valid: issues.length === 0, issues }
}

async function generateFullTripSlotItem(engine, prompt, conversationHistory, tripRequest, day, date, slot, usedDestinations, signal, onEvent) {
  const messages = buildMutationMessages(
    prompt,
    { title: '', items: [] },
    conversationHistory,
    tripRequest,
    {
      day,
      date,
      slots: 1,
      slot,
      avoidDestinations: [...usedDestinations].slice(-24),
    },
  )
  let issues = ['장소가 없습니다.']

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await createCompletion(engine, messages, {
      schema: MUTATION_SCHEMA,
      maxTokens: 420,
      signal,
    })
    throwIfAborted(signal)
    const rawText = modelText(response)
    let action
    try {
      action = parseAgentAction(rawText)
    } catch {
      action = null
    }

    const rawItems = action?.mode === 'apply'
      ? action.intent
        ? applyMutationCommand(action, [], prompt + ' ' + date, { replaceAll: true }).items
        : normalizeItems(action, [])
      : []
    const candidateItems = normalizeGeneratedDayItems(rawItems, date, usedDestinations)
    const quality = validateGeneratedDay(candidateItems, date, 1)
    if (quality.valid) return candidateItems[0]
    issues = quality.issues

    if (attempt === 2) break
    onEvent?.({ type: 'stage', key: 'repair', label: day + '일차 ' + slot + '번째 장소를 다시 선택 중' })
    messages.push(
      { role: 'assistant', content: rawText || '(빈 응답)' },
      {
        role: 'user',
        content: '이번 응답은 사용할 수 없다. ' + date + '의 ' + slot + '번째 방문 장소 한 곳만 고른다. 실제 장소명 하나와 HH:mm 시간 하나를 넣은 action=add operations JSON만 출력해줘. 장소를 설명하거나 검색하지 말고, 이미 선택된 장소와 겹치지 않게 해줘.',
      },
    )
  }

  throw new Error(day + '일차 ' + slot + '번째 장소 생성에 실패했습니다. ' + issues.join(' '))
}

/**
 * 전체 여행을 한 번에 긴 JSON으로 생성하면 작은 로컬 모델이 뒤쪽 날짜를
 * 누락하기 쉽다. 장소 목록을 브라우저에 내장하지 않고, 하루씩 AI에게
 * 독립적으로 생성시켜 필요한 카드 수를 채운다.
 */
async function generateFullTripItems(engine, prompt, conversationHistory, tripRequest, signal, onEvent) {
  const allItems = []
  const usedDestinations = new Set()

  for (let dayIndex = 0; dayIndex < tripRequest.days; dayIndex += 1) {
    const day = dayIndex + 1
    const date = addDaysToIso(tripRequest.startDate, dayIndex)
    const messages = buildMutationMessages(
      prompt,
      { title: '', items: [] },
      conversationHistory,
      tripRequest,
      {
        day,
        date,
        slots: tripRequest.slotsPerDay,
        avoidDestinations: [...usedDestinations].slice(-24),
      },
    )
    let dayItems = null
    let bestDayItems = []

    onEvent?.({ type: 'stage', key: 'plan', label: day + '일차 장소와 시간을 구성 중' })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await createCompletion(engine, messages, {
        schema: MUTATION_SCHEMA,
        maxTokens: 720,
        signal,
      })
      throwIfAborted(signal)
      const rawText = modelText(response)
      let action
      try {
        action = parseAgentAction(rawText)
      } catch {
        action = null
      }

      let candidateItems = []
      if (action?.mode === 'apply') {
        candidateItems = action.intent
          ? applyMutationCommand(action, [], prompt + ' ' + date, { replaceAll: true }).items
          : normalizeItems(action, [])
        candidateItems = normalizeGeneratedDayItems(candidateItems, date, usedDestinations)
      }
      if (candidateItems.length > bestDayItems.length) bestDayItems = candidateItems
      const quality = validateGeneratedDay(candidateItems, date, tripRequest.slotsPerDay)
      if (quality.valid) {
        dayItems = candidateItems.slice(0, tripRequest.slotsPerDay)
        break
      }

      if (attempt === 2) {
        break
      }
      onEvent?.({ type: 'stage', key: 'repair', label: day + '일차 일정의 장소와 시간을 다시 구성 중' })
      messages.push(
        { role: 'assistant', content: rawText || '(빈 응답)' },
        {
          role: 'user',
          content: '이번에는 ' + date + ' 하루 일정만 고친다. ' + quality.issues.join(' ') + '. 이미 선택된 장소('
            + ([...usedDestinations].join(', ') || '없음')
            + ')와 겹치지 않게 실제 장소 ' + tripRequest.slotsPerDay + '개를 고르고, 각각에 ' + date
            + '와 서로 다른 HH:mm 시간을 넣은 add operations JSON만 출력해줘. 검색이나 설명은 하지 마.',
        },
      )
    }

    dayItems = (dayItems || bestDayItems).slice(0, tripRequest.slotsPerDay)
    if (dayItems.length < tripRequest.slotsPerDay) {
      onEvent?.({ type: 'stage', key: 'plan', label: day + '일차 일정을 한 장소씩 보완 중' })
      const dayUsedDestinations = new Set([
        ...usedDestinations,
        ...dayItems.map(item => normalizeDestination(item.destination)),
      ])
      for (let slotIndex = dayItems.length; slotIndex < tripRequest.slotsPerDay; slotIndex += 1) {
        const item = await generateFullTripSlotItem(
          engine,
          prompt,
          conversationHistory,
          tripRequest,
          day,
          date,
          slotIndex + 1,
          dayUsedDestinations,
          signal,
          onEvent,
        )
        dayItems.push(item)
        dayUsedDestinations.add(normalizeDestination(item.destination))
      }
    }

    allItems.push(...dayItems)
    dayItems.forEach(item => usedDestinations.add(normalizeDestination(item.destination)))
  }

  return allItems
}

function buildAnswerMessages(prompt, currentPlan, conversationHistory, searchContext = null) {
  const request = {
    today: new Date().toISOString().slice(0, 10),
    request: prompt,
    currentPlan: compactPlan(currentPlan),
  }
  if (searchContext) {
    request.searchQuery = searchContext.query
    request.searchResults = searchContext.results.slice(0, 5)
  }

  return [
    { role: 'system', content: ANSWER_SYSTEM_PROMPT },
    ...compactConversationHistory(conversationHistory, { limit: 6, maxContent: 700 }),
    { role: 'user', content: JSON.stringify(request) },
  ]
}

function answerFromCompletion(response) {
  const rawText = modelText(response)
  const plainAnswer = extractPlainChatAnswer(rawText)
  if (plainAnswer) return { message: plainAnswer, rawText }

  // 모델이 자연어 계약을 지키지 않고 예전 JSON 형식으로 답해도 대화가
  // 실패하지 않도록 호환 파서를 마지막 안전망으로 사용한다.
  try {
    const action = parseAgentAction(rawText)
    if (action.message) return { message: safeString(action.message, 2000), rawText }
  } catch {}
  return { message: '', rawText }
}

async function searchForAnswer(prompt, currentItems, signal, onEvent) {
  const query = sanitizeSearchQuery(prompt, prompt, currentItems)
  if (!query) return null

  onEvent?.({ type: 'stage', key: 'search', label: query + ' 장소 검색 중' })
  try {
    const searchResult = await executeScheduleTool('search_places', { query }, {
      currentPlan: { title: '', items: currentItems },
      prompt,
      signal,
      onEvent,
    })
    throwIfAborted(signal)
    return { query: searchResult.query || query, results: searchResult.results || [] }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throwIfAborted(signal)
    onEvent?.({
      type: 'warning',
      label: isSearchTimeoutError(error)
        ? getSearchTimeoutMessage(query, error.reason)
        : query + ' 검색을 완료하지 못했습니다.',
    })
    return { query, results: [] }
  }
}

export async function runLocalAgent({ prompt, currentPlan, conversationHistory = [], signal, onEvent, onApplyPlan, onProgress, isLocked = false, aiConfig = createDefaultAiConfig() }) {
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
  const fullTripRequested = Boolean(tripRequest && mutationRequested)
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

  if (!mutationRequested) {
    const directAnswer = answerScheduleQuestion(cleanPrompt, currentPlan)
    if (directAnswer) {
      const answerAction = {
        mode: 'answer',
        title: currentPlan?.title || '',
        message: directAnswer,
        query: '',
        items: [],
      }
      onEvent?.({ type: 'done', label: directAnswer })
      return { action: answerAction, plan: null }
    }
  }

  const engine = aiConfig?.mode === 'api'
    ? createExternalEngine(aiConfig.external, signal)
    : await getLocalEngine(onProgress, aiConfig?.localModelId || LOCAL_MODEL_ID)
  throwIfAborted(signal)
  onEvent?.({ type: 'stage', key: 'model-ready', label: '질문을 분석하는 중' })

  const routeDecision = await classifyRequest(
    engine,
    cleanPrompt,
    conversationHistory,
    signal,
    mutationRequested,
  )
  onEvent?.({
    type: 'stage',
    key: 'route',
    label: routeDecision.route === 'control' ? '일정 제어가 필요한 요청으로 분류' : '답변만 필요한 질문으로 분류',
    responseMode: routeDecision.route === 'control' ? 'apply' : 'answer',
  })

  let controlDecision = null
  let shouldRouteToControl = mutationRequested || routeDecision.route === 'control'
  if (shouldRouteToControl) {
    controlDecision = await analyzeControlRequest(
      engine,
      cleanPrompt,
      conversationHistory,
      currentPlan,
      tripRequest,
      signal,
      mutationRequested,
    )
    if (controlDecision.tool === 'none' || (!mutationRequested && controlDecision.tool === 'search_places')) {
      // 장소 검색은 일정 수정 도구가 아니라 검색 결과를 포함한 답변 경로다.
      shouldRouteToControl = false
    }
    if (shouldRouteToControl) {
      onEvent?.({
        type: 'stage',
        key: 'tool-select',
        label: TOOL_LABELS[controlDecision.tool] || '일정 작업 도구를 선택하는 중',
        responseMode: 'apply',
      })
    }
  }

  let toolPlan = currentPlan
  const selectedTool = fullTripRequested
    ? 'replace_schedule'
    : controlDecision?.tool || 'update_schedule'
  const planRequired = shouldRouteToControl && (
    controlDecision?.needsPlan
    || ['update_schedule', 'delete_schedule'].includes(selectedTool)
  )
  if (planRequired) {
    const loaded = await executeScheduleTool('load_plan', null, {
      currentPlan,
      prompt: cleanPrompt,
      signal,
      onEvent,
    })
    toolPlan = loaded.plan
    onEvent?.({ type: 'stage', key: 'load-plan', label: '현재 일정 정보를 작업 도구에 전달 중' })
  }

  if (shouldRouteToControl) {
    if (fullTripRequested) {
      const generatedItems = await generateFullTripItems(
        engine,
        cleanPrompt,
        conversationHistory,
        tripRequest,
        signal,
        onEvent,
      )
      const quality = validateTripPlan(generatedItems, tripRequest)
      if (!quality.valid) {
        throw new Error('AI가 요청한 여행 기간에 맞는 일정을 만들지 못했습니다. ' + quality.issues.join(' '))
      }
      const toolResult = await executeScheduleTool('replace_schedule', {
        title: tripRequest.destination + ' ' + tripRequest.nights + '박 ' + tripRequest.days + '일 여행',
        items: generatedItems,
      }, {
        currentPlan,
        prompt: cleanPrompt,
        signal,
        onEvent,
      })
      action = {
        mode: 'apply',
        intent: 'replace',
        title: tripRequest.destination + ' ' + tripRequest.nights + '박 ' + tripRequest.days + '일 여행',
        message: 'AI가 여행지에 맞는 날짜별 일정을 구성했습니다.',
        query: '',
        items: toolResult.items,
        operations: [],
      }
      onEvent?.({ type: 'stage', key: 'validate', label: '구성한 날짜별 장소와 시간 검증 완료' })
    } else {
    onEvent?.({ type: 'stage', key: 'command', label: '일정 변경 내용을 정리하는 중' })
    const messages = buildMutationMessages(
      cleanPrompt,
      toolPlan,
      conversationHistory,
      tripRequest,
      null,
      { tool: selectedTool, planLoaded: planRequired },
    )
    const searchedQueries = new Set()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await createCompletion(engine, messages, {
        schema: MUTATION_SCHEMA,
        maxTokens: 420,
        signal,
      })
      throwIfAborted(signal)
      const rawText = modelText(response)
      lastRawText = rawText
      try {
        action = parseAgentAction(rawText)
      } catch (error) {
        if (attempt === 2) break
        onEvent?.({ type: 'stage', key: 'repair', label: 'AI 편집 명령을 다시 정리 중' })
        messages.push(
          { role: 'assistant', content: rawText || '(빈 응답)' },
          {
            role: 'user',
            content: '이전 응답은 사용할 수 없다. 전체 일정은 출력하지 말고, intent·message·query·operations를 포함한 JSON 객체 하나만 출력해줘. 전체 여행이면 모든 방문 장소를 add 작업으로 넣어줘.',
          },
        )
        continue
      }

      if (action.mode !== 'search' || !action.query) {
        if (action.mode === 'apply' && action.intent) {
          const commandResult = await executeScheduleTool(selectedTool, action, {
            currentPlan,
            prompt: cleanPrompt,
            signal,
            onEvent,
          })
          action = { ...action, items: commandResult.items || [] }
        }

        break
      }

      const searchQuery = sanitizeSearchQuery(action.query, cleanPrompt, currentItems)
      if (!searchQuery) {
        onEvent?.({ type: 'stage', key: 'repair', label: '편집 지시문을 장소 검색어로 사용하지 않고 계속 처리 중' })
        action = null
        break
      }

      const normalizedQuery = normalizeDestination(searchQuery)
      if (searchedQueries.has(normalizedQuery)) {
        onEvent?.({ type: 'stage', key: 'repair', label: '같은 검색이 반복되어 브라우저 일정 편집으로 전환 중' })
        action = null
        break
      }
      searchedQueries.add(normalizedQuery)
      onEvent?.({ type: 'stage', key: 'search', label: searchQuery + ' 장소 검색 중' })
      let results
      try {
        const searchResult = await executeScheduleTool('search_places', { query: searchQuery }, {
          currentPlan: toolPlan,
          prompt: cleanPrompt,
          signal,
          onEvent,
        })
        results = searchResult.results
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        throwIfAborted(signal)
        onEvent?.({
          type: 'warning',
          label: isSearchTimeoutError(error)
            ? getSearchTimeoutMessage(searchQuery, error.reason)
            : searchQuery + ' 검색을 완료하지 못했습니다.',
        })
        action = null
        break
      }
      throwIfAborted(signal)
      searchResults.set(normalizeDestination(searchQuery), results)
      messages.push(
        { role: 'assistant', content: rawText },
        {
          role: 'user',
          content: '검색 결과를 참고해 요청을 일정에 반영할 최소 operations만 작성해줘. 기존 일정을 전체 복사하지 말고, intent·message·query·operations를 포함한 JSON 하나만 출력해줘. '
            + `실제 지도 검색어는 "${searchQuery}"였고 결과는 ${JSON.stringify(results.slice(0, 5))}다.`,
        },
      )
      action = null
    }
    }
  } else {
    const searchContext = isPlaceSearchRequest(cleanPrompt)
      ? await searchForAnswer(cleanPrompt, currentItems, signal, onEvent)
      : null
    onEvent?.({ type: 'stage', key: 'answer', label: '답변을 작성하는 중', responseMode: 'answer' })
    const response = await createCompletion(
      engine,
      buildAnswerMessages(cleanPrompt, currentPlan, conversationHistory, searchContext),
      { strictJson: false, maxTokens: 280, signal },
    )
    throwIfAborted(signal)
    const answer = answerFromCompletion(response)
    lastRawText = answer.rawText
    if (answer.message) {
      action = {
        mode: 'answer',
        title: currentPlan?.title || '',
        message: answer.message,
        query: '',
        items: [],
      }
    }
  }

  throwIfAborted(signal)

  if (!action) {
    if (fullTripRequested) {
      throw new Error('AI가 요청한 여행 기간에 맞는 일정을 만들지 못했습니다. 여행지와 기간을 조금 더 구체적으로 적어주세요.')
    }
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
    if (shouldRouteToControl && recoveredItems !== currentItems) {
      action = {
        mode: 'apply',
        title: currentPlan?.title || '',
        message: '요청한 카드 정보를 화면에 반영했습니다.',
        query: '',
        items: recoveredItems,
      }
      onEvent?.({ type: 'stage', key: 'repair', label: '명시한 카드 변경을 브라우저에서 복구 중' })
    } else if (!shouldRouteToControl) {
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

  if (!shouldRouteToControl && action.mode === 'apply') {
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
    if (shouldRouteToControl && explicitlyChangedItems !== currentItems) {
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
  const safeItems = fullTripRequested
    ? requestedItems
    : preserveUnmentionedCurrentItems(cleanPrompt, requestedItems, currentItems)
  if (shouldProtectCurrentItems(cleanPrompt, currentItems, safeItems)) {
    throw new Error('기존 일정이 모두 사라지는 결과라 적용을 멈췄습니다. 삭제할 범위를 더 구체적으로 적어주세요.')
  }

  onEvent?.({ type: 'stage', key: 'search', label: '일정 장소의 위치 정보 보강 중' })
  const enrichedItems = await enrichItems(safeItems, currentItems, signal, onEvent, searchResults, cleanPrompt)
  throwIfAborted(signal)
  const nextPlan = {
    title: safeString(action.title || (fullTripRequested
      ? `${tripRequest.destination} ${tripRequest.nights}박 ${tripRequest.days}일 여행`
      : currentPlan?.title), 80),
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
  loadingModelId = ''
  loadedModelPreferenceId = ''
  progressListener = null
  activeModelId = LOCAL_MODEL_ID
}
