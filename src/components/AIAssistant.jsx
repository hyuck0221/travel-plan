import { Fragment, useEffect, useRef, useState } from 'react'
import { IconCheck, IconClose, IconLoader, IconSparkle } from './Icons'

const SUGGESTIONS = [
  { label: '새 여행 만들기', prompt: '서울 2박 3일 여행 일정을 처음부터 만들어줘. 하루 3곳 정도로 여유 있게 구성해줘.' },
  { label: '동선 다듬기', prompt: '현재 일정의 장소 순서를 지도 동선이 자연스럽도록 정리하고, 비어 있는 시간에는 카페를 하나 추가해줘.' },
  { label: '세부 정보 채우기', prompt: '현재 일정의 빠진 날짜와 시간을 하루 흐름에 맞게 채우고, 각 장소에 짧은 메모를 붙여줘.' },
]

const AI_PANEL_MIN_WIDTH = 300
const AI_PANEL_MIN_HEIGHT = 280
const AI_PANEL_MARGIN = 12
const AI_INPUT_MAX_HEIGHT = 160
const RESIZE_DIRECTIONS = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']
const RESIZE_CURSORS = {
  n: 'ns-resize', e: 'ew-resize', s: 'ns-resize', w: 'ew-resize',
  ne: 'nesw-resize', se: 'nwse-resize', sw: 'nesw-resize', nw: 'nwse-resize',
}

function clampPanelGeometry(geometry) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const maxWidth = Math.max(AI_PANEL_MIN_WIDTH, viewportWidth - AI_PANEL_MARGIN * 2)
  const maxHeight = Math.max(AI_PANEL_MIN_HEIGHT, viewportHeight - AI_PANEL_MARGIN * 2)
  const width = Math.min(Math.max(geometry.width, AI_PANEL_MIN_WIDTH), maxWidth)
  const height = Math.min(Math.max(geometry.height, AI_PANEL_MIN_HEIGHT), maxHeight)
  const maxLeft = Math.max(AI_PANEL_MARGIN, viewportWidth - width - AI_PANEL_MARGIN)
  const maxTop = Math.max(AI_PANEL_MARGIN, viewportHeight - height - AI_PANEL_MARGIN)

  return {
    left: Math.min(Math.max(geometry.left, AI_PANEL_MARGIN), maxLeft),
    top: Math.min(Math.max(geometry.top, AI_PANEL_MARGIN), maxTop),
    width,
    height,
  }
}

function getInitialPanelGeometry() {
  const width = Math.min(380, Math.max(AI_PANEL_MIN_WIDTH, window.innerWidth - AI_PANEL_MARGIN * 2))
  const height = Math.min(
    Math.max(380, Math.round(window.innerHeight * 0.53)),
    720,
    Math.max(AI_PANEL_MIN_HEIGHT, window.innerHeight - 96),
  )

  return clampPanelGeometry({
    left: window.innerWidth - width - 20,
    top: 76,
    width,
    height,
  })
}

function resizePanelGeometry(start, direction, deltaX, deltaY) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  let left = start.left
  let right = start.left + start.width
  let top = start.top
  let bottom = start.top + start.height

  if (direction.includes('w')) {
    left = Math.min(Math.max(start.left + deltaX, AI_PANEL_MARGIN), right - AI_PANEL_MIN_WIDTH)
  }
  if (direction.includes('e')) {
    right = Math.max(Math.min(right + deltaX, viewportWidth - AI_PANEL_MARGIN), left + AI_PANEL_MIN_WIDTH)
  }
  if (direction.includes('n')) {
    top = Math.min(Math.max(start.top + deltaY, AI_PANEL_MARGIN), bottom - AI_PANEL_MIN_HEIGHT)
  }
  if (direction.includes('s')) {
    bottom = Math.max(Math.min(bottom + deltaY, viewportHeight - AI_PANEL_MARGIN), top + AI_PANEL_MIN_HEIGHT)
  }

  return { left, top, width: right - left, height: bottom - top }
}

