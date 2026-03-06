import { useState, useEffect, useCallback, useReducer } from 'react'
import { encodeState, decodeState } from '../utils/urlEncoder'

const PLANS_KEY = 'travel-plans'
const ACTIVE_KEY = 'travel-plans-active'

const load = () => { try { return JSON.parse(localStorage.getItem(PLANS_KEY) || '[]') } catch { return [] } }
const persist = (plans) => { try { localStorage.setItem(PLANS_KEY, JSON.stringify(plans)) } catch {} }
const getStoredActiveId = () => localStorage.getItem(ACTIVE_KEY)
const setStoredActiveId = (id) => localStorage.setItem(ACTIVE_KEY, id)

const readHash = () => {
  try {
    const h = window.location.hash.slice(1)
    if (!h) return null
    const d = decodeState(h)
    return (d && Array.isArray(d.items)) ? d : null
  } catch { return null }
}

const writeHash = (id, state) => {
  window.history.replaceState(null, '', '#' + encodeState({ id, title: state.title, items: state.items }))
}

const makePlan = (partial = {}) => {
  const plan = {
    id: crypto.randomUUID(),
    title: '',
    items: [],
    updatedAt: new Date().toISOString(),
    ...partial,
  }
  // Guard: id must always be a valid string
  if (!plan.id) plan.id = crypto.randomUUID()
  return plan
}

function init() {
  let plans = load()
  const hash = readHash()

  if (hash) {
    if (hash.id && plans.some(p => p.id === hash.id)) {
      // Hash matches existing plan — sync and activate
      plans = plans.map(p => p.id === hash.id
        ? { ...p, title: hash.title ?? p.title, items: hash.items, updatedAt: new Date().toISOString() }
        : p
      )
      persist(plans)
      setStoredActiveId(hash.id)
      return { plans, activeId: hash.id, initialState: { title: hash.title ?? '', items: hash.items } }
    }
    if (hash.id) {
      // Shared link (ID not in localStorage) → create new plan from hash
      const shared = makePlan({ id: hash.id, title: hash.title ?? '', items: hash.items })
      plans = [shared, ...plans]
      persist(plans)
      setStoredActiveId(shared.id)
      return { plans, activeId: shared.id, initialState: { title: shared.title, items: shared.items } }
    }
  }

  // No hash or hash without valid id — use stored active plan
  if (plans.length === 0) {
    const first = makePlan()
    plans = [first]
    persist(plans)
    setStoredActiveId(first.id)
    return { plans, activeId: first.id, initialState: { title: '', items: [] } }
  }

  const savedId = getStoredActiveId()
  const activeId = (savedId && plans.some(p => p.id === savedId)) ? savedId : plans[0].id
  setStoredActiveId(activeId)
  const active = plans.find(p => p.id === activeId)
  return { plans, activeId, initialState: { title: active?.title ?? '', items: active?.items ?? [] } }
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
  const [{ plans: ip, activeId: iai, initialState: is }] = useState(init)

  const [plans, setPlans] = useState(ip)
  const [activeId, setActiveId] = useState(iai)
  const [hist, dispatch] = useReducer(histReducer, null, () => ({ stack: [is], idx: 0 }))

  const state = hist.stack[hist.idx]

  // Sync active plan to localStorage + URL hash.
  // Uses functional setPlans so we always work with the latest plans state,
  // without adding plans to deps (which would cause an infinite loop).
  useEffect(() => {
    if (!activeId) return
    writeHash(activeId, state)
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

  // Plan management — plans state is the source of truth, no load() calls
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
      order: Date.now(),  // 날짜 미정 항목의 순서 관리용
      cost: '', category: '',
      ...item,
    }
    writeState({ ...state, items: [...state.items, newItem] })
    return newItem.id
  }, [state, writeState])

  const updateItem = useCallback((id, updates) => {
    const processedUpdates = { ...updates }
    // 날짜가 지워질 때 → 목록 맨 끝으로 초기화
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
  }
}
