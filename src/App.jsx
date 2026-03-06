import { useState, useCallback, useRef } from 'react'
import Header from './components/Header'
import ItineraryPanel from './components/ItineraryPanel'
import MapPanel from './components/MapPanel'
import ConflictDialog from './components/ConflictDialog'
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
  } = useItineraries()

  const [activeItemId, setActiveItemId] = useState(null)
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('panel-width')
    return saved ? Math.max(MIN_PANEL_WIDTH, parseInt(saved, 10)) : 400
  })
  const draggingRef = useRef(false)
  const containerRef = useRef(null)

  const numberedItems = computeNumberedItems(items)

  const handleAddItem = useCallback((date = '') => {
    const last = items.length > 0 ? items[items.length - 1] : null
    const id = addItem({ date: date || last?.date || '', time: last?.time || '' })
    setActiveItemId(id)
  }, [addItem, items])

  const handleMarkerClick = useCallback((id) => setActiveItemId(id), [])

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
  }, [items, addItem])

  const handleResizerMouseDown = useCallback((e) => {
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
  }, [])

  return (
    <div className="app-layout">
      <Header
        canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo}
        plans={plans} activeId={activeId}
        onCreatePlan={createPlan} onDeletePlan={deletePlan} onSwitchPlan={switchPlan}
        isUrlLimitReached={isUrlLimitReached}
      />
      <div className="panels" ref={containerRef}>
        <ItineraryPanel
          items={numberedItems} title={title} onTitleChange={setTitle}
          activeItemId={activeItemId}
          onUpdate={updateItem} onDelete={deleteItem}
          onItemClick={handleItemClick} onAddItem={handleAddItem}
          style={{ width: panelWidth }}
        />
        <div className="panel-resizer" onMouseDown={handleResizerMouseDown} />
        <MapPanel
          items={numberedItems} activeItemId={activeItemId}
          onMarkerClick={handleMarkerClick} onRegisterPlace={handleRegisterPlace}
        />
      </div>
      <ConflictDialog conflictData={conflictData} onResolve={resolveConflict} />
    </div>
  )
}
