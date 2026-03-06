import { useState } from 'react'
import { IconChevronLeft, IconChevronRight } from './Icons'

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const DOWS = ['일','월','화','수','목','금','토']

export default function DatePicker({ value, onChange }) {
  const today = new Date()
  const selected = value ? new Date(value + 'T00:00:00') : null

  const [view, setView] = useState(() => {
    if (selected) return { year: selected.getFullYear(), month: selected.getMonth() }
    return { year: today.getFullYear(), month: today.getMonth() }
  })
  const [mode, setMode] = useState('calendar') // 'calendar' | 'yearmonth'
  const [ymYear, setYmYear] = useState(() => selected?.getFullYear() ?? today.getFullYear())

  const prevMonth = () => setView(v => { const d = new Date(v.year, v.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  const nextMonth = () => setView(v => { const d = new Date(v.year, v.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })

  const firstDow = new Date(view.year, view.month, 1).getDay()
  const lastDate = new Date(view.year, view.month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= lastDate; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const select = (day) => {
    if (!day) return
    const yyyy = view.year
    const mm = String(view.month + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    onChange(`${yyyy}-${mm}-${dd}`)
  }

  const isSelected = (day) =>
    selected && selected.getFullYear() === view.year &&
    selected.getMonth() === view.month && selected.getDate() === day

  const isToday = (day) =>
    today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day

  const selectYearMonth = (month) => {
    setView({ year: ymYear, month })
    setMode('calendar')
  }

  if (mode === 'yearmonth') {
    return (
      <div className="date-picker">
        <div className="dp-nav">
          <button type="button" className="dp-nav-btn" onClick={() => setYmYear(y => y - 1)}>
            <IconChevronLeft size={14} />
          </button>
          <span className="dp-nav-title">{ymYear}년</span>
          <button type="button" className="dp-nav-btn" onClick={() => setYmYear(y => y + 1)}>
            <IconChevronRight size={14} />
          </button>
        </div>
        <div className="dp-month-grid">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              type="button"
              className={[
                'dp-month-cell',
                view.year === ymYear && view.month === i ? 'dp-month-cell--selected' : '',
                today.getFullYear() === ymYear && today.getMonth() === i ? 'dp-month-cell--today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => selectYearMonth(i)}
            >
              {m}
            </button>
          ))}
        </div>
        <button type="button" className="dp-clear" onClick={() => setMode('calendar')}>
          취소
        </button>
      </div>
    )
  }

  return (
    <div className="date-picker">
      <div className="dp-nav">
        <button type="button" className="dp-nav-btn" onClick={prevMonth}>
          <IconChevronLeft size={14} />
        </button>
        <button
          type="button"
          className="dp-nav-title dp-nav-title--btn"
          onClick={() => { setYmYear(view.year); setMode('yearmonth') }}
        >
          {view.year}년 {MONTHS[view.month]}
        </button>
        <button type="button" className="dp-nav-btn" onClick={nextMonth}>
          <IconChevronRight size={14} />
        </button>
      </div>

      <div className="dp-dow-row">
        {DOWS.map((d, i) => (
          <span key={d} className={`dp-dow${i === 0 ? ' dp-dow--sun' : i === 6 ? ' dp-dow--sat' : ''}`}>{d}</span>
        ))}
      </div>

      <div className="dp-grid">
        {cells.map((day, i) => (
          <button
            key={i}
            type="button"
            disabled={!day}
            onClick={() => select(day)}
            className={[
              'dp-cell',
              !day ? 'dp-cell--empty' : '',
              isSelected(day) ? 'dp-cell--selected' : '',
              isToday(day) && !isSelected(day) ? 'dp-cell--today' : '',
              i % 7 === 0 ? 'dp-cell--sun' : '',
              i % 7 === 6 ? 'dp-cell--sat' : '',
            ].filter(Boolean).join(' ')}
          >
            {day ?? ''}
          </button>
        ))}
      </div>

      {value && (
        <button type="button" className="dp-clear" onClick={() => onChange('')}>
          날짜 지우기
        </button>
      )}
    </div>
  )
}
