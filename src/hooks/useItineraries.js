import { useState, useEffect, useCallback, useReducer } from 'react'
import { encodeState, decodeState } from '../utils/urlEncoder'

const PLANS_KEY = 'travel-plans'
const ACTIVE_KEY = 'travel-plans-active'

const load = () => { try { return JSON.parse(localStorage.getItem(PLANS_KEY) || '[]') } catch { return [] } }
const persist = (plans) => { try { localStorage.setItem(PLANS_KEY, JSON.stringify(plans)) } catch {} }
const getStoredActiveId = () => localStorage.getItem(ACTIVE_KEY)
const setStoredActiveId = (id) => localStorage.setItem(ACTIVE_KEY, id)

const writeHash = async (id, state) => {
  try {
    const encoded = await encodeState({ id, title: state.title, items: state.items })
    window.history.replaceState(null, '', '#' + encoded)
    return encoded.length
  } catch { return 0 }
}

const makePlan = (partial = {}) => {
  const plan = {
    id: crypto.randomUUID(),
    title: '',
    items: [],
    updatedAt: new Date().toISOString(),
    ...partial,
  }
  if (!plan.id) plan.id = crypto.randomUUID()
  return plan
}

function init() {
  let plans = load()
  // 해시는 async이므로 raw 문자열만 전달, 처리는 mount 후 useEffect에서
  const pendingHash = window.location.hash.slice(1) || null

  if (plans.length === 0) {
    const first = makePlan()
    plans = [first]
    persist(plans)
    setStoredActiveId(first.id)
    return { plans, activeId: first.id, initialState: { title: '', items: [] }, pendingHash }
  }

  const savedId = getStoredActiveId()
  const activeId = (savedId && plans.some(p => p.id === savedId)) ? savedId : plans[0].id
  setStoredActiveId(activeId)
  const active = plans.find(p => p.id === activeId)
  return { plans, activeId, initialState: { title: active?.title ?? '', items: active?.items ?? [] }, pendingHash }
}

// Undo/redo reducer
function histReducer(s, action) {
  switch (action.type) {
    case 'PUSH': return { stack: [...s.stack.slice(0, s.idx + 1), action.payload], idx: s.idx + 1 }
    case 'UNDO': return s.idx > 0 ? { ...s, idx: s.idx - 1 } : s
    case 'REDO': return s.idx < s.stack.length - 1 ? { ...s, idx: s.idx + 1 } : s
    case 'RESET': return { stack: [action.payload], idx: 0 }
    default: return s
  }
}

