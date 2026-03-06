import { IconChevronLeft, IconChevronRight } from './Icons'

export default function TimePicker({ value, onChange }) {
  // value: "HH:mm" | ""
  const hour = value ? value.split(':')[0] : ''
  const minute = value ? value.split(':')[1] : ''

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

  const handleHourInput = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    const n = parseInt(v)
    if (v === '') { emit('', minute); return }
    if (!isNaN(n) && n >= 0 && n <= 23) emit(String(n).padStart(2, '0'), minute)
  }

  const handleMinuteInput = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    const n = parseInt(v)
    if (v === '') { emit(hour, ''); return }
    if (!isNaN(n) && n >= 0 && n <= 59) emit(hour, String(n).padStart(2, '0'))
  }

  return (
    <div className="time-picker">
      <div className="tp-unit">
        <button type="button" className="tp-arrow" onClick={() => changeHour(1)}>
          <IconChevronRight size={13} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <input
          className="tp-input"
          value={hour}
          onChange={handleHourInput}
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
          className="tp-input"
          value={minute}
          onChange={handleMinuteInput}
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
