import { useState, useRef, useEffect } from 'react'
import { IconPlus, IconMap, IconEdit } from '../Icons'
import DateSection from './DateSection'

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

export default function ItineraryPanel({ items, title, onTitleChange, activeItemId, onUpdate, onDelete, onItemClick, onAddItem, style }) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const titleInputRef = useRef(null)

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

  const groups = {}
  const dateOrder = []
  items.forEach(item => {
    const key = item.date || ''
    if (!groups[key]) { groups[key] = []; dateOrder.push(key) }
    groups[key].push(item)
  })

  // 각 날짜 그룹 내에서 시간 오름차순 정렬 (시간 없는 항목은 마지막)
  Object.values(groups).forEach(group => {
    group.sort((a, b) => {
      if (!a.time && b.time) return 1
      if (a.time && !b.time) return -1
      return (a.time || '').localeCompare(b.time || '')
    })
  })

  const sortedDates = dateOrder.filter(d => d !== '').sort().concat(dateOrder.includes('') ? [''] : [])

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
          {sortedDates.map(date => (
            <DateSection
              key={date || '__no_date__'}
              date={date}
              items={groups[date]}
              activeItemId={activeItemId}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onItemClick={onItemClick}
              onAddItem={onAddItem}
            />
          ))}
        </div>
      )}
    </aside>
  )
}
