import { useState, useEffect, useCallback } from 'react'
import { encodeState, decodeState } from '../utils/urlEncoder'

const DEFAULT_STATE = { title: '', items: [] }

function readFromHash() {
  const hash = window.location.hash.slice(1)
  if (!hash) return DEFAULT_STATE
  const decoded = decodeState(hash)
  if (!decoded || typeof decoded !== 'object') return DEFAULT_STATE
  if (!Array.isArray(decoded.items)) return DEFAULT_STATE
  return { title: decoded.title || '', items: decoded.items }
}

function writeToHash(state) {
  window.history.replaceState(null, '', '#' + encodeState(state))
}

export function useUrlState() {
  const [history, setHistory] = useState(() => [readFromHash()])
  const [historyIndex, setHistoryIndex] = useState(0)

  const state = history[historyIndex]

  const writeState = useCallback((newState) => {
    writeToHash(newState)
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newState])
    setHistoryIndex(prev => prev + 1)
  }, [historyIndex])

  const undo = useCallback(() => {
    if (historyIndex <= 0) return
    const idx = historyIndex - 1
    writeToHash(history[idx])
    setHistoryIndex(idx)
  }, [history, historyIndex])

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    const idx = historyIndex + 1
    writeToHash(history[idx])
    setHistoryIndex(idx)
  }, [history, historyIndex])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
        if (e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
        if (e.key === 'y') { e.preventDefault(); redo() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const addItem = useCallback((item) => {
    const newItem = {
      id: crypto.randomUUID(),
      date: '', time: '', destination: '', address: '', memo: '',
      lat: null, lng: null,
      ...item,
    }
    writeState({ ...state, items: [...state.items, newItem] })
    return newItem.id
  }, [state, writeState])

  const updateItem = useCallback((id, updates) => {
    writeState({
      ...state,
      items: state.items.map(item => item.id === id ? { ...item, ...updates } : item),
    })
  }, [state, writeState])

  const deleteItem = useCallback((id) => {
    writeState({ ...state, items: state.items.filter(item => item.id !== id) })
  }, [state, writeState])

  const reorderItems = useCallback((newItems) => {
    writeState({ ...state, items: newItems })
  }, [state, writeState])

  const setTitle = useCallback((title) => {
    writeState({ ...state, title })
  }, [state, writeState])

  return {
    title: state.title,
    items: state.items,
    addItem, updateItem, deleteItem, reorderItems, setTitle,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo, redo,
  }
}
