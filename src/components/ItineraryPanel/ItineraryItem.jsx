import { useState, useRef, useEffect } from 'react'
import { IconEdit, IconTrash, IconPin, IconGrip, IconNaver } from '../Icons'
import DatePicker from '../DatePicker'
import TimePicker from '../TimePicker'
import PlaceSearchInput from '../PlaceSearchInput'

const CATEGORIES = [
  { key: 'hotel',      emoji: '🏨', label: '숙소' },
  { key: 'restaurant', emoji: '🍽️', label: '식당' },
  { key: 'cafe',       emoji: '☕', label: '카페' },
  { key: 'attraction', emoji: '🏛️', label: '관광지' },
  { key: 'shopping',   emoji: '🛍️', label: '쇼핑' },
  { key: 'transport',  emoji: '🚌', label: '교통' },
  { key: 'activity',   emoji: '🎡', label: '액티비티' },
  { key: 'nature',     emoji: '🌿', label: '자연' },
]

const categoryEmoji = Object.fromEntries(CATEGORIES.map(c => [c.key, c.emoji]))

const formatCostDisplay = (val) => {
  if (!val) return ''
  const digits = String(val).replace(/\D/g, '')
  if (!digits) return ''
  return '₩' + Number(digits).toLocaleString('ko-KR')
}

function formatDisplayDate(d) {
  if (!d) return null
  const [y, m, day] = d.split('-')
  return `${y}.${m}.${day}`
}