function statusCopy(status, progress) {
  if (status === 'loading') {
    if (progress > 0.01) return '로컬 모델 준비 중 ' + Math.round(progress * 100) + '%'
    return '로컬 모델 준비 중'
  }
  if (status === 'working') return 'AI가 요청을 처리하는 중'
  if (status === 'applying') return '일정을 화면에 적용하는 중'
  if (status === 'answered') return '답변을 보냈습니다'
  if (status === 'done') return '일정에 반영했습니다'
  if (status === 'cancelled') return '작업을 중단했습니다'
  if (status === 'error') return '작업을 완료하지 못했습니다'
  return '대기 중'
}

function ActivityThread({ group, onToggle }) {
  const activities = Array.isArray(group?.activities) ? group.activities : []
  if (activities.length === 0 || group?.responseMode === 'answer') return null

  const expanded = group.expanded !== false
  if (!expanded) {
    return (
      <div className="ai-activity-thread ai-activity-thread--collapsed">
        <button
          className="ai-activity-toggle"
          type="button"
          aria-expanded="false"
          aria-label={`수정사항 ${activities.length}개 펼치기`}
          onClick={() => onToggle?.(group.id)}
        >
          <span className="ai-activity-toggle-copy">수정사항 {activities.length}개 · 펼쳐보기 ↓</span>
        </button>
      </div>
    )
  }

  return (
    <div className="ai-activity-thread ai-activity-thread--expanded">
      <div className="ai-activity-list" aria-live="polite">
        {activities.map(activity => (
          <div key={activity.id} className={'ai-activity ai-activity--' + activity.type}>
            <span className="ai-activity-icon">
              {activity.type === 'done' ? <IconCheck size={13} /> : activity.type === 'error' ? '!' : <span />}
            </span>
            <span>{activity.label}</span>
          </div>
        ))}
      </div>
      <button
        className="ai-activity-toggle ai-activity-toggle--collapse"
        type="button"
        aria-expanded="true"
        aria-label={`수정사항 ${activities.length}개 접기`}
        onClick={() => onToggle?.(group.id)}
      >
        <span className="ai-activity-toggle-copy">접기 ↑</span>
      </button>
    </div>
  )
}

