import { useState, useRef, useEffect } from 'react'

export default function PlaceSearchInput({ value, onChange, onSelectResult, placeholder, autoFocus }) {
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const timeoutRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{ userSelect: 'text' }}
      />
      {open && results.length > 0 && (
        <div className="place-results">
          {results.map((r, i) => (
            <button key={i} type="button" className="place-result-item" onClick={() => handleSelect(r)}>
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
