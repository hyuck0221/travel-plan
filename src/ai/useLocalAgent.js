import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelLocalEngineLoad, interruptLocalEngineGeneration, isLocalEngineReady, runLocalAgent, warmLocalEngine } from './localAgent.js'

export function useLocalAgent({ onEvent, onApplyPlan }) {
  const activeRunRef = useRef(null)
  const onEventRef = useRef(onEvent)
  const onApplyPlanRef = useRef(onApplyPlan)
  const [state, setState] = useState({ status: 'idle', progress: 0, error: '', progressText: '' })

  useEffect(() => { onEventRef.current = onEvent }, [onEvent])
  useEffect(() => { onApplyPlanRef.current = onApplyPlan }, [onApplyPlan])

  const reportCancellation = (runContext) => {
    if (runContext.cancellationEventSent) return
    runContext.cancellationEventSent = true
    setState({ status: 'cancelled', progress: 0, error: '', progressText: '' })
    onEventRef.current?.({ type: 'cancelled', label: '작업을 중단했습니다.' })
  }

  const run = useCallback(async ({ prompt, currentPlan, conversationHistory = [], isLocked = false }) => {
    if (activeRunRef.current) return null

    const controller = new AbortController()
    const runContext = {
      controller,
      cancelled: false,
      cancellationEventSent: false,
    }
    activeRunRef.current = runContext
    const isCurrentRun = () => activeRunRef.current === runContext && !runContext.cancelled && !controller.signal.aborted

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
        isLocked,
        signal: controller.signal,
        onEvent: event => {
          if (!isCurrentRun()) return
          if (event.type === 'stage' && event.key === 'apply') {
            setState(prev => ({ ...prev, status: 'applying' }))
          }
          onEventRef.current?.(event)
        },
        onApplyPlan: (plan, options) => {
          if (!isCurrentRun()) return
          onApplyPlanRef.current?.(plan, options)
        },
        onProgress: ({ progress, text }) => {
          if (!isCurrentRun()) return
          setState(prev => ({
            ...prev,
            status: progress >= 0.99 ? 'working' : 'loading',
            progress: Math.max(0, Math.min(1, progress)),
            progressText: text,
          }))
        },
      })
      if (!isCurrentRun()) return null
      setState({
        status: result?.action?.mode === 'apply' ? 'done' : 'answered',
        progress: 1,
        error: '',
        progressText: '',
      })
      return result
    } catch (error) {
      if (runContext.cancelled || controller.signal.aborted || error?.name === 'AbortError') {
        reportCancellation(runContext)
        return null
      }
      if (!isCurrentRun()) return null
      setState({ status: 'error', progress: 0, error: error.message || 'AI 작업을 완료하지 못했습니다.', progressText: '' })
      onEventRef.current?.({ type: 'error', label: error.message || 'AI 작업을 완료하지 못했습니다.' })
      return null
    } finally {
      if (activeRunRef.current === runContext) activeRunRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    const runContext = activeRunRef.current
    if (!runContext) return

    runContext.cancelled = true
    runContext.controller.abort()
    cancelLocalEngineLoad()
    // WebLLM의 non-streaming completion은 AbortSignal만으로 현재 토큰
    // 생성을 끊지 못할 수 있으므로 엔진에도 즉시 중단을 전달한다.
    interruptLocalEngineGeneration()
    reportCancellation(runContext)

    // UI는 즉시 다음 입력을 받을 수 있게 하고, 이전 비동기 작업의 늦은
    // 콜백은 runContext 검사에서 모두 무시한다.
    activeRunRef.current = null
  }, [])

  const warmUp = useCallback((onProgress) => warmLocalEngine(onProgress), [])

  return {
    ...state,
    isRunning: ['loading', 'working', 'applying'].includes(state.status),
    run,
    cancel,
    warmUp,
  }
}
