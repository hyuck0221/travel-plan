import { useState, useRef, useEffect } from 'react'

export default function PlaceSearchInput({ value, onChange, onSelectResult, placeholder, autoFocus, onOpenChange }) {
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
        style={{ userSelect: 'text' }}
      />
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
