import { useState, useRef } from 'react'
import { IconChevronRight } from './Icons'

export default function TimePicker({ value, onChange }) {
  // value: "HH:mm" | ""
  const hour = value ? value.split(':')[0] : ''
  const minute = value ? value.split(':')[1] : ''

  const [isHourEditing, setIsHourEditing] = useState(false)
  const [hourDisplay, setHourDisplay] = useState('')
  const [isMinuteEditing, setIsMinuteEditing] = useState(false)
  const [minuteDisplay, setMinuteDisplay] = useState('')
  const minuteRef = useRef(null)

  const displayHour = isHourEditing ? hourDisplay : hour
  const displayMinute = isMinuteEditing ? minuteDisplay : minute

  const emit = (h, m) => {
    if (h === '' && m === '') { onChange(''); return }
    onChange(`${h || '00'}:${m || '00'}`)
  }

  const changeHour = (delta) => {
    const h = hour === '' ? (delta > 0 ? 0 : 23) : (parseInt(hour) + delta + 24) % 24
    emit(String(h).padStart(2, '0'), minute)
  }

  const changeMinute = (delta) => {
    const m = minute === '' ? (delta > 0 ? 0 : 55) : Math.round(parseInt(minute) / 5) * 5
    const next = ((m + delta * 5) + 60) % 60
    emit(hour, String(next).padStart(2, '0'))
  }

  // ── Hour ──────────────────────────────────────────────
  const handleHourFocus = (e) => {
    setIsHourEditing(true)
    setHourDisplay(hour)
    e.target.select()
  }

  const handleHourChange = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    setHourDisplay(v)
    // 2자리 완성 시 분 필드로 자동 이동
    if (v.length === 2 && parseInt(v) <= 23) {
      minuteRef.current?.focus()
      minuteRef.current?.select()
    }
  }

  const handleHourBlur = (e) => {
    setIsHourEditing(false)
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    if (v === '') { emit('', minute); return }
    const n = parseInt(v)
    if (!isNaN(n) && n >= 0 && n <= 23) emit(String(n).padStart(2, '0'), minute)
    // 유효하지 않으면 그냥 이전값 유지 (emit 안 함)
  }

  const handleHourKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur()
    if (e.key === 'ArrowUp') { e.preventDefault(); changeHour(1) }
    if (e.key === 'ArrowDown') { e.preventDefault(); changeHour(-1) }
  }

  // ── Minute ────────────────────────────────────────────
  const handleMinuteFocus = (e) => {
    setIsMinuteEditing(true)
    setMinuteDisplay(minute)
    e.target.select()
  }

  const handleMinuteChange = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    setMinuteDisplay(v)
  }

  const handleMinuteBlur = (e) => {
    setIsMinuteEditing(false)
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    if (v === '') { emit(hour, ''); return }
    const n = parseInt(v)
    if (!isNaN(n) && n >= 0 && n <= 59) emit(hour, String(n).padStart(2, '0'))
  }

  const handleMinuteKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur()
    if (e.key === 'ArrowUp') { e.preventDefault(); changeMinute(1) }
    if (e.key === 'ArrowDown') { e.preventDefault(); changeMinute(-1) }
  }

  return (
    <div className="time-picker">
      <div className="tp-unit">
        <button type="button" className="tp-arrow" onClick={() => changeHour(1)}>
          <IconChevronRight size={13} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <input
          className="tp-input"
          value={displayHour}
          onFocus={handleHourFocus}
          onChange={handleHourChange}
          onBlur={handleHourBlur}
          onKeyDown={handleHourKeyDown}
          placeholder="--"
          maxLength={2}
        />
        <button type="button" className="tp-arrow" onClick={() => changeHour(-1)}>
          <IconChevronRight size={13} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <span className="tp-label">시</span>
      </div>

      <span className="tp-colon">:</span>

      <div className="tp-unit">
        <button type="button" className="tp-arrow" onClick={() => changeMinute(1)}>
          <IconChevronRight size={13} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <input
          ref={minuteRef}
          className="tp-input"
          value={displayMinute}
          onFocus={handleMinuteFocus}
          onChange={handleMinuteChange}
          onBlur={handleMinuteBlur}
          onKeyDown={handleMinuteKeyDown}
          placeholder="--"
          maxLength={2}
        />
        <button type="button" className="tp-arrow" onClick={() => changeMinute(-1)}>
          <IconChevronRight size={13} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <span className="tp-label">분</span>
      </div>

      {value && (
        <button type="button" className="tp-clear" onClick={() => onChange('')}>
          지우기
        </button>
      )}
    </div>
  )
}
