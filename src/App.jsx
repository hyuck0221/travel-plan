import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Header from './components/Header'
import ItineraryPanel from './components/ItineraryPanel'
import MapPanel from './components/MapPanel'
import ConflictDialog from './components/ConflictDialog'
import { IconMap, IconCalendar, IconLocation } from './components/Icons'
import { useItineraries } from './hooks/useItineraries'
import { computeNumberedItems } from './utils/markerNumbers'

const MIN_PANEL_WIDTH = 240
const MAX_PANEL_RATIO = 0.75

export default function App() {
  const {
    title, items, addItem, updateItem, deleteItem, setTitle,
    canUndo, canRedo, undo, redo,
    plans, activeId, createPlan, deletePlan, switchPlan,
    isUrlLimitReached,
    conflictData, resolveConflict,
    isLocked, toggleLock,
  } = useItineraries()

  const [activeItemId, setActiveItemId] = useState(null)
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('panel-width')
    return saved ? Math.max(MIN_PANEL_WIDTH, parseInt(saved, 10)) : 400
  })
  const [viewMode, setViewMode] = useState('list') // 'list' or 'map'
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [tracking, setTracking] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  
  const draggingRef = useRef(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const numberedItems = useMemo(() => computeNumberedItems(items), [items])

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

  return (
    <div className="app-layout">
      <Header
        canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo}
        plans={plans} activeId={activeId}
        onCreatePlan={createPlan} onDeletePlan={deletePlan} onSwitchPlan={switchPlan}
        isUrlLimitReached={isUrlLimitReached}
        isLocked={isLocked} onToggleLock={toggleLock}
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
            {/* 같이보기 — 일정 탭일 때 pill 위에 가로로 넓게 등장 */}
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
        )
      })()}

      <ConflictDialog conflictData={conflictData} onResolve={resolveConflict} />
    </div>
  )
}
