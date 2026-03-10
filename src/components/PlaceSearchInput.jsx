import { useState, useRef, useEffect } from 'react'

export default function PlaceSearchInput({ value, onChange, onSelectResult, placeholder, autoFocus, onOpenChange, hasPin, onClearPin, addressMode }) {
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const timeoutRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    onOpenChange?.(open && results.length > 0)
  }, [open, results, onOpenChange])

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setSelectedIndex(-1)
  }, [results])

  const search = async (q) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    if (addressMode) {
      const svc = window.naver?.maps?.Service
      if (!svc?.geocode) return
      svc.geocode({ query: q }, (status, response) => {
        if (status !== window.naver.maps.Service.Status.OK) { setResults([]); setOpen(false); return }
        const items = (response.v2?.addresses || []).map(addr => ({
          title: addr.roadAddress || addr.jibunAddress,
          roadAddress: addr.roadAddress,
          address: addr.jibunAddress,
          lat: parseFloat(addr.y),
          lng: parseFloat(addr.x),
        }))
        setResults(items)
        setOpen(items.length > 0)
      })
      return
    }
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (res.ok) {
        const data = await res.json()
        const items = data.items || []
        setResults(items)
        setOpen(items.length > 0)
      }
    } catch { /* silent */ }
  }

  const handleChange = (e) => {
    onChange(e.target.value)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => search(e.target.value), 400)
  }

  const handleKeyDown = (e) => {
    if (!open || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1 >= results.length ? 0 : prev + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1))
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        e.preventDefault()
        e.stopPropagation()
        handleSelect(results[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
  }

  const handleSelect = (item) => {
    onSelectResult(item)
    setResults([])
    setOpen(false)
  }

  return (
    <div className="place-search-input" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{ userSelect: 'text', paddingRight: hasPin ? 32 : undefined }}
      />
      {hasPin && onClearPin && (
        <button
          type="button"
          className="place-search-clear-pin"
          onClick={e => { e.stopPropagation(); onClearPin() }}
          title="핀 삭제"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* 핀 윤곽 */}
            <path d="M8 2C5.8 2 4 3.8 4 6c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" stroke="#e53e3e" strokeWidth="1.5" fill="none"/>
            {/* 핀 중심 원 */}
            <circle cx="8" cy="6" r="1.4" stroke="#e53e3e" strokeWidth="1.3" fill="none"/>
            {/* 사선 (우상단→좌하단) */}
            <line x1="13" y1="1" x2="3" y2="13" stroke="#e53e3e" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      )}
      {open && results.length > 0 && (
        <div className="place-results">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              className={`place-result-item ${i === selectedIndex ? 'place-result-item--selected' : ''}`}
              onClick={() => handleSelect(r)}
            >
              <span className="place-result-name">{r.title}</span>
              {(r.roadAddress || r.address) && (
                <span className="place-result-addr">{r.roadAddress || r.address}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
