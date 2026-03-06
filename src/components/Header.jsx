import { useState } from 'react'
import QRModal from './QRModal'
import PlanSelector from './PlanSelector'
import { IconPlane, IconUndo, IconRedo, IconLink, IconQR, IconShare, IconLoader } from './Icons'

// In-memory cache for the current session
const shortenMemCache = new Map()

// sessionStorage cache — persists across refreshes within the same tab
function getShortenCache(url) {
  if (shortenMemCache.has(url)) return shortenMemCache.get(url)
  try {
    const stored = JSON.parse(sessionStorage.getItem('shorten-cache') || '{}')
    if (stored[url]) { shortenMemCache.set(url, stored[url]); return stored[url] }
  } catch {}
  return null
}

function setShortenCache(url, shortUrl) {
  shortenMemCache.set(url, shortUrl)
  try {
    const stored = JSON.parse(sessionStorage.getItem('shorten-cache') || '{}')
    // Keep at most 20 entries to avoid unbounded growth
    const keys = Object.keys(stored)
    if (keys.length >= 20) delete stored[keys[0]]
    stored[url] = shortUrl
    sessionStorage.setItem('shorten-cache', JSON.stringify(stored))
  } catch {}
}

async function shortenUrl(url) {
  const cached = getShortenCache(url)
  if (cached) return cached
  const res = await fetch('/api/shorten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error()
  const data = await res.json()
  const shortUrl = data.shortUrl || url
  if (shortUrl !== url) setShortenCache(url, shortUrl)
  return shortUrl
}

export default function Header({
  canUndo, canRedo, onUndo, onRedo,
  plans, activeId, onCreatePlan, onDeletePlan, onSwitchPlan,
}) {
  const [qrOpen, setQrOpen] = useState(false)
  const [qrImage, setQrImage] = useState(null)
  const [loading, setLoading] = useState('')

  const handleCopyLink = async () => {
    setLoading('shorten')
    try {
      const short = await shortenUrl(window.location.href)
      await navigator.clipboard.writeText(short)
      alert('단축 링크가 클립보드에 복사되었습니다!')
    } catch {
      try { await navigator.clipboard.writeText(window.location.href); alert('링크가 복사되었습니다.') }
      catch { alert('복사에 실패했습니다.') }
    } finally { setLoading('') }
  }

  const handleQR = async () => {
    setLoading('qr')
    try {
      const res = await fetch('/api/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: window.location.href }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setQrImage(data.image)
      setQrOpen(true)
    } catch { alert('QR 코드 생성에 실패했습니다.') }
    finally { setLoading('') }
  }

  const handleShare = async () => {
    let shareUrl = window.location.href
    try { shareUrl = await shortenUrl(shareUrl) } catch {}

    if (navigator.share) {
      try { await navigator.share({ title: '여행 일정', url: shareUrl }) } catch {}
    } else {
      try { await navigator.clipboard.writeText(shareUrl); alert('링크가 복사되었습니다.') }
      catch { alert('공유에 실패했습니다.') }
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <div className="header-title">
            <IconPlane className="header-icon" />
            <h1>여행 일정</h1>
          </div>
          <div className="header-history">
            <button className="history-btn" onClick={onUndo} disabled={!canUndo} title="실행 취소 (Ctrl+Z)">
              <IconUndo />
            </button>
            <button className="history-btn" onClick={onRedo} disabled={!canRedo} title="다시 실행 (Ctrl+Shift+Z)">
              <IconRedo />
            </button>
          </div>
        </div>

        <PlanSelector
          plans={plans} activeId={activeId}
          onSwitch={onSwitchPlan} onCreate={onCreatePlan} onDelete={onDeletePlan}
        />

        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleCopyLink} disabled={!!loading} title="단축 링크 복사">
            {loading === 'shorten' ? <IconLoader /> : <IconLink />}
            링크 단축하여 복사
          </button>
          <button className="btn btn-secondary" onClick={handleQR} disabled={!!loading} title="QR 코드 생성">
            {loading === 'qr' ? <IconLoader /> : <IconQR />}
            QR
          </button>
          <button className="btn btn-primary" onClick={handleShare} title="공유하기">
            <IconShare />
            공유
          </button>
        </div>
      </header>
      {qrOpen && <QRModal image={qrImage} onClose={() => setQrOpen(false)} />}
    </>
  )
}
