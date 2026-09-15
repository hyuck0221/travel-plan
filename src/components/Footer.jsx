import React, { useState, useEffect } from 'react';
import { TermsOfService, PrivacyPolicy } from './LegalModals';
import { IconGithub, IconStar } from './Icons';

const STARS_CACHE_KEY = 'travelink:github-stars';

function readCachedStars() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(STARS_CACHE_KEY) || 'null');
    return Number.isFinite(cached?.stars) ? cached.stars : null;
  } catch {
    return null;
  }
}

function writeCachedStars(stars) {
  try {
    sessionStorage.setItem(STARS_CACHE_KEY, JSON.stringify({ stars, savedAt: Date.now() }));
  } catch {
    // Storage can be unavailable in private browsing; the live request still works.
  }
}

async function fetchStars(signal) {
  const response = await fetch('/api/github-stars', {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`GitHub Star request failed: ${response.status}`);
  const data = await response.json();
  const stars = Number(data.stars);
  if (!Number.isFinite(stars)) throw new Error('GitHub Star count is invalid');
  return stars;
}

export default function Footer() {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [stars, setStars] = useState(readCachedStars);
  const [starsLoading, setStarsLoading] = useState(() => readCachedStars() === null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const loadStars = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, attempt * 700));
        if (controller.signal.aborted) return;

        try {
          const nextStars = await fetchStars(controller.signal);
          if (!mounted) return;
          setStars(nextStars);
          setStarsLoading(false);
          writeCachedStars(nextStars);
          return;
        } catch {
          // Retry transient deployment/network errors. A cached value remains visible.
        }
      }
      if (mounted) setStarsLoading(false);
    };

    loadStars();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-links">
          <button 
            onClick={() => setShowTerms(true)}
            className="footer-link-btn"
          >
            서비스 이용약관
          </button>
          <span className="footer-divider">|</span>
          <button 
            onClick={() => setShowPrivacy(true)}
            className="footer-link-btn"
          >
            개인정보처리방침
          </button>
          <span className="footer-divider">|</span>
          <a 
            href="https://github.com/hyuck0221/travel-plan" 
            target="_blank" 
            rel="noopener noreferrer"
            className="footer-link-btn footer-github-link"
            title="GitHub Repository"
            aria-label={`GitHub에서 Travelink 보기 · Star ${stars === null ? '확인 중' : stars}`}
          >
            <IconGithub size={16} />
            <span className={`footer-github-stars${starsLoading ? ' footer-github-stars--loading' : ''}`} aria-live="polite">
              <IconStar size={12} />
              <span>{stars === null ? '—' : stars.toLocaleString('ko-KR')}</span>
            </span>
          </a>
        </div>
        <p className="footer-copyright">
          &copy; {new Date().getFullYear()} Travelink. All rights reserved.
        </p>
      </div>

      <TermsOfService isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicy isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </footer>
  );
}
