import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Header from './components/Header'
import ItineraryPanel from './components/ItineraryPanel'
import MapPanel from './components/MapPanel'
import ConflictDialog from './components/ConflictDialog'
import LandingPage from './components/LandingPage'
import MigrationNotice from './components/MigrationNotice'
import AIAssistant from './components/AIAssistant'
import { IconMap, IconCalendar, IconLocation } from './components/Icons'
import { useItineraries } from './hooks/useItineraries'
import { useLocalAgent } from './ai/useLocalAgent'
import { computeNumberedItems } from './utils/markerNumbers'
import { getMigratedDomainUrl, getMigrationContext, hasPlanData } from './utils/migration'

const MIN_PANEL_WIDTH = 240
const MAX_PANEL_RATIO = 0.75
const MOBILE_BREAKPOINT = 640
const AI_CHAT_MAX_MESSAGES = 40
const AI_ACTIVITY_MAX_ITEMS = 40
const AI_REQUEST_MAX_GROUPS = 20

function makeAiMessage(role, content, tone = '', id) {
  return {
    id: id || 'ai-chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    role,
    content: String(content || '').trim(),
    ...(tone ? { tone } : {}),
  }
}

export default function App() {
  const [migrationContext] = useState(() => getMigrationContext({
    originalUrl: window.__ORIGINAL_URL || window.location.href,
  }))
  const [showLanding, setShowLanding] = useState(() => migrationContext.shouldShowLanding)

  useEffect(() => {
    if (!migrationContext.shouldAutoRedirect) return
    window.location.replace(getMigratedDomainUrl(migrationContext.sourceUrl))
  }, [migrationContext])

  const handleEnter = () => {
    localStorage.setItem('hasVisited', '1')
    setShowLanding(false)
  }

  const {
    title, items, addItem, updateItem, deleteItem, setTitle, applyPlan,
    canUndo, canRedo, undo, redo,
    plans, activeId, createPlan, deletePlan, switchPlan,
    isUrlLimitReached,
    conflictData, resolveConflict,
    isLocked, toggleLock,
  } = useItineraries()

  const [activeItemId, setActiveItemId] = useState(null)
  const [aiOpen, setAiOpen] = useState(false)
  // AI 대화와 처리 과정은 일정 데이터와 분리된 세션 메모리 상태로만 유지한다.
  const [aiActivityByPlan, setAiActivityByPlan] = useState(() => ({}))
  const [aiActiveItemId, setAiActiveItemId] = useState(null)
  const [aiFlash, setAiFlash] = useState({ itemId: null, tick: 0 })
  const [aiSearch, setAiSearch] = useState({ query: '', searching: false })
  const [aiChatByPlan, setAiChatByPlan] = useState(() => ({}))
  const aiMessages = Array.isArray(aiChatByPlan[activeId]) ? aiChatByPlan[activeId] : []
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('panel-width')
    return saved ? Math.max(MIN_PANEL_WIDTH, parseInt(saved, 10)) : 400
  })
  const [viewMode, setViewMode] = useState('list') // 'list' or 'map'
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT)
  const [tracking, setTracking] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  
  const draggingRef = useRef(false)
  const containerRef = useRef(null)
  const activeAiRequestRef = useRef(null)
  const aiActivityGroups = Array.isArray(aiActivityByPlan[activeId]) ? aiActivityByPlan[activeId] : []

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const appendAiMessage = useCallback((message, planId = activeId) => {
    if (!planId || !message?.content) return null
    const nextMessage = message.id ? message : makeAiMessage(message.role, message.content, message.tone)
    setAiChatByPlan(prev => {
      const current = Array.isArray(prev[planId]) ? prev[planId] : []
      return {
        ...prev,
        [planId]: [...current, nextMessage].slice(-AI_CHAT_MAX_MESSAGES),
      }
    })
    return nextMessage
  }, [activeId])

  const updateAiActivityGroup = useCallback((planId, requestId, updater) => {
    if (!planId || !requestId) return
    setAiActivityByPlan(prev => {
      const current = Array.isArray(prev[planId]) ? prev[planId] : []
      let found = false
      const next = current.map(group => {
        if (group.id !== requestId) return group
        found = true
        const updated = typeof updater === 'function' ? updater(group) : { ...group, ...updater }
        return {
          ...updated,
          activities: Array.isArray(updated.activities) ? updated.activities.slice(-AI_ACTIVITY_MAX_ITEMS) : [],
        }
      })
      return found ? { ...prev, [planId]: next } : prev
    })
  }, [])

  const handleToggleAiActivityGroup = useCallback((requestId) => {
    if (!activeId) return
    updateAiActivityGroup(activeId, requestId, group => ({
      ...group,
      expanded: group.expanded === false,
    }))
  }, [activeId, updateAiActivityGroup])

  const handleAiEvent = useCallback((event) => {
    const activeRequest = activeAiRequestRef.current
    const activityType = event.type === 'stage' ? (event.key || 'stage') : event.type
    if (activeRequest && (event.label || event.responseMode)) updateAiActivityGroup(activeRequest.planId, activeRequest.requestId, group => ({
      ...group,
      ...(event.responseMode ? { responseMode: event.responseMode } : {}),
      ...(event.label ? {
        activities: [
          ...group.activities,
          {
            id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            type: activityType,
            label: event.label,
          },
        ],
      } : {}),
    }))
    if (event.itemId) {
      setAiActiveItemId(event.itemId)
      setActiveItemId(event.itemId)
      if (isMobile) setViewMode('list')
    }
    if (event.type === 'operation' && event.itemId) {
      setAiFlash(prev => ({ itemId: event.itemId, tick: prev.tick + 1 }))
      window.setTimeout(() => {
        setAiFlash(prev => prev.itemId === event.itemId ? { ...prev, itemId: null } : prev)
      }, 950)
    }
    if (event.type === 'search-start') {
      setAiSearch({ query: event.query || '', searching: true })
    } else if (event.type === 'search-result') {
      setAiSearch(prev => ({ ...prev, query: event.query || prev.query, searching: false }))
    } else if (['done', 'error', 'cancelled'].includes(event.type)) {
      setAiSearch(prev => ({ ...prev, searching: false }))
    }
    if (['done', 'error', 'cancelled'].includes(event.type)) {
      window.setTimeout(() => setAiActiveItemId(null), event.type === 'done' ? 900 : 0)
    }
    if (activeRequest && event.type === 'done') {
      updateAiActivityGroup(activeRequest.planId, activeRequest.requestId, { status: 'done' })
    }
    if (event.type === 'error' || event.type === 'cancelled') {
      const errorMessage = makeAiMessage(
        'assistant',
        event.label,
        event.type === 'error' ? 'error' : '',
      )
      appendAiMessage(errorMessage, activeRequest?.planId || activeId)
      if (activeRequest) updateAiActivityGroup(activeRequest.planId, activeRequest.requestId, {
        assistantMessageId: errorMessage.id,
        status: event.type,
      })
      activeAiRequestRef.current = null
    }
  }, [activeId, appendAiMessage, isMobile, updateAiActivityGroup])

  const handleAiApplyPlan = useCallback((plan, options) => {
    applyPlan(plan, options)
    if (!plan.items?.length) {
      setActiveItemId(null)
      setAiActiveItemId(null)
    }
  }, [applyPlan])

  const localAgent = useLocalAgent({
    onEvent: handleAiEvent,
    onApplyPlan: handleAiApplyPlan,
  })

  useEffect(() => {
    if (!aiOpen || localAgent.isRunning) return

    // 전체 일정 생성은 모델을 건너뛰므로, AI 패널을 연 시점에 모델을
    // 백그라운드에서 준비해 후속 채팅이 첫 모델 로딩을 기다리지 않게 한다.
    // 실패는 다음 실제 요청에서 기존 오류 안내로 처리한다.
    localAgent.warmUp().catch(() => {})
  }, [aiOpen, localAgent.isRunning, localAgent.warmUp])

  const handleAiSubmit = useCallback((prompt) => {
    const planId = activeId
    if (!planId) return
    const requestId = 'ai-request-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const userMessage = makeAiMessage('user', prompt)
    activeAiRequestRef.current = { planId, requestId }
    setAiActivityByPlan(prev => {
      const current = Array.isArray(prev[planId]) ? prev[planId] : []
      return {
        ...prev,
        [planId]: [
          ...current.map(group => ({ ...group, expanded: false })),
          {
            id: requestId,
            userMessageId: userMessage.id,
            assistantMessageId: null,
            activities: [],
            status: 'running',
            expanded: false,
          },
        ].slice(-AI_REQUEST_MAX_GROUPS),
      }
    })
    setAiActiveItemId(null)
    setAiFlash(prev => ({ ...prev, itemId: null }))
    setAiSearch({ query: '', searching: false })
    appendAiMessage(userMessage, planId)
    localAgent.run({
      prompt,
      currentPlan: { title, items },
      conversationHistory: aiMessages,
      isLocked,
    }).then(result => {
      if (!result) return
      const message = result.action?.message
        || (result.plan ? `${result.plan.items.length}개 일정을 반영했습니다.` : '요청을 확인했습니다.')
      const assistantMessage = makeAiMessage('assistant', message)
      const responseMode = result.action?.mode === 'apply' ? 'apply' : 'answer'
      appendAiMessage(assistantMessage, planId)
      updateAiActivityGroup(planId, requestId, {
        assistantMessageId: assistantMessage.id,
        status: 'done',
        responseMode,
        expanded: false,
      })
      if (activeAiRequestRef.current?.requestId === requestId) activeAiRequestRef.current = null
    })
  }, [activeId, aiMessages, appendAiMessage, handleAiEvent, isLocked, items, localAgent.run, title, updateAiActivityGroup])

  const activeAiItem = useMemo(
    () => items.find(item => item.id === aiActiveItemId) || null,
    [aiActiveItemId, items],
  )

  const numberedItems = useMemo(() => computeNumberedItems(items), [items])
  const hasMigratablePlans = useMemo(() => plans.some(hasPlanData), [plans])

  // Determine current item: the latest item that has already "started"
  // Recalculates whenever items change or the minute-timer (currentTime) ticks
  const currentItemId = useMemo(() => {
    const now = new Date().getTime() // Use fresh time on every render to reflect changes immediately
    let bestItem = null
    let maxStart = -1

    items.forEach(item => {
      if (!item.date) return
      const start = new Date(`${item.date}T${item.time || '00:00'}:00`).getTime()
      if (start <= now && start > maxStart) {
        maxStart = start
        bestItem = item
      }
    })
    return bestItem?.id
  }, [items, currentTime])

  const handleAddItem = useCallback((date = '') => {
    const last = items.length > 0 ? items[items.length - 1] : null
    const id = addItem({ date: date || last?.date || '', time: last?.time || '' })
    setActiveItemId(id)
    if (isMobile) setViewMode('list')
  }, [addItem, items, isMobile])

  const handleMarkerClick = useCallback((id) => {
    setActiveItemId(id)
    if (isMobile && viewMode !== 'both') setViewMode('list')
  }, [isMobile, viewMode])

  const handleItemClick = useCallback((id) => {
    setActiveItemId(prev => prev === id ? null : id)
  }, [])

  const handleRegisterPlace = useCallback(({ lat, lng, destination, address }) => {
    const last = items.length > 0 ? items[items.length - 1] : null
    const id = addItem({
      lat, lng, destination, address,
      date: last?.date || '',
      time: last?.time || '',
    })
    setActiveItemId(id)
    if (isMobile) setViewMode('list')
  }, [items, addItem, isMobile])

  const handleResizerMouseDown = useCallback((e) => {
    if (isMobile) return
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    let lastWidth = null
    const onMouseMove = (e) => {
      if (!draggingRef.current || !containerRef.current) return
      const left = containerRef.current.getBoundingClientRect().left
      const total = containerRef.current.offsetWidth
      lastWidth = Math.min(Math.max(e.clientX - left, MIN_PANEL_WIDTH), total * MAX_PANEL_RATIO)
      setPanelWidth(lastWidth)
    }
    const onMouseUp = () => {
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (lastWidth !== null) localStorage.setItem('panel-width', String(Math.round(lastWidth)))
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [isMobile])

  if (migrationContext.shouldAutoRedirect) {
    return (
      <div className="migration-redirect-screen" role="status">
        새 주소로 이동하고 있습니다…
      </div>
    )
  }

  if (showLanding) return <LandingPage onEnter={handleEnter} />

  return (
    <div className="app-layout">
      {migrationContext.active && hasMigratablePlans && <MigrationNotice plans={plans} />}
      <Header
        plans={plans} activeId={activeId}
        onCreatePlan={createPlan} onDeletePlan={deletePlan} onSwitchPlan={switchPlan}
        isUrlLimitReached={isUrlLimitReached}
        isLocked={isLocked} onToggleLock={toggleLock}
        onToggleAI={() => setAiOpen(prev => !prev)}
        onCloseAI={() => setAiOpen(false)}
        isAiOpen={aiOpen}
        isAiRunning={localAgent.isRunning}
      />
      <div className={`panels${isMobile && viewMode === 'both' ? ' panels--split' : ''}`} ref={containerRef}>
        <div
          className={`itinerary-panel-wrapper${isMobile && viewMode === 'map' ? ' itinerary-panel--hidden' : ''}`}
          style={!isMobile ? { width: panelWidth } : {}}
        >
          <ItineraryPanel
            items={numberedItems} title={title} onTitleChange={setTitle}
            activeItemId={activeItemId}
            currentItemId={currentItemId}
            canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo}
            aiFlashItemId={aiFlash.itemId}
            aiFlashTick={aiFlash.tick}
            onUpdate={updateItem} onDelete={deleteItem}
            onItemClick={handleItemClick} onAddItem={handleAddItem}
            isLocked={isLocked}
          />
        </div>
        {!isMobile && <div className="panel-resizer" onMouseDown={handleResizerMouseDown} />}
        <div className={`map-panel-wrapper${isMobile && viewMode === 'list' ? ' map-panel--hidden' : ''}`}>
          <MapPanel
            items={numberedItems} activeItemId={activeItemId}
            onMarkerClick={handleMarkerClick} onRegisterPlace={handleRegisterPlace}
            tracking={tracking} onToggleTracking={setTracking}
            isLocked={isLocked}
            aiSearchQuery={aiSearch.query}
            aiSearching={aiSearch.searching}
          />
        </div>
      </div>

      {isMobile && (() => {
        const locationVisible = viewMode === 'map' || viewMode === 'both'
        const switcherState = viewMode === 'both' && tracking ? 'both-tracking'
          : viewMode === 'both' ? 'both'
          : viewMode === 'map' && tracking ? 'map-tracking'
          : viewMode === 'map' ? 'map'
          : 'list'
        return (
          <div className="mobile-controls">
            <div className="mobile-controls-stack">
              {/* 같이보기 — 일정 탭일 때 스위처와 같은 폭으로 등장 */}
              <div className={`split-view-hint${viewMode === 'list' ? ' split-view-hint--visible' : ''}`}>
                <button className="split-view-btn" onClick={() => setViewMode('both')}>
                  같이보기
                </button>
              </div>

              <div className={`mobile-view-switcher mobile-view-switcher--${switcherState}`}>
                <button className="switcher-btn switcher-btn--list" onClick={() => setViewMode('list')}>
                  <IconCalendar size={16} /> 일정
                </button>
                <button className="switcher-btn switcher-btn--map" onClick={() => setViewMode('map')}>
                  <IconMap size={16} /> 지도
                </button>
                <button
                  className={`switcher-btn switcher-location-btn${locationVisible ? ' switcher-location-btn--visible' : ''}`}
                  onClick={() => setTracking(v => !v)}
                  title={tracking ? '현위치 표시 끄기' : '현위치 표시'}
                  tabIndex={locationVisible ? 0 : -1}
                >
                  <IconLocation size={16} />
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <AIAssistant
        id="ai-assistant-panel"
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSubmit={handleAiSubmit}
        onCancel={localAgent.cancel}
        status={localAgent.status}
        progress={localAgent.progress}
        activityGroups={aiActivityGroups}
        onToggleActivityGroup={handleToggleAiActivityGroup}
        messages={aiMessages}
        activeItem={activeAiItem}
        error={localAgent.error}
        isMobile={isMobile}
      />

      <ConflictDialog conflictData={conflictData} onResolve={resolveConflict} />
    </div>
  )
}
