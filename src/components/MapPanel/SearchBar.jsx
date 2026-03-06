import { useState, useRef, useEffect } from 'react'
import { IconSearch, IconLoader } from '../Icons'

export default function SearchBar({ onSelectPlace }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
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

    setLoading(true)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.items?.length > 0) {
          setResults(data.items); setOpen(true); return
        }
      }
      // fallback: geocoder
      if (window.naver?.maps?.Service) {
        window.naver.maps.Service.geocode({ query: q }, (status, response) => {
          const addresses = response?.v2?.addresses || []
          setResults(addresses.map(a => ({
            title: a.roadAddress || a.jibunAddress || q,
            category: '',
            address: a.jibunAddress || '',
            roadAddress: a.roadAddress || '',
            lat: parseFloat(a.y),
            lng: parseFloat(a.x),
          })))
          setOpen(true)
        })
      } else {
        setResults([]); setOpen(true)
      }
    } catch {
      setResults([]); setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => search(q), 400)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { clearTimeout(timeoutRef.current); search(query) }
  }

  const handleSelect = (place) => {
    onSelectPlace({ lat: place.lat, lng: place.lng, destination: place.title, address: place.roadAddress || place.address || '' })
    setQuery(''); setResults([]); setOpen(false)
  }

  return (
    <div className="search-bar-wrapper" ref={wrapperRef}>
      <div className="search-bar">
        {loading ? <IconLoader size={16} className="search-icon icon-spin" /> : <IconSearch size={16} className="search-icon" />}
        <input
          type="text"
          className="search-input"
          placeholder="장소명 또는 주소 검색..."
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && (
        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-no-results">검색 결과가 없습니다.</div>
          ) : (
            results.map((place, i) => (
              <button key={i} className="search-result-item" onClick={() => handleSelect(place)}>
                <div className="result-name">
                  {place.title}
                  {place.category && <span className="result-category">{place.category}</span>}
                </div>
                {(place.roadAddress || place.address) && (
                  <div className="result-address">{place.roadAddress || place.address}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
