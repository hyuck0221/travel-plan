import { useEffect, useRef, useState } from 'react'
import { IconLogo } from './Icons'
import { TermsOfService, PrivacyPolicy } from './LegalModals'
import './LandingPage.css'

/* ── Inline SVG icons for landing page ── */
const IcMapIntegration = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    <line x1="8" y1="2" x2="8" y2="18"/>
    <line x1="16" y1="6" x2="16" y2="22"/>
  </svg>
)

const IcLink = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)

const IcQR = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
    <rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/>
    <rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/>
  </svg>
)

const IcLayers = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
)

const IcLocation = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
    <path d="M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>
  </svg>
)

const IcSparkle = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.8 5.4L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.6L12 3z"/>
    <path d="M5 3l.9 2.1L8 6l-2.1.9L5 9l-.9-2.1L2 6l2.1-.9L5 3z"/>
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/>
  </svg>
)

const IcFree = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)

const IcNoLogin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
  </svg>
)

const IcPin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
)

const IcArrow = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

/* ── Data ── */
const FEATURES = [
  { Icon: IcMapIntegration, title: '지도와 함께 계획', desc: '네이버 지도에서 장소를 검색하고 클릭만으로 일정에 추가. 경로가 지도 위에 선으로 연결됩니다.' },
  { Icon: IcLink,           title: 'URL 하나로 공유',  desc: '회원가입 없이 URL 하나로 전체 일정을 공유. 링크를 열면 바로 동일한 계획을 볼 수 있습니다.' },
  { Icon: IcQR,             title: 'QR코드 생성',      desc: '여행 일정을 QR코드로 저장해 오프라인에서도 쉽게 공유하고 접근하세요.' },
  { Icon: IcLayers,         title: '여러 여행 관리',   desc: '제주도, 부산, 강원도… 여러 국내 여행 계획을 한 앱에서 스위칭하며 관리하세요.' },
  { Icon: IcLocation,       title: '실시간 현위치',    desc: '여행 중에는 현재 위치가 지도에 표시되고, 지금 진행 중인 일정이 자동으로 하이라이트됩니다.' },
  { Icon: IcSparkle,        title: 'AI 에이전트 연동', desc: 'MCP 프로토콜을 통해 Claude 등 AI 에이전트가 직접 여행 일정을 생성해줍니다.' },
]

const STEPS = [
  { num: '01', title: '장소 검색',      desc: '검색창에 가고 싶은 곳을 입력하거나 지도를 클릭해 장소를 추가하세요.' },
  { num: '02', title: '날짜 & 시간 설정', desc: '각 장소에 방문 날짜와 시간을 지정하면 자동으로 일정순으로 정렬됩니다.' },
  { num: '03', title: '링크로 공유',    desc: '상단의 공유 버튼을 누르면 전체 일정이 담긴 단축 URL이 바로 복사됩니다.' },
]

/* ── Sub-components ── */
function FloatingPin({ style, delay }) {
  return (
    <div className="lp-floating-pin" style={{ ...style, animationDelay: delay }}>
      <svg viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="currentColor"/>
        <circle cx="12" cy="12" r="4" fill="white"/>
      </svg>
    </div>
  )
}

function FeatureCard({ Icon, title, desc, index }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={`lp-feature-card${visible ? ' lp-feature-card--visible' : ''}`}
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      <div className="lp-feature-icon"><Icon /></div>
      <h3 className="lp-feature-title">{title}</h3>
      <p className="lp-feature-desc">{desc}</p>
    </div>
  )
}

function StepItem({ num, title, desc, index }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.2 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={`lp-step${visible ? ' lp-step--visible' : ''}`}
      style={{ transitionDelay: `${index * 120}ms` }}
    >
      <div className="lp-step-num">{num}</div>
      <div className="lp-step-content">
        <h3 className="lp-step-title">{title}</h3>
        <p className="lp-step-desc">{desc}</p>
      </div>
    </div>
  )
}

