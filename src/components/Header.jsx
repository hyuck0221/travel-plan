import { useEffect, useRef, useState } from 'react'
import QRModal from './QRModal'
import PlanSelector from './PlanSelector'
import { IconLogo, IconLink, IconQR, IconShare, IconLoader, IconLock, IconUnlock, IconChevronDown, IconSparkle } from './Icons'

// In-memory cache for the current session
const shortenMemCache = new Map()

// sessionStorage cache
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
  plans, activeId, onCreatePlan, onDeletePlan, onSwitchPlan,
  isUrlLimitReached, isLocked, onToggleLock, onToggleAI, onCloseAI, isAiOpen, isAiRunning
}) {
  const [qrOpen, setQrOpen] = useState(false)
  const [qrImage, setQrImage] = useState(null)
  const [loading, setLoading] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [preparedShare, setPreparedShare] = useState({ sourceUrl: '', url: '', status: 'idle', isShortened: false })
  const shareMenuRef = useRef(null)
  const shareTriggerRef = useRef(null)
  const shareGateRef = useRef(null)
  const copyFeedbackTimerRef = useRef(null)

  const currentShareUrl = window.location.href
  const sharePrepared = preparedShare.sourceUrl === currentShareUrl && preparedShare.status === 'ready'
  // URL 용량 초과 시에는 단축 URL을 만들 수 없으므로 기존 원본 링크 동작을 유지한다.
  const shareActionsReady = isUrlLimitReached || sharePrepared
  const preparedShareUrl = sharePrepared ? (preparedShare.url || currentShareUrl) : currentShareUrl

  useEffect(() => {
    if (!shareOpen || shareActionsReady) return undefined
    requestAnimationFrame(() => shareGateRef.current?.focus())
    return undefined
  }, [shareOpen, shareActionsReady])

  useEffect(() => {
    if (!shareOpen) return undefined

    const handlePointerDown = (event) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(event.target)) {
        setShareOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShareOpen(false)
        requestAnimationFrame(() => shareTriggerRef.current?.focus())
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [shareOpen])

  useEffect(() => () => window.clearTimeout(copyFeedbackTimerRef.current), [])

  const showCopyFeedback = (message) => {
    window.clearTimeout(copyFeedbackTimerRef.current)
    setCopyFeedback(message)
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback('')
      copyFeedbackTimerRef.current = null
    }, 3000)
  }

  const handleCopyLink = async () => {
    if (!shareActionsReady) return
    const shareUrl = preparedShareUrl
    if (isUrlLimitReached) {
      // 65535자 초과 시: 단축 없이 바로 복사
      try {
        await navigator.clipboard.writeText(shareUrl)
        showCopyFeedback('복사완료!')
      } catch { showCopyFeedback('복사 실패') }
      return
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      showCopyFeedback('복사완료!')
    } catch {
      showCopyFeedback('복사 실패')
    }
  }

  const handleQR = async () => {
    if (!shareActionsReady) return
    setShareOpen(false)
    if (isUrlLimitReached) return // 초과 시 비활성화

    setLoading('qr')
    try {
      const res = await fetch('/api/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: preparedShareUrl }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setQrImage(data.image)
      setQrOpen(true)
    } catch { alert('QR 코드 생성에 실패했습니다.') }
    finally { setLoading('') }
  }

  const handleShare = async () => {
    if (!shareActionsReady) return
    setShareOpen(false)
    const shareUrl = preparedShareUrl

    if (navigator.share) {
      try { await navigator.share({ title: 'Travelink 여행 일정', url: shareUrl }) } catch {}
    } else {
      try { await navigator.clipboard.writeText(shareUrl); alert('링크가 복사되었습니다.') }
      catch { alert('공유에 실패했습니다.') }
    }
  }

  const handlePrepareShare = async () => {
    if (loading) return

    const sourceUrl = window.location.href
    setLoading('prepare-share')
    setPreparedShare({ sourceUrl, url: '', status: 'loading', isShortened: false })
    try {
      let shareUrl = sourceUrl
      if (!isUrlLimitReached) {
        try { shareUrl = await shortenUrl(sourceUrl) } catch {}
      }
      setPreparedShare({
        sourceUrl,
        url: shareUrl,
        status: 'ready',
        isShortened: shareUrl !== sourceUrl,
      })
    } finally {
      setLoading('')
    }
  }

  const handleToggleAI = () => {
    // AI 패널과 공유 메뉴가 겹치지 않도록 AI를 열 때 공유 메뉴를 닫는다.
    setShareOpen(false)
    onToggleAI()
  }

  const handleToggleShare = () => {
    if (!shareOpen) onCloseAI?.()
    setShareOpen(v => !v)
  }

  return (
    <>
      <header className="app-header-container">
        {isUrlLimitReached && (
          <div className="limit-warning-bar">
            일정이 너무 많아 링크 단축 기능이 제한됩니다.
          </div>
        )}
        <div className="app-header">
          <div className="header-left">
            <div className="header-title">
              <IconLogo size={28} />
              <h1>Travelink</h1>
            </div>
          </div>

          <PlanSelector
            plans={plans} activeId={activeId}
            onSwitch={onSwitchPlan} onCreate={onCreatePlan} onDelete={onDeletePlan}
          />

          <div className="header-actions">
            <button
              className={'btn ai-trigger' + (isAiRunning ? ' ai-trigger--running' : '')}
              onClick={handleToggleAI}
              title={isAiOpen ? 'Travelink AI 닫기' : '브라우저에서 로컬 AI로 일정 만들기'}
              aria-label={isAiOpen ? 'Travelink AI 닫기' : 'AI로 일정 만들기'}
              aria-expanded={isAiOpen}
              aria-controls="ai-assistant-panel"
            >
              <IconSparkle size={16} />
              <span className="ai-trigger-label">AI</span>
            </button>
            <button
              className={`btn${isLocked ? ' btn-lock--locked' : ' btn-secondary'}`}
              onClick={onToggleLock}
              title={isLocked ? '잠금 해제' : '편집 잠금'}
              aria-label={isLocked ? '잠금 해제' : '편집 잠금'}
            >
              {isLocked ? <IconLock /> : <IconUnlock />}
              <span className="btn-lock-label">{isLocked ? '잠금 해제' : '잠금'}</span>
            </button>

            <div className="share-menu-wrap" ref={shareMenuRef}>
              <button
                ref={shareTriggerRef}
                className="btn btn-primary share-trigger"
                onClick={handleToggleShare}
                disabled={!!loading}
                title="공유 옵션 열기"
                aria-label="공유 옵션"
                aria-haspopup="menu"
                aria-expanded={shareOpen}
              >
                {loading ? <IconLoader /> : <IconShare />}
                <span className="share-trigger-label">공유</span>
                <IconChevronDown size={14} className={`share-trigger-arrow${shareOpen ? ' share-trigger-arrow--open' : ''}`} />
              </button>

              {shareOpen && (
                <div className="share-menu" role="menu" aria-label="공유 옵션">
                  <div className={shareActionsReady ? 'share-menu-items' : 'share-menu-items share-menu-items--blurred'}>
                    <button
                      type="button"
                      role="menuitem"
                      className="share-menu-item"
                      onClick={handleCopyLink}
                      disabled={!shareActionsReady || !!loading}
                    >
                      <IconLink size={17} />
                      <span className="share-menu-item-copy">
                        <strong>링크 복사</strong>
                        <small>{isUrlLimitReached ? '전체 링크를 클립보드에 복사' : '짧은 링크를 클립보드에 복사'}</small>
                      </span>
                      {copyFeedback && <span className="share-menu-item-status" role="status" aria-live="polite">{copyFeedback}</span>}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="share-menu-item"
                      onClick={handleQR}
                      disabled={!shareActionsReady || !!loading || isUrlLimitReached}
                      title={isUrlLimitReached ? '용량 초과로 비활성화됨' : 'QR 코드 생성'}
                    >
                      <IconQR size={17} />
                      <span className="share-menu-item-copy">
                        <strong>QR 코드</strong>
                        <small>{isUrlLimitReached ? '링크 용량을 줄인 뒤 사용 가능' : '휴대폰으로 스캔할 QR 생성'}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="share-menu-item"
                      onClick={handleShare}
                      disabled={!shareActionsReady || !!loading}
                    >
                      <IconShare size={17} />
                      <span className="share-menu-item-copy">
                        <strong>공유하기</strong>
                        <small>기기 공유 메뉴 열기</small>
                      </span>
                    </button>
                  </div>

                  {!shareActionsReady && (
                    <div className="share-menu-gate">
                      <button
                        ref={shareGateRef}
                        type="button"
                        className="share-menu-gate-btn"
                        onClick={handlePrepareShare}
                        disabled={loading === 'prepare-share'}
                        aria-label="눌러서 단축링크 생성"
                      >
                        {loading === 'prepare-share' ? <IconLoader size={18} /> : <IconLink size={18} />}
                        <span>{loading === 'prepare-share' ? '단축링크 생성 중…' : '눌러서 단축링크 생성'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      {qrOpen && <QRModal image={qrImage} onClose={() => setQrOpen(false)} />}
    </>
  )
}
