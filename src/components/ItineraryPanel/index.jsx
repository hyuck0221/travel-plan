import { useState, useRef, useEffect, Fragment } from 'react'
import { IconPlus, IconMap, IconEdit } from '../Icons'
import DateSection from './DateSection'
import ItineraryItem from './ItineraryItem'

function formatDate(d) {
  return d.replace(/-/g, '.')
}

function getDateRange(items) {
  const dates = items.map(i => i.date).filter(Boolean).sort()
  if (dates.length === 0) return null
  const min = dates[0]
  const max = dates[dates.length - 1]
  if (min === max) return formatDate(min)
  const days = Math.round((new Date(max) - new Date(min)) / 86400000) + 1
  return `${formatDate(min)} ~ ${formatDate(max)} (${days}일)`
}

function dateToSectionOrder(date) {
  return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 86400000)
}

function computeSections(items) {
  const datedGroups = {}
  const undatedItems = []

  items.forEach(item => {
    if (item.date) {
      if (!datedGroups[item.date]) datedGroups[item.date] = []
      datedGroups[item.date].push(item)
    } else {
      undatedItems.push(item)
    }
  })

  Object.values(datedGroups).forEach(group => {
    group.sort((a, b) => {
      if (!a.time && b.time) return 1
      if (a.time && !b.time) return -1
      return (a.time || '').localeCompare(b.time || '')
    })
  })

  const sections = []

  Object.entries(datedGroups).forEach(([date, dateItems]) => {
    sections.push({
      type: 'date',
      key: `date-${date}`,
      date,
      items: dateItems,
      order: dateToSectionOrder(date),
    })
  })

  undatedItems.forEach(item => {
    sections.push({
      type: 'undated',
      key: `undated-${item.id}`,
      item,
      order: item.order ?? 1e13,
    })
  })

  sections.sort((a, b) => a.order - b.order)
  return sections
}

function DropZone({ isActive, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      className={`dnd-drop-zone${isActive ? ' dnd-drop-zone--active' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop() }}
    />
  )
}

export default function ItineraryPanel({ items, title, onTitleChange, activeItemId, currentItemId, onUpdate, onDelete, onItemClick, onAddItem, style }) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const titleInputRef = useRef(null)

  const [draggedItemId, setDraggedItemId] = useState(null)
  const [dragOverZone, setDragOverZone] = useState(null)
  const [editingItemId, setEditingItemId] = useState(null)

  useEffect(() => { setTitleDraft(title) }, [title])

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  const commitTitle = () => {
    onTitleChange(titleDraft)
    setEditingTitle(false)
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') commitTitle()
    if (e.key === 'Escape') { setTitleDraft(title); setEditingTitle(false) }
  }

  const dateRange = getDateRange(items)
  const sections = computeSections(items)
  const isDragging = draggedItemId !== null

  const handleDragStart = (itemId, e) => {
    e.dataTransfer.effectAllowed = 'move'
    // 브라우저가 ghost 이미지를 캡처한 후 state 업데이트
    setTimeout(() => setDraggedItemId(itemId), 0)
  }

  const handleDragEnd = () => {
    setDraggedItemId(null)
    setDragOverZone(null)
  }

  const handleDrop = (zoneIdx) => {
    if (!draggedItemId) return

    // drop zone 앞뒤의 섹션 order 계산 (드래그 중인 항목 제외)
    const beforeZone = sections
      .slice(0, zoneIdx)
      .filter(s => s.type === 'date' || s.item.id !== draggedItemId)
    const afterZone = sections
      .slice(zoneIdx)
      .filter(s => s.type === 'date' || s.item.id !== draggedItemId)

    const prevOrder = beforeZone.length > 0 ? beforeZone[beforeZone.length - 1].order : null
    const nextOrder = afterZone.length > 0 ? afterZone[0].order : null

    let newOrder
    if (prevOrder === null && nextOrder === null) {
      newOrder = 100000
    } else if (prevOrder === null) {
      newOrder = nextOrder - 0.5
    } else if (nextOrder === null) {
      newOrder = prevOrder + 0.5
    } else {
      newOrder = (prevOrder + nextOrder) / 2
    }

    onUpdate(draggedItemId, { order: newOrder })
    setDraggedItemId(null)
    setDragOverZone(null)
  }

  return (
    <aside className="itinerary-panel" style={style}>
      {/* Trip header */}
      <div className="trip-header">
        <div className="trip-title-row">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="trip-title-input"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
              placeholder="여행 제목 입력"
              maxLength={50}
              style={{ userSelect: 'text' }}
            />
          ) : (
            <h2
              className={`trip-title${!title ? ' trip-title--empty' : ''}`}
              onClick={() => setEditingTitle(true)}
            >
              {title || '여행 제목 입력'}
              <IconEdit size={13} className="trip-title-edit-icon" />
            </h2>
          )}
        </div>
        {dateRange && <p className="trip-date-range">{dateRange}</p>}
      </div>

      {/* Panel actions */}
      <div className="panel-top">
        <h3 className="panel-title">일정</h3>
        <button className="btn btn-primary btn-sm" onClick={() => onAddItem('')}>
          <IconPlus size={14} /> 새 일정
        </button>
      </div>

      {items.length === 0 ? (
        <div className="panel-empty">
          <IconMap className="empty-icon" />
          <p>아직 일정이 없습니다.</p>
          <p className="empty-sub">지도에서 장소를 검색하거나 아래 버튼으로 일정을 추가하세요.</p>
          <button className="btn btn-primary" onClick={() => onAddItem('')}>
            <IconPlus size={14} /> 첫 일정 추가하기
          </button>
        </div>
      ) : (
        <div className="date-groups">
          {isDragging && (
            <DropZone
              isActive={dragOverZone === 0}
              onDragOver={() => setDragOverZone(0)}
              onDragLeave={() => setDragOverZone(null)}
              onDrop={() => handleDrop(0)}
            />
          )}
          {sections.map((section, idx) => (
            <Fragment key={section.key}>
              {section.type === 'date' ? (
                <DateSection
                  date={section.date}
                  items={section.items}
                  activeItemId={activeItemId}
                  currentItemId={currentItemId}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onItemClick={onItemClick}
                  onAddItem={onAddItem}
                />
              ) : (
                <div
                  className={`undated-item-container${draggedItemId === section.item.id ? ' undated-item-container--dragging' : ''}`}
                  draggable={editingItemId !== section.item.id}
                  onDragStart={(e) => handleDragStart(section.item.id, e)}
                  onDragEnd={handleDragEnd}
                >
                  <ItineraryItem
                    item={section.item}
                    isActive={activeItemId === section.item.id}
                    isCurrent={currentItemId === section.item.id}
                    isDraggable
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onClick={onItemClick}
                    onEditingChange={(isEditing) =>
                      setEditingItemId(isEditing ? section.item.id : null)
                    }
                  />
                </div>
              )}
              {isDragging && (
                <DropZone
                  isActive={dragOverZone === idx + 1}
                  onDragOver={() => setDragOverZone(idx + 1)}
                  onDragLeave={() => setDragOverZone(null)}
                  onDrop={() => handleDrop(idx + 1)}
                />
              )}
            </Fragment>
          ))}
        </div>
      )}
    </aside>
  )
}
