import React, { useState, useEffect } from 'react';
import { TermsOfService, PrivacyPolicy } from './LegalModals';
import { IconGithub } from './Icons';

export default function Footer() {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [stars, setStars] = useState(null);

  useEffect(() => {
    fetch('https://api.github.com/repos/hyuck0221/travel-plan')
      .then(res => res.json())
      .then(data => {
        if (data.stargazers_count !== undefined) {
          setStars(data.stargazers_count);
        }
      })
      .catch(() => {});
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
          >
            <IconGithub size={16} />
            {stars !== null && <span className="footer-github-stars">{stars}</span>}
          </a>
        </div>
        <p className="footer-copyright">
          &copy; {new Date().getFullYear()} Travel Plan. All rights reserved.
        </p>
      </div>

      <TermsOfService isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicy isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </footer>
  );
}
