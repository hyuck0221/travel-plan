import { useCallback, useEffect, useRef, useState } from 'react'
import { isLocalEngineReady, runLocalAgent } from './localAgent.js'

export function useLocalAgent({ onEvent, onApplyPlan }) {
  const controllerRef = useRef(null)
  const onEventRef = useRef(onEvent)
  const onApplyPlanRef = useRef(onApplyPlan)
  const [state, setState] = useState({ status: 'idle', progress: 0, error: '', progressText: '' })

  useEffect(() => { onEventRef.current = onEvent }, [onEvent])
  useEffect(() => { onApplyPlanRef.current = onApplyPlan }, [onApplyPlan])

  const run = useCallback(async ({ prompt, currentPlan, conversationHistory = [] }) => {
    if (controllerRef.current) return null

    const controller = new AbortController()
    controllerRef.current = controller
    const engineReady = isLocalEngineReady()
    setState({
      status: engineReady ? 'working' : 'loading',
      progress: engineReady ? 1 : 0,
      error: '',
      progressText: '',
    })

    try {
      const result = await runLocalAgent({
        prompt,
        currentPlan,
        conversationHistory,
        signal: controller.signal,
        onEvent: event => {
          if (event.type === 'stage' && event.key === 'apply') {
            setState(prev => ({ ...prev, status: 'applying' }))
          }
          onEventRef.current?.(event)
        },
        onApplyPlan: (plan, options) => onApplyPlanRef.current?.(plan, options),
        onProgress: ({ progress, text }) => {
          setState(prev => ({
            ...prev,
            status: progress >= 0.99 ? 'working' : 'loading',
            progress: Math.max(0, Math.min(1, progress)),
            progressText: text,
          }))
        },
      })
      setState({ status: 'done', progress: 1, error: '', progressText: '' })
      return result
    } catch (error) {
      if (error?.name === 'AbortError') {
        setState({ status: 'cancelled', progress: 0, error: '', progressText: '' })
        onEventRef.current?.({ type: 'cancelled', label: '작업을 중단했습니다.' })
        return null
      }
      setState({ status: 'error', progress: 0, error: error.message || 'AI 작업을 완료하지 못했습니다.', progressText: '' })
      onEventRef.current?.({ type: 'error', label: error.message || 'AI 작업을 완료하지 못했습니다.' })
      return null
    } finally {
      controllerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  return {
    ...state,
    isRunning: ['loading', 'working', 'applying'].includes(state.status),
    run,
    cancel,
  }
}