export function useItineraries() {
  const [{ plans: ip, activeId: iai, initialState: is, pendingHash }] = useState(init)

  const [plans, setPlans] = useState(ip)
  const [activeId, setActiveId] = useState(iai)
  const [hist, dispatch] = useReducer(histReducer, null, () => ({ stack: [is], idx: 0 }))
  const [conflictData, setConflictData] = useState(null)
  const [urlLength, setUrlLength] = useState(0)

  const state = hist.stack[hist.idx]

  // mount 후 해시 async 처리
  useEffect(() => {
    if (!pendingHash) return
    decodeState(pendingHash).then(hash => {
      if (!hash || !Array.isArray(hash.items)) return
      const currentPlans = load()
      const existingPlan = currentPlans.find(p => p.id === hash.id)

      if (existingPlan) {
        // 내용이 동일하면 조용히 활성화 (재로드 시나리오)
        // ID뿐 아니라 실제 필드 값까지 비교 (수정 감지)
        const isSame =
          existingPlan.title === (hash.title ?? '') &&
          existingPlan.items.length === hash.items.length &&
          hash.items.every(hashItem => {
            const stored = existingPlan.items.find(i => i.id === hashItem.id)
            return stored != null &&
              (stored.destination || '') === (hashItem.destination || '') &&
              (stored.address || '') === (hashItem.address || '') &&
              (stored.date || '') === (hashItem.date || '') &&
              (stored.time || '') === (hashItem.time || '') &&
              (stored.memo || '') === (hashItem.memo || '')
          })

        if (isSame) {
          setActiveId(hash.id)
          setStoredActiveId(hash.id)
          dispatch({ type: 'RESET', payload: { title: existingPlan.title, items: existingPlan.items } })
        } else {
          // 내용 다름 → 충돌 다이얼로그
          setConflictData({ fromHash: hash, existing: existingPlan })
        }
      } else if (hash.id) {
        // 새 공유 링크 → 자동 추가
        const shared = makePlan({ id: hash.id, title: hash.title ?? '', items: hash.items })
        const updated = [shared, ...currentPlans]
        persist(updated)
        setPlans(updated)
        setActiveId(shared.id)
        setStoredActiveId(shared.id)
        dispatch({ type: 'RESET', payload: { title: shared.title, items: shared.items } })
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync active plan to localStorage + URL hash
  useEffect(() => {
    if (!activeId) return
    writeHash(activeId, state).then(len => setUrlLength(len))
    setPlans(prev => {
      const updated = prev.map(p =>
        p.id === activeId
          ? { ...p, title: state.title, items: state.items, updatedAt: new Date().toISOString() }
          : p
      )
      persist(updated)
      return updated
    })
  }, [state, activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }) }
        if (e.key === 'z' && e.shiftKey) { e.preventDefault(); dispatch({ type: 'REDO' }) }
        if (e.key === 'y') { e.preventDefault(); dispatch({ type: 'REDO' }) }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const writeState = useCallback((newState) => {
    dispatch({ type: 'PUSH', payload: newState })
  }, [])

  const resolveConflict = useCallback((overwrite) => {
    if (!conflictData) return
    const { fromHash, existing } = conflictData
    
    if (overwrite) {
      // 덮어씌우기 — 해시 데이터로 로컬 업데이트
      setPlans(prev => {
        const updated = prev.map(p => p.id === fromHash.id
          ? { ...p, title: fromHash.title ?? p.title, items: fromHash.items, updatedAt: new Date().toISOString() }
          : p
        )
        persist(updated)
        return updated
      })
      setActiveId(fromHash.id)
      setStoredActiveId(fromHash.id)
      dispatch({ type: 'RESET', payload: { title: fromHash.title ?? '', items: fromHash.items } })
    } else {
      // 취소 — 로컬에 이미 있던 기존 데이터 강제 로드 및 URL 정리
      setActiveId(existing.id)
      setStoredActiveId(existing.id)
      dispatch({ type: 'RESET', payload: { title: existing.title, items: existing.items } })
      
      // 중요: URL 해시를 즉시 제거하여 루프 방지 및 사용자 의도 반영
      // SecurityError 방지를 위해 origin + pathname 조합 사용
      const cleanUrl = window.location.origin + window.location.pathname + window.location.search;
      window.history.replaceState(null, '', cleanUrl);
    }
    setConflictData(null)
  }, [conflictData])

  // Plan management
  const createPlan = useCallback(() => {
    const plan = makePlan()
    setPlans(prev => {
      const updated = [plan, ...prev]
      persist(updated)
      return updated
    })
    setActiveId(plan.id)
    setStoredActiveId(plan.id)
    dispatch({ type: 'RESET', payload: { title: '', items: [] } })
  }, [])

  const deletePlan = useCallback((id) => {
    let remaining = plans.filter(p => p.id !== id)
    if (remaining.length === 0) remaining = [makePlan()]
    persist(remaining)
    setPlans(remaining)
    if (id === activeId) {
      const next = remaining[0]
      setActiveId(next.id)
      setStoredActiveId(next.id)
      dispatch({ type: 'RESET', payload: { title: next.title, items: next.items } })
    }
  }, [plans, activeId])

  const switchPlan = useCallback((id) => {
    if (id === activeId) return
    const target = plans.find(p => p.id === id)
    if (!target) return
    setActiveId(id)
    setStoredActiveId(id)
    dispatch({ type: 'RESET', payload: { title: target.title, items: target.items } })
  }, [plans, activeId])

  // CRUD for items
  const addItem = useCallback((item) => {
    const newItem = {
      id: crypto.randomUUID(),
      date: '', time: '', destination: '', address: '', memo: '',
      lat: null, lng: null,
      order: Date.now(),
      cost: '', category: '',
      ...item,
    }
    writeState({ ...state, items: [...state.items, newItem] })
    return newItem.id
  }, [state, writeState])

  const updateItem = useCallback((id, updates) => {
    const processedUpdates = { ...updates }
    if ('date' in updates && !updates.date && !('order' in updates)) {
      const currentItem = state.items.find(i => i.id === id)
      if (currentItem?.date) processedUpdates.order = Date.now()
    }
    writeState({ ...state, items: state.items.map(i => i.id === id ? { ...i, ...processedUpdates } : i) })
  }, [state, writeState])

  const deleteItem = useCallback((id) => {
    writeState({ ...state, items: state.items.filter(i => i.id !== id) })
  }, [state, writeState])

  const setTitle = useCallback((title) => {
    writeState({ ...state, title })
  }, [state, writeState])

  return {
    title: state.title,
    items: state.items,
    addItem, updateItem, deleteItem, setTitle,
    canUndo: hist.idx > 0,
    canRedo: hist.idx < hist.stack.length - 1,
    undo: useCallback(() => dispatch({ type: 'UNDO' }), []),
    redo: useCallback(() => dispatch({ type: 'REDO' }), []),
    plans,
    activeId,
    createPlan,
    deletePlan,
    switchPlan,
    conflictData,
    resolveConflict,
    isUrlLimitReached: urlLength > 3000,
  }
}