export default function AIAssistant({
  id,
  open,
  onClose,
  onSubmit,
  onCancel,
  status = 'idle',
  progress = 0,
  activityGroups = [],
  onToggleActivityGroup,
  messages = [],
  activeItem,
  error = '',
  isMobile = false,
}) {
  const [draft, setDraft] = useState('')
  const [panelGeometry, setPanelGeometry] = useState(getInitialPanelGeometry)
  const [isInteracting, setIsInteracting] = useState(false)
  const inputRef = useRef(null)
  const contentEndRef = useRef(null)
  const interactionRef = useRef(null)
  const submitRef = useRef(null)
  const isRunning = ['loading', 'working', 'applying'].includes(status)

  const handleSubmit = (event) => {
    event.preventDefault()
    const prompt = draft.trim()
    if (!prompt || isRunning) return
    setDraft('')
    onSubmit(prompt)
  }

  // React의 이벤트 위임보다 먼저 입력창에서 Enter를 가로채 일정 카드의
  // window 단축키로 전파되지 않도록 한다. submit 함수는 최신 draft를
  // 사용해야 하므로 ref를 통해 현재 렌더의 함수를 참조한다.
  submitRef.current = handleSubmit

  useEffect(() => {
    if (!open || !inputRef.current) return undefined
    const input = inputRef.current
    const handleNativeKeyDown = (event) => {
      if (event.key !== 'Enter') return

      // Shift+Enter는 줄바꿈만 허용하되 일정 카드로는 전파하지 않는다.
      event.stopPropagation()
      if (event.shiftKey) return

      event.preventDefault()
      event.stopImmediatePropagation()
      submitRef.current?.(event)
    }

    input.addEventListener('keydown', handleNativeKeyDown, true)
    return () => input.removeEventListener('keydown', handleNativeKeyDown, true)
  }, [open])

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open || !inputRef.current) return
    const input = inputRef.current
    input.style.height = 'auto'
    const contentHeight = input.scrollHeight
    input.style.height = Math.min(contentHeight, AI_INPUT_MAX_HEIGHT) + 'px'
    input.style.overflowY = contentHeight > AI_INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [draft, open])

  useEffect(() => {
    contentEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length, activityGroups.reduce((total, group) => total + (Array.isArray(group.activities) ? group.activities.length : 0), 0), activeItem?.id, isRunning])

  useEffect(() => {
    const handleViewportResize = () => setPanelGeometry(previous => clampPanelGeometry(previous))
    window.addEventListener('resize', handleViewportResize)
    return () => window.removeEventListener('resize', handleViewportResize)
  }, [])

  useEffect(() => {
    if (open && !isMobile) return undefined
    interactionRef.current = null
    setIsInteracting(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    return undefined
  }, [open, isMobile])

  useEffect(() => {
    if (!isInteracting) return undefined

    const handlePointerMove = (event) => {
      const interaction = interactionRef.current
      if (!interaction) return
      event.preventDefault()
      const deltaX = event.clientX - interaction.startX
      const deltaY = event.clientY - interaction.startY

      if (interaction.type === 'drag') {
        setPanelGeometry(previous => clampPanelGeometry({
          ...previous,
          left: interaction.startGeometry.left + deltaX,
          top: interaction.startGeometry.top + deltaY,
        }))
        return
      }

      setPanelGeometry(resizePanelGeometry(interaction.startGeometry, interaction.direction, deltaX, deltaY))
    }
    const stopInteraction = () => {
      interactionRef.current = null
      setIsInteracting(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', stopInteraction)
    document.addEventListener('pointercancel', stopInteraction)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', stopInteraction)
      document.removeEventListener('pointercancel', stopInteraction)
    }
  }, [isInteracting])

  useEffect(() => () => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const beginInteraction = (event, interaction, cursor) => {
    if (isMobile || event.button !== 0) return
    event.preventDefault()
    interactionRef.current = interaction
    document.body.style.cursor = cursor
    document.body.style.userSelect = 'none'
    setIsInteracting(true)
  }

  const handleDragStart = (event) => {
    if (event.target.closest?.('button, a, input, textarea, select')) return
    beginInteraction(event, {
      type: 'drag',
      startX: event.clientX,
      startY: event.clientY,
      startGeometry: panelGeometry,
    }, 'grabbing')
  }

  const handleResizeStart = (event, direction) => {
    event.stopPropagation()
    beginInteraction(event, {
      type: 'resize',
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startGeometry: panelGeometry,
    }, RESIZE_CURSORS[direction])
  }

  if (!open) return null

  const handleSuggestion = (prompt) => {
    if (isRunning) return
    setDraft(prompt)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const panelStyle = !isMobile ? {
    left: panelGeometry.left + 'px',
    top: panelGeometry.top + 'px',
    right: 'auto',
    bottom: 'auto',
    width: panelGeometry.width + 'px',
    height: panelGeometry.height + 'px',
  } : undefined

  const activityGroupByMessageId = new Map()
  activityGroups.forEach(group => {
    const messageId = group.assistantMessageId
    if (messageId) activityGroupByMessageId.set(messageId, group)
  })

  return (
    <aside
      id={id}
      className={'ai-assistant' + (isInteracting ? ' ai-assistant--interacting' : '')}
      style={panelStyle}
      aria-label="Travelink AI"
    >
      <div className="ai-assistant-header" onPointerDown={handleDragStart}>
        <div className="ai-assistant-brand">
          <span className={'ai-assistant-orb' + (isRunning ? ' ai-assistant-orb--running' : '')}>
            <IconSparkle size={17} />
          </span>
          <div>
            <strong>Travelink AI</strong>
            <span className={`ai-assistant-status ai-assistant-status--${status || 'idle'}`} role="status" aria-live="polite">
              {statusCopy(status, progress)}
            </span>
          </div>
        </div>
        <button className="ai-close-btn" onPointerDown={event => event.stopPropagation()} onClick={onClose} aria-label="Travelink AI 닫기">
          <IconClose size={17} />
        </button>
      </div>

      <div className="ai-assistant-body">
        {messages.length > 0 && (
          <div className="ai-chat-history" aria-label="AI 대화 이력">
            {messages.map(message => {
              const activityGroup = activityGroupByMessageId.get(message.id)
              return (
                <Fragment key={message.id}>
                  <div className={'ai-chat-message ai-chat-message--' + (message.role === 'user' ? 'user' : 'assistant')}>
                    <div className={'ai-chat-bubble' + (message.tone === 'error' ? ' ai-chat-bubble--error' : '')}>
                      {message.content}
                    </div>
                  </div>
                  {activityGroup && (
                    <ActivityThread group={activityGroup} onToggle={onToggleActivityGroup} />
                  )}
                </Fragment>
              )
            })}
            <div ref={contentEndRef} />
          </div>
        )}

        {status === 'applying' && (
          <div className="ai-progress-card">
            <div className="ai-progress-copy">
              <span className="ai-live-dot" />
              <span>{statusCopy(status, progress)}</span>
            </div>
            <div className="ai-progress-track" aria-hidden="true">
              <span style={{ width: Math.max(progress * 100, 4) + '%' }} />
            </div>
            {activeItem && (
              <div className="ai-focus-card">
                <span className="ai-focus-pulse" />
                <div>
                  <strong>{activeItem.destination || '새 일정'}</strong>
                  <small>일정 카드와 지도 핀을 함께 확인하는 중</small>
                </div>
              </div>
            )}
          </div>
        )}

        {status === 'idle' && activityGroups.length === 0 && messages.length === 0 && (
          <div className="ai-assistant-intro">
            <div className="ai-intro-icon"><IconSparkle size={20} /></div>
            <strong>무엇을 도와드릴까요?</strong>
            <p>일정을 바로 수정하거나, 지금 구성된 일정에 대해 궁금한 점을 물어보세요.</p>
          </div>
        )}

        {error && <div className="ai-error-message" role="alert">{error}</div>}

        {status === 'idle' && activityGroups.length === 0 && messages.length === 0 && (
          <div className="ai-suggestion-list">
            {SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion.label}
                className="ai-suggestion"
                type="button"
                onClick={() => handleSuggestion(suggestion.prompt)}
              >
                <span>{suggestion.label}</span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <form className="ai-assistant-composer" data-ai-composer="true" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="ai-itinerary-prompt">AI에게 보낼 메시지</label>
        <div className="ai-composer-row">
          <textarea
            ref={inputRef}
            id="ai-itinerary-prompt"
            data-ai-input="true"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              // 일정 카드가 window에 등록한 Enter 단축키까지 도달하지 않게 한다.
              event.stopPropagation()
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSubmit(event)
              }
            }}
            placeholder="무엇이든 시켜보세요."
            maxLength={1200}
            rows={1}
            disabled={isRunning}
          />
          <div className="ai-composer-footer">
            {isRunning ? (
              <button className="ai-submit-btn ai-submit-btn--cancel" type="button" onClick={onCancel} aria-label="중단" title="중단">
                <IconLoader size={14} />
              </button>
            ) : (
              <button className="ai-submit-btn" type="submit" disabled={!draft.trim()} aria-label="요청 보내기" title="요청 보내기">
                <IconSparkle size={14} />
              </button>
            )}
          </div>
        </div>
      </form>

      {!isMobile && RESIZE_DIRECTIONS.map(direction => (
        <span
          key={direction}
          className={`ai-resize-handle ai-resize-handle--${direction}`}
          aria-hidden="true"
          onPointerDown={event => handleResizeStart(event, direction)}
        />
      ))}
    </aside>
  )
}
