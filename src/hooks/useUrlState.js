import { useState, useEffect, useCallback, useRef } from 'react'
import { encodeState, decodeState } from '../utils/urlEncoder'

const DEFAULT_STATE = { title: '', items: [] }

export function useUrlState() {
  const [history, setHistory] = useState([DEFAULT_STATE])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  
  const state = history[historyIndex]

  // Initialize from Hash
  useEffect(() => {
    const init = async () => {
      const hash = window.location.hash.slice(1)
      if (!hash) {
        setIsLoaded(true)
        return
      }
      const decoded = await decodeState(hash)
      if (decoded && typeof decoded === 'object' && Array.isArray(decoded.items)) {
        setHistory([decoded])
      }
      setIsLoaded(true)
    }
    init()
  }, [])

  // Helper: Write to URL
  const updateUrl = useCallback(async (newState) => {
    try {
      const encoded = await encodeState(newState)
      if (typeof encoded === 'string' && !encoded.includes('[object Promise]')) {
        window.history.replaceState(null, '', '#' + encoded)
      } else {
        console.error('Invalid encoded state:', encoded)
      }
    } catch (e) {
      console.error('Failed to update URL:', e)
    }
  }, [])

  const writeState = useCallback((newState) => {
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newState])
    setHistoryIndex(prev => prev + 1)
    updateUrl(newState)
  }, [historyIndex, updateUrl])

  const undo = useCallback(() => {
    if (historyIndex <= 0) return
    const idx = historyIndex - 1
    const targetState = history[idx]
    setHistoryIndex(idx)
    updateUrl(targetState)
  }, [history, historyIndex, updateUrl])

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    const idx = historyIndex + 1
    const targetState = history[idx]
    setHistoryIndex(idx)
    updateUrl(targetState)
  }, [history, historyIndex, updateUrl])

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
      category: '', cost: '',
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
    isLoaded,
    addItem, updateItem, deleteItem, reorderItems, setTitle,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo, redo,
  }
}