/* ── Main ── */
export default function LandingPage({ onEnter }) {
  const [heroVisible, setHeroVisible] = useState(false)
  const [typed, setTyped] = useState('')
  const [showTerms, setShowTerms] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const fullText = '여행 일정을 지도 위에'

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!heroVisible) return
    let i = 0
    const interval = setInterval(() => {
      setTyped(fullText.slice(0, i + 1))
      i++
      if (i >= fullText.length) clearInterval(interval)
    }, 80)
    return () => clearInterval(interval)
  }, [heroVisible])

  return (
    <div className="lp-root">

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-bg">
          <div className="lp-hero-gradient" />
          <div className="lp-grid-pattern" />
        </div>

        <FloatingPin style={{ top: '18%', left: '12%', color: '#60a5fa' }} delay="0s" />
        <FloatingPin style={{ top: '28%', right: '15%', color: '#34d399' }} delay="0.6s" />
        <FloatingPin style={{ bottom: '28%', left: '20%', color: '#f472b6' }} delay="1.1s" />
        <FloatingPin style={{ bottom: '22%', right: '22%', color: '#fbbf24' }} delay="0.3s" />
        <FloatingPin style={{ top: '52%', left: '6%', color: '#a78bfa' }} delay="0.8s" />
        <FloatingPin style={{ top: '42%', right: '8%', color: '#fb923c' }} delay="1.4s" />

        <div className={`lp-hero-content${heroVisible ? ' lp-hero-content--visible' : ''}`}>
          <div className="lp-badge">
            <IconLogo size={20} />
            무료 여행 플래너
          </div>
          <h1 className="lp-hero-title">
            <span className="lp-typed">{typed}<span className="lp-cursor">|</span></span>
            <br />
            <span className="lp-hero-highlight">그려보세요</span>
          </h1>
          <p className="lp-hero-sub">
            지도에서 장소를 검색하고, 날짜별로 일정을 정리하고<br />
            URL 하나로 팀원과 바로 공유하세요. 로그인 불필요.
          </p>
          <div className="lp-hero-actions">
            <button className="lp-btn-primary" onClick={onEnter}>
              지금 시작하기
              <IcArrow />
            </button>
          </div>
          <div className="lp-hero-chips">
            <span className="lp-chip"><IcFree /> 완전 무료</span>
            <span className="lp-chip"><IcNoLogin /> 회원가입 없음</span>
            <span className="lp-chip"><IcPin /> 네이버 지도</span>
          </div>
        </div>

        {/* Desktop: browser mockup */}
        <div className={`lp-mockup lp-mockup--desktop${heroVisible ? ' lp-mockup--visible' : ''}`}>
          <div className="lp-mockup-bar"><span /><span /><span /></div>
          <div className="lp-mockup-body">
            <div className="lp-mockup-sidebar">
              <div className="lp-mock-title-row" />
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="lp-mock-item">
                  <div className="lp-mock-badge">{i}</div>
                  <div className="lp-mock-lines">
                    <div className="lp-mock-line lp-mock-line--place" />
                    <div className="lp-mock-line lp-mock-line--addr" />
                  </div>
                </div>
              ))}
            </div>
            <div className="lp-mockup-map">
              <div className="lp-map-bg" />
              {[
                { top: '30%', left: '35%', label: '1' },
                { top: '50%', left: '55%', label: '2' },
                { top: '65%', left: '40%', label: '3' },
                { top: '45%', left: '25%', label: '4' },
              ].map(m => (
                <div key={m.label} className="lp-map-marker" style={{ top: m.top, left: m.left }}>{m.label}</div>
              ))}
              <svg className="lp-map-line" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
                <polyline points="70,48 110,80 80,104 50,72" fill="none" stroke="#4F9CF9" strokeWidth="2" strokeDasharray="4 3" opacity="0.7"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Mobile: phone mockup */}
        <div className={`lp-phone lp-mockup--mobile${heroVisible ? ' lp-phone--visible' : ''}`}>
          <div className="lp-phone-frame">
            <div className="lp-phone-notch" />
            {/* App header */}
            <div className="lp-phone-header">
              <IconLogo size={18} />
              <div className="lp-phone-header-title" />
              <div className="lp-phone-header-icons">
                <div className="lp-phone-icon-dot" />
                <div className="lp-phone-icon-dot" />
              </div>
            </div>
            {/* Item list */}
            <div className="lp-phone-list">
              {[
                { label: '1', color: '#4F9CF9' },
                { label: '2', color: '#34d399' },
                { label: '3', color: '#f472b6' },
                { label: '4', color: '#fbbf24' },
              ].map(({ label, color }) => (
                <div key={label} className="lp-phone-item">
                  <div className="lp-phone-item-badge" style={{ background: color }}>{label}</div>
                  <div className="lp-phone-item-lines">
                    <div className="lp-phone-item-line lp-phone-item-line--name" />
                    <div className="lp-phone-item-line lp-phone-item-line--sub" />
                  </div>
                  <div className="lp-phone-item-time" />
                </div>
              ))}
            </div>
            {/* Map area */}
            <div className="lp-phone-map">
              <div className="lp-map-bg" />
              {[
                { top: '28%', left: '30%', label: '1' },
                { top: '48%', left: '58%', label: '2' },
                { top: '66%', left: '42%', label: '3' },
                { top: '38%', left: '68%', label: '4' },
              ].map(m => (
                <div key={m.label} className="lp-map-marker lp-map-marker--sm" style={{ top: m.top, left: m.left }}>{m.label}</div>
              ))}
              <svg className="lp-map-line" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
                <polyline points="60,34 116,58 84,79 136,46" fill="none" stroke="#4F9CF9" strokeWidth="2" strokeDasharray="4 3" opacity="0.7"/>
              </svg>
            </div>
            {/* Bottom nav bar */}
            <div className="lp-phone-navbar">
              <div className="lp-phone-nav-item lp-phone-nav-item--active">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span>일정</span>
              </div>
              <div className="lp-phone-nav-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
                </svg>
                <span>지도</span>
              </div>
            </div>
            <div className="lp-phone-home-bar" />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lp-features">
        <div className="lp-section-label">기능</div>
        <h2 className="lp-section-title">필요한 건 다 있어요</h2>
        <p className="lp-section-sub">복잡한 설치나 가입 없이, 지금 바로 여행 계획을 시작하세요.</p>
        <div className="lp-features-grid">
          {FEATURES.map((f, i) => <FeatureCard key={f.title} {...f} index={i} />)}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="lp-steps">
        <div className="lp-steps-inner">
          <div className="lp-steps-text">
            <div className="lp-section-label lp-section-label--light">사용 방법</div>
            <h2 className="lp-section-title lp-section-title--light">3단계로 끝</h2>
            <p className="lp-section-sub lp-section-sub--light">
              복잡한 사용법 없이<br />누구나 바로 시작할 수 있어요.
            </p>
          </div>
          <div className="lp-steps-list">
            {STEPS.map((s, i) => <StepItem key={s.num} {...s} index={i} />)}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div className="lp-cta-inner">
          <h2 className="lp-cta-title">다음 여행,<br />지금 계획해보세요</h2>
          <p className="lp-cta-sub">로그인도, 설치도 필요 없습니다.</p>
          <button className="lp-btn-primary lp-btn-primary--large" onClick={onEnter}>
            무료로 시작하기
            <IcArrow />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <span>travel.hspace.site</span>
        <span className="lp-footer-dot">·</span>
        <span>네이버 지도 기반</span>
        <span className="lp-footer-dot">·</span>
        <button className="lp-footer-btn" onClick={() => setShowTerms(true)}>서비스 이용약관</button>
        <span className="lp-footer-dot">·</span>
        <button className="lp-footer-btn" onClick={() => setShowPrivacy(true)}>개인정보처리방침</button>
      </footer>

      <TermsOfService isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicy isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />

    </div>
  )
}
