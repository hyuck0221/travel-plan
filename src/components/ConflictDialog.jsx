export default function ConflictDialog({ conflictData, onResolve }) {
  if (!conflictData) return null
  const { fromHash, existing } = conflictData

  return (
    <div className="conflict-overlay">
      <div className="conflict-dialog">
        <h3 className="conflict-dialog-title">공유 링크 충돌</h3>
        <p className="conflict-dialog-desc">
          이 링크의 일정이 현재 기기에 저장된 내용과 다릅니다. 어떻게 처리할까요?
        </p>
        <div className="conflict-plans">
          <div className="conflict-plan-card">
            <div className="conflict-plan-label">현재 저장된 일정</div>
            <div className="conflict-plan-name">{existing.title || '(제목 없음)'}</div>
            <div className="conflict-plan-count">{existing.items.length}개 장소</div>
          </div>
          <div className="conflict-arrow">→</div>
          <div className="conflict-plan-card conflict-plan-card--incoming">
            <div className="conflict-plan-label">링크의 일정</div>
            <div className="conflict-plan-name">{fromHash.title || '(제목 없음)'}</div>
            <div className="conflict-plan-count">{fromHash.items.length}개 장소</div>
          </div>
        </div>
        <div className="conflict-actions">
          <button className="btn btn-primary" onClick={() => onResolve(true)}>
            링크 내용으로 덮어쓰기
          </button>
          <button className="btn btn-secondary" onClick={() => onResolve(false)}>
            취소 (기존 내용 유지)
          </button>
        </div>
      </div>
    </div>
  )
}
