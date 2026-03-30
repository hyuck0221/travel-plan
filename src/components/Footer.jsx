import React, { useState } from 'react';
import { TermsOfService, PrivacyPolicy } from './LegalModals';

export default function Footer() {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

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
