import React from 'react';

const Modal = ({title, isOpen, onClose, children}) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-content--legal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button onClick={onClose} className="modal-close">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div className="modal-body legal-content">
                    {children}
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn btn-primary">
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
};

export const TermsOfService = ({isOpen, onClose}) => (
    <Modal title="서비스 이용약관" isOpen={isOpen} onClose={onClose}>
        <div className="legal-section">
            <h3>제 1 조 (목적)</h3>
            <p>본 약관은 'travel-plan'(이하 "서비스")이 제공하는 여행 계획 작성 및 공유 서비스의 이용조건과 절차에 관한 사항을 규정함을 목적으로 합니다.</p>
        </div>
        <div className="legal-section">
            <h3>제 2 조 (서비스의 특징)</h3>
            <p>본 서비스는 사용자가 입력한 여행 데이터를 서버에 저장하지 않고 URL 파라미터에 인코딩하여 관리하는 "Stateless" 방식의 서비스입니다. 따라서 데이터의 보존 책임은 해당 URL을
                보관하는 사용자에게 있습니다.</p>
        </div>
        <div className="legal-section">
            <h3>제 3 조 (이용자의 의무)</h3>
            <p>사용자는 서비스를 통해 불법적인 정보를 게시하거나 타인의 저작권을 침해해서는 안됩니다.</p>
        </div>
        <div className="legal-section">
            <h3>제 4 조 (면책조항)</h3>
            <p>본 서비스는 무료로 제공되며, 서비스 이용 중 발생한 데이터 유실이나 링크 손실에 대해 어떠한 책임도 지지 않습니다. Naver 지도 API 등 외부 API의 장애로 인한 서비스 중단 역시
                면책 사유에 해당합니다.</p>
        </div>
    </Modal>
);

export const PrivacyPolicy = ({isOpen, onClose}) => (
    <Modal title="개인정보처리방침" isOpen={isOpen} onClose={onClose}>
        <div className="legal-section">
            <h3>1. 개인정보의 수집 항목</h3>
            <p>본 서비스는 회원가입 절차가 없으며, 사용자의 개인정보를 서버에 수집하거나 저장하지 않습니다.</p>
        </div>
        <div className="legal-section">
            <h3>2. 데이터 처리 방식</h3>
            <p>사용자가 입력한 여행 일정, 장소 메모 등은 사용자의 브라우저 내에서 인코딩되어 URL 형태로 생성됩니다. 이 데이터는 본 서비스의 서버를 거치지 않으며, 오직 링크를 가진 사람만이 확인할
                수 있습니다.
                <br></br>
                단, 링크 단축하여 복사, QR 생성, 공유 기능 사용 시 단축 URL 서비스 지원을 위해 작업중인 URL을 서버로 전송하여 DB에 저장하여 관리합니다.
                단축 URL 특성 상 다른 사용자가 유추하여 링크로 접속할 경우, 개인정보 유출에 대해 책임지지 않습니다.
            </p>
        </div>
        <div className="legal-section">
            <h3>3. 외부 API 이용</h3>
            <p>장소 검색 시 Naver 지도 API를 이용하며, 이 과정에서 검색어 외의 개인정보는 전달되지 않습니다.
                <br></br>
                단축 URL 기능 사용 시 (2. 데이터 처리 방식 참고) apisis.dev API를 이용하며, 이 과정에서 URL 정보가 전송됩니다.
            </p>
        </div>
        <div className="legal-section">
            <h3>4. 쿠키 및 분석 도구</h3>
            <p>서비스 최적화를 위해 브라우저의 로컬 스토리지를 사용하며 그 외에 목적으론 사용하지 않습니다.</p>
        </div>
    </Modal>
);
