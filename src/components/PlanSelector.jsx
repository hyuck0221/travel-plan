import { useState, useEffect, useRef } from 'react'
import { IconChevronDown, IconPlus, IconClose, IconCheck } from './Icons'

function formatDate(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export default function PlanSelector({ plans, activeId, onSwitch, onCreate, onDelete }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)
  const active = plans.find(p => p.id === activeId)

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="plan-selector" ref={wrapperRef}>
      <button className="plan-selector-btn" onClick={() => setOpen(v => !v)}>
        <span className="plan-selector-label">{active?.title || '제목 없는 일정'}</span>
        <IconChevronDown size={13} className={`plan-selector-arrow${open ? ' plan-selector-arrow--open' : ''}`} />
      </button>

      {open && (
        <div className="plan-dropdown">
          <div className="plan-dropdown-list">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`plan-item${plan.id === activeId ? ' plan-item--active' : ''}`}
              >
                <button
                  className="plan-item-body"
                  onClick={() => { onSwitch(plan.id); setOpen(false) }}
                >
                  <span className="plan-item-check">
                    {plan.id === activeId && <IconCheck size={12} />}
                  </span>
                  <span className="plan-item-info">
                    <span className="plan-item-title">{plan.title || '제목 없는 일정'}</span>
                    <span className="plan-item-meta">{formatDate(plan.updatedAt)}</span>
                  </span>
                </button>
                <button
                  className="plan-item-delete"
                  onClick={(e) => { e.stopPropagation(); onDelete(plan.id) }}
                  title="삭제"
                >
                  <IconClose size={12} />
                </button>
              </div>
            ))}
          </div>
          <button className="plan-create-btn" onClick={() => { onCreate(); setOpen(false) }}>
            <IconPlus size={13} /> 새 일정 만들기
          </button>
        </div>
      )}
    </div>
  )
}