export default function ItineraryItem({ item, isActive, isCurrent, onUpdate, onDelete, onClick, isDraggable, onEditingChange, isLocked }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    date: item.date, time: item.time,
    destination: item.destination, address: item.address, memo: item.memo,
    lat: item.lat, lng: item.lng,
    cost: (item.cost || '').replace(/\D/g, ''),
    category: item.category || '',
  })
  const [showDate, setShowDate] = useState(false)
  const [showTime, setShowTime] = useState(false)
  const isSearchOpen = useRef(false)
  const itemRef = useRef(null)

  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive || editing || isLocked) return
    const handler = (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setEditing(true)
        onEditingChange?.(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isActive, editing, onEditingChange, isLocked])

  useEffect(() => {
    if (!editing) {
      setForm({
        date: item.date, time: item.time,
        destination: item.destination, address: item.address, memo: item.memo,
        lat: item.lat, lng: item.lng,
        cost: (item.cost || '').replace(/\D/g, ''),
        category: item.category || '',
      })
    }
  }, [item, editing])

  const handleSave = () => { onUpdate(item.id, form); setEditing(false); onEditingChange?.(false) }

  const handleCancel = () => {
    setForm({
      date: item.date, time: item.time,
      destination: item.destination, address: item.address, memo: item.memo,
      lat: item.lat, lng: item.lng,
      cost: (item.cost || '').replace(/\D/g, ''),
      category: item.category || '',
    })
    setShowDate(false)
    setShowTime(false)
    setEditing(false)
    onEditingChange?.(false)
  }

  const enterEdit = (e) => { if (isLocked) return; e.stopPropagation(); setEditing(true); onEditingChange?.(true) }

  const markerLabel = item.markerNumber != null
    ? <span className="marker-badge">{item.markerNumber}</span>
    : <span className="marker-badge marker-badge--no-pin"><IconPin size={13} /></span>

  const handleEditKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); handleCancel() }
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      if (isSearchOpen.current) return
      e.preventDefault()
      handleSave()
    }
  }

  if (editing) {
    return (
      <div
        ref={itemRef}
        className={`itinerary-item itinerary-item--editing${isActive ? ' itinerary-item--active' : ''}`}
        onKeyDown={handleEditKeyDown}
      >
        <div className="item-edit-form">

          {/* 날짜 toggle */}
          <div className="field-toggle-row">
            <span className="field-toggle-label">날짜</span>
            <span className="field-toggle-value">
              {form.date ? formatDisplayDate(form.date) : <span className="field-toggle-empty">미설정</span>}
            </span>
            <button
              type="button"
              className={`field-toggle-btn${showDate ? ' field-toggle-btn--active' : ''}`}
              onClick={() => setShowDate(v => !v)}
            >
              {showDate ? '완료' : '변경'}
            </button>
          </div>
          {showDate && (
            <DatePicker
              value={form.date}
              onChange={date => setForm(f => ({ ...f, date }))}
            />
          )}

          {/* 시간 toggle */}
          <div className="field-toggle-row" style={{ marginTop: 6 }}>
            <span className="field-toggle-label">시간</span>
            <span className="field-toggle-value">
              {form.time || <span className="field-toggle-empty">미설정</span>}
            </span>
            <button
              type="button"
              className={`field-toggle-btn${showTime ? ' field-toggle-btn--active' : ''}`}
              onClick={() => setShowTime(v => !v)}
            >
              {showTime ? '완료' : '변경'}
            </button>
          </div>
          {showTime && (
            <TimePicker
              value={form.time}
              onChange={time => setForm(f => ({ ...f, time }))}
            />
          )}

          {/* 카테고리 */}
          <div className="category-row" style={{ marginTop: 6 }}>
            <span className="field-toggle-label">카테고리</span>
            <div className="category-picker">
              {CATEGORIES.map(({ key, emoji, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`category-btn${form.category === key ? ' category-btn--active' : ''}`}
                  title={label}
                  onClick={() => setForm(f => ({ ...f, category: f.category === key ? '' : key }))}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* 장소 */}
          <div className="form-row" style={{ marginTop: 8 }}>
            <label>장소</label>
            <PlaceSearchInput
              value={form.destination}
              onChange={val => setForm(f => ({ ...f, destination: val }))}
              placeholder="장소명"
              autoFocus
              onOpenChange={open => isSearchOpen.current = open}
              onSelectResult={r => setForm(f => ({
                ...f,
                destination: r.title,
                address: r.roadAddress || r.address || '',
                lat: r.lat,
                lng: r.lng,
              }))}
            />
          </div>

          {/* 주소 */}
          <div className="form-row">
            <label>주소</label>
            <PlaceSearchInput
              value={form.address}
              onChange={val => setForm(f => ({ ...f, address: val }))}
              placeholder="주소"
              onOpenChange={open => isSearchOpen.current = open}
              onSelectResult={r => { const addr = r.roadAddress || r.address || ''; setForm(f => ({ ...f, destination: addr, address: addr, lat: r.lat, lng: r.lng })) }}
              hasPin={!!(form.lat && form.lng)}
              onClearPin={() => setForm(f => ({ ...f, lat: null, lng: null }))}
              addressMode
            />
          </div>

          {/* 메모 */}
          <div className="form-row">
            <label>메모</label>
            <textarea
              value={form.memo}
              placeholder="메모를 입력하세요"
              rows={2}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              style={{ userSelect: 'text' }}
            />
          </div>

          {/* 경비 */}
          <div className="form-row">
            <label>경비</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.cost}
              placeholder="숫자만 입력 (예: 50000)"
              onChange={e => setForm(f => ({ ...f, cost: e.target.value.replace(/\D/g, '') }))}
              style={{ userSelect: 'text' }}
            />
          </div>

          <div className="form-actions">
            <button className="btn btn-primary btn-sm" onClick={handleSave}>저장</button>
            <button className="btn btn-secondary btn-sm" onClick={handleCancel}>취소</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={itemRef}
      className={`itinerary-item${isActive ? ' itinerary-item--active' : ''}${isCurrent ? ' itinerary-item--current' : ''}`}
      onClick={() => onClick(item.id)}
      onDoubleClick={enterEdit}
    >
      <div className="item-header">
        {isDraggable && (
          <div className="item-drag-handle">
            <IconGrip size={14} />
          </div>
        )}
        <div className="item-marker">
          {markerLabel}
          {item.category && (
            <span className="item-category-badge">{categoryEmoji[item.category]}</span>
          )}
        </div>
        <div className="item-info">
          {(item.date || item.time || isCurrent) && (
            <div className="item-datetime">
              {isCurrent && <span className="badge-now">현재</span>}
              {item.date && <span className="item-date">{item.date}</span>}
              {item.date && item.time && <span> · </span>}
              {item.time && <span className="item-time">{item.time}</span>}
            </div>
          )}
          <div className="item-destination">
            {item.destination || <span className="item-placeholder">장소 미지정</span>}
          </div>
          {item.address && <div className="item-address">{item.address}</div>}
          {item.memo && <div className="item-memo">{item.memo}</div>}
          {item.cost && <div className="item-cost">{formatCostDisplay(item.cost)}</div>}
        </div>
        <div className="item-action-btns">
          <button
            className="item-icon-btn item-icon-btn--naver"
            onClick={(e) => {
              e.stopPropagation();
              let query = "";
              if (item.destination && item.address && item.destination !== item.address) {
                query = `${item.destination} ${item.address}`;
              } else {
                query = item.destination || item.address || `${item.lat},${item.lng}`;
              }
              if (query) {
                window.open(`https://map.naver.com/v5/search/${encodeURIComponent(query)}`, '_blank');
              }
            }}
            title="네이버 지도에서 보기"
          >
            <IconNaver size={14} />
          </button>
          {!isLocked && (
            <>
              <button className="item-icon-btn" onClick={enterEdit} title="편집">
                <IconEdit size={14} />
              </button>
              <button className="item-icon-btn item-icon-btn--delete"
                onClick={e => { e.stopPropagation(); onDelete(item.id) }} title="삭제">
                <IconTrash size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
