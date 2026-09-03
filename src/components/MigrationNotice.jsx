import { useEffect, useMemo, useState } from 'react'
import { IconCheck, IconClose, IconLoader } from './Icons'
import {
  MIGRATION_DEADLINE_LABEL,
  MIGRATION_HOST,
  LEGACY_HOST,
  buildMigratedPlanUrl,
  hasPlanData,
} from '../utils/migration'
import './MigrationNotice.css'

function planLabel(plan) {
  return plan.title?.trim() || '제목 없는 일정'
}

function MigrationIntroModal({ isOpen, onMigrate, onLater }) {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onLater()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onLater])

  if (!isOpen) return null

  return (
    <div
      className="migration-overlay"
      onMouseDown={event => { if (event.target === event.currentTarget) onLater() }}
    >
      <div className="migration-dialog migration-intro-dialog" role="dialog" aria-modal="true" aria-labelledby="migration-intro-title">
        <div className="migration-dialog-header">
          <div>
            <div className="migration-dialog-eyebrow">중요 안내</div>
            <h2 id="migration-intro-title">서비스 주소가 변경됩니다</h2>
          </div>
          <button className="modal-close" onClick={onLater} aria-label="다음에 하기">
            <IconClose />
          </button>
        </div>

        <div className="migration-dialog-body">
          <p className="migration-dialog-description">
            Travelink 서비스가 새로운 주소로 이전합니다. 저장된 일정을 새 주소에서도 계속 사용하려면
            {` ${MIGRATION_DEADLINE_LABEL}`}까지 이관해 주세요.
          </p>

          <div className="migration-domain-transfer" aria-label={`${LEGACY_HOST}에서 ${MIGRATION_HOST}로 주소 변경`}>
            <span className="migration-domain migration-domain--legacy">{LEGACY_HOST}</span>
            <span className="migration-domain-arrow" aria-hidden="true">→</span>
            <span className="migration-domain migration-domain--new">{MIGRATION_HOST}</span>
          </div>

          <p className="migration-dialog-note">
            이관할 일정만 선택할 수 있으며, 기존 일정은 삭제되지 않습니다.
          </p>
        </div>

        <div className="migration-dialog-footer">
          <button className="btn btn-secondary" onClick={onLater}>다음에 하기</button>
          <button className="btn btn-primary" onClick={onMigrate}>일정 이관하기</button>
        </div>
      </div>
    </div>
  )
}

function MigrationModal({ isOpen, plans, onClose }) {
  const migratablePlans = useMemo(() => plans.filter(hasPlanData), [plans])
  const [selectedIds, setSelectedIds] = useState([])
  const [links, setLinks] = useState({})
  const [isPreparing, setIsPreparing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return

    setSelectedIds(migratablePlans.map(plan => plan.id))
    setLinks({})
    setError('')
    setIsPreparing(true)

    let cancelled = false
    Promise.all(migratablePlans.map(async plan => [
      plan.id,
      await buildMigratedPlanUrl(plan),
    ])).then(entries => {
      if (cancelled) return
      setLinks(Object.fromEntries(entries))
      setIsPreparing(false)
    }).catch(() => {
      if (cancelled) return
      setError('일정 링크를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setIsPreparing(false)
    })

    return () => { cancelled = true }
  }, [isOpen, migratablePlans])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const selectedPlans = migratablePlans.filter(plan => selectedIds.includes(plan.id))
  const allSelected = migratablePlans.length > 0 && selectedIds.length === migratablePlans.length
  const canConfirm = selectedPlans.length > 0 && !isPreparing && !error && selectedPlans.every(plan => links[plan.id])

  const togglePlan = (id) => {
    setSelectedIds(current => current.includes(id)
      ? current.filter(selectedId => selectedId !== id)
      : [...current, id]
    )
  }

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : migratablePlans.map(plan => plan.id))
  }

  const handleConfirm = () => {
    if (!canConfirm) return

    let blockedCount = 0
    selectedPlans.forEach(plan => {
      try {
        const opened = window.open(links[plan.id], '_blank', 'noopener,noreferrer')
        if (!opened) blockedCount += 1
      } catch {
        blockedCount += 1
      }
    })

    onClose()
    if (blockedCount > 0) {
      window.setTimeout(() => {
        window.alert(`${blockedCount}개의 새 창이 차단되었습니다. 브라우저의 팝업 허용 후 다시 시도해 주세요.`)
      }, 0)
    }
  }

  return (
    <div
      className="migration-overlay"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="migration-dialog" role="dialog" aria-modal="true" aria-labelledby="migration-dialog-title">
        <div className="migration-dialog-header">
          <div>
            <div className="migration-dialog-eyebrow">주소 변경 안내</div>
            <h2 id="migration-dialog-title">새 주소로 일정 이관</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="이관 창 닫기">
            <IconClose />
          </button>
        </div>

        <div className="migration-dialog-body">
          <p className="migration-dialog-description">
            이관할 일정을 선택하면 저장된 내용이 그대로 담긴 새 주소를 각각 새 창으로 엽니다.
            기존 일정은 이 브라우저에서 삭제되지 않습니다.
          </p>

          <div className="migration-selection-toolbar">
            <span>이관할 일정 {selectedPlans.length}/{migratablePlans.length}개</span>
            <button className="migration-select-all" onClick={toggleAll}>
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          <div className="migration-plan-list" role="group" aria-label="이관할 일정 선택">
            {migratablePlans.map(plan => {
              const selected = selectedIds.includes(plan.id)
              return (
                <label className={`migration-plan-row${selected ? ' migration-plan-row--selected' : ''}`} key={plan.id}>
                  <input
                    className="migration-plan-input"
                    type="checkbox"
                    checked={selected}
                    onChange={() => togglePlan(plan.id)}
                  />
                  <span className="migration-plan-check" aria-hidden="true">
                    {selected && <IconCheck size={14} />}
                  </span>
                  <span className="migration-plan-info">
                    <span className="migration-plan-title">{planLabel(plan)}</span>
                    <span className="migration-plan-meta">{plan.items?.length || 0}개 장소</span>
                  </span>
                </label>
              )
            })}
          </div>

          {isPreparing && (
            <div className="migration-status" role="status">
              <IconLoader size={15} /> 새 주소 링크를 준비하고 있습니다…
            </div>
          )}
          {error && <p className="migration-error" role="alert">{error}</p>}
          <p className="migration-dialog-note">
            새 주소: <strong>https://{MIGRATION_HOST}</strong>
          </p>
        </div>

        <div className="migration-dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>다음에 하기</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!canConfirm}>
            선택한 일정 새 창에서 열기
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MigrationNotice({ plans }) {
  const [introOpen, setIntroOpen] = useState(true)
  const [selectionOpen, setSelectionOpen] = useState(false)
  const migratablePlans = useMemo(() => plans.filter(hasPlanData), [plans])

  if (migratablePlans.length === 0) return null

  const handleMigrate = () => {
    setIntroOpen(false)
    setSelectionOpen(true)
  }

  const handleLater = () => setIntroOpen(false)

  return (
    <>
      <MigrationIntroModal isOpen={introOpen} onMigrate={handleMigrate} onLater={handleLater} />
      <MigrationModal isOpen={selectionOpen} plans={plans} onClose={() => setSelectionOpen(false)} />
    </>
  )
}
