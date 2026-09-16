import { useState } from 'react'
import {
  IconApi,
  IconCheck,
  IconClaude,
  IconCpu,
  IconGemini,
  IconGlobe,
  IconGrok,
  IconLink,
  IconLoader,
  IconNvidia,
  IconOpenAI,
} from './Icons'
import { API_PROVIDER_OPTIONS, LOCAL_MODEL_ID, LOCAL_MODEL_OPTIONS } from '../ai/aiConfig.js'
import { validateExternalConnection } from '../ai/externalProvider.js'

const PROVIDER_ICONS = {
  openai: IconOpenAI,
  anthropic: IconClaude,
  gemini: IconGemini,
  grok: IconGrok,
  nvidia: IconNvidia,
  custom: IconApi,
}

function rawJson(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2)
  return fallback
}

function initialCustomConfig(config) {
  const custom = config?.external?.custom || {}
  return {
    url: custom.url || '',
    headers: rawJson(custom.headers, '{}'),
    body: rawJson(custom.body, '{\n  "model": "",\n  "messages": []\n}'),
  }
}

export default function AISettings({ config, onApply }) {
  const currentExternal = config?.external || {}
  const [mode, setMode] = useState(config?.mode === 'api' ? 'api' : 'local')
  const [localModelId, setLocalModelId] = useState(config?.localModelId || LOCAL_MODEL_ID)
  const [providerId, setProviderId] = useState(currentExternal.provider || 'openai')
  const [apiKey, setApiKey] = useState(currentExternal.apiKey || '')
  const [models, setModels] = useState(Array.isArray(currentExternal.models) ? currentExternal.models : [])
  const [selectedModel, setSelectedModel] = useState(currentExternal.modelId || '')
  const [custom, setCustom] = useState(initialCustomConfig(config))
  const [connectionState, setConnectionState] = useState(currentExternal.connected ? 'connected' : 'idle')
  const [error, setError] = useState('')

  const selectedProvider = API_PROVIDER_OPTIONS.find(provider => provider.id === providerId) || API_PROVIDER_OPTIONS[0]
  const ProviderIcon = PROVIDER_ICONS[selectedProvider.id] || IconApi
  const isConnecting = connectionState === 'connecting'
  const isCustom = providerId === 'custom'

  const changeMode = nextMode => {
    setMode(nextMode)
    setError('')
  }

  const changeProvider = nextProviderId => {
    setProviderId(nextProviderId)
    setApiKey('')
    setModels([])
    setSelectedModel('')
    setConnectionState('idle')
    setError('')
  }

  const connectProvider = async () => {
    setError('')
    setConnectionState('connecting')
    try {
      const result = await validateExternalConnection({
        provider: providerId,
        apiKey: apiKey.trim(),
        custom,
      })
      const nextModels = Array.isArray(result.models) ? result.models : []
      setModels(nextModels)
      setSelectedModel(previous => nextModels.some(model => model.id === previous) ? previous : nextModels[0]?.id || '')
      setConnectionState('connected')

      // 커스텀 API는 모델 목록 규격이 없으므로 연결 검증 자체를 저장 단계로 사용한다.
      if (isCustom) {
        onApply?.({
          mode: 'api',
          localModelId,
          external: {
            provider: 'custom',
            modelId: nextModels[0]?.id || 'custom',
            models: nextModels,
            connected: true,
            custom: { ...custom },
          },
        })
      }
    } catch (connectionError) {
      setConnectionState('error')
      setError(connectionError?.message || '연결하지 못했습니다.')
    }
  }

  const applySettings = () => {
    if (mode === 'local') {
      onApply?.({ mode: 'local', localModelId, external: null })
      return
    }
    if (isCustom) return
    if (!apiKey.trim()) {
      setError('API key를 입력해주세요.')
      return
    }
    if (connectionState !== 'connected' || !selectedModel) {
      setError('먼저 연결한 뒤 모델을 선택해주세요.')
      return
    }
    onApply?.({
      mode: 'api',
      localModelId,
      external: {
        provider: providerId,
        apiKey: apiKey.trim(),
        modelId: selectedModel,
        models,
        connected: true,
      },
    })
  }

  return (
    <div className="ai-settings-view">
      <div className="ai-settings-mode" role="tablist" aria-label="AI 실행 방식">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'local'}
          className={'ai-settings-mode-btn' + (mode === 'local' ? ' ai-settings-mode-btn--active' : '')}
          onClick={() => changeMode('local')}
        >
          <IconCpu size={15} />
          <span>Web Local</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'api'}
          className={'ai-settings-mode-btn' + (mode === 'api' ? ' ai-settings-mode-btn--active' : '')}
          onClick={() => changeMode('api')}
        >
          <IconGlobe size={15} />
          <span>API</span>
        </button>
      </div>

      {mode === 'local' ? (
        <div className="ai-settings-section">
          <div className="ai-settings-list" role="radiogroup" aria-label="로컬 모델">
            {LOCAL_MODEL_OPTIONS.map(model => (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={localModelId === model.id}
                className={'ai-settings-model-option' + (localModelId === model.id ? ' ai-settings-model-option--selected' : '')}
                onClick={() => setLocalModelId(model.id)}
              >
                <span className="ai-settings-model-icon"><IconCpu size={16} /></span>
                <span className="ai-settings-model-name">{model.label}</span>
                <span className="ai-settings-model-badge">{model.badge}</span>
                <span className="ai-settings-model-check" aria-hidden="true">
                  {localModelId === model.id && <IconCheck size={14} />}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="ai-settings-confirm" onClick={applySettings}>확인</button>
        </div>
      ) : (
        <div className="ai-settings-section">
          <div className="ai-provider-grid" role="radiogroup" aria-label="API 서비스">
            {API_PROVIDER_OPTIONS.map(provider => {
              const Provider = PROVIDER_ICONS[provider.id] || IconApi
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="radio"
                  aria-checked={providerId === provider.id}
                  aria-label={provider.label}
                  data-tooltip={provider.label}
                  className={'ai-provider-option ai-provider-option--' + provider.id + (providerId === provider.id ? ' ai-provider-option--selected' : '')}
                  onClick={() => changeProvider(provider.id)}
                >
                  <Provider size={21} />
                </button>
              )
            })}
          </div>

          <div className={'ai-settings-provider-title ai-settings-provider-title--' + selectedProvider.id}>
            <span><ProviderIcon size={16} /></span>
            <strong>{selectedProvider.label}</strong>
          </div>

          {isCustom ? (
            <div className="ai-settings-fields ai-settings-fields--custom">
              <label className="ai-settings-field">
                <span>URL</span>
                <input
                  type="url"
                  value={custom.url}
                  onChange={event => setCustom(previous => ({ ...previous, url: event.target.value }))}
                  placeholder="https://"
                  autoComplete="off"
                />
              </label>
              <label className="ai-settings-field">
                <span>Header</span>
                <textarea
                  value={custom.headers}
                  onChange={event => setCustom(previous => ({ ...previous, headers: event.target.value }))}
                  rows={3}
                  spellCheck="false"
                  placeholder="{}"
                />
              </label>
              <label className="ai-settings-field">
                <span>Body</span>
                <textarea
                  value={custom.body}
                  onChange={event => setCustom(previous => ({ ...previous, body: event.target.value }))}
                  rows={6}
                  spellCheck="false"
                  placeholder="{}"
                />
              </label>
              <button type="button" className="ai-settings-confirm" onClick={connectProvider} disabled={isConnecting}>
                {isConnecting ? <IconLoader size={14} /> : '확인'}
              </button>
            </div>
          ) : (
            <div className="ai-settings-fields">
              <label className="ai-settings-field">
                <span>API key</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={event => {
                    setApiKey(event.target.value)
                    setConnectionState('idle')
                    setModels([])
                    setSelectedModel('')
                    setError('')
                  }}
                  placeholder="sk-..."
                  autoComplete="off"
                />
              </label>
              <div className="ai-settings-connect-row">
                {selectedProvider.keyUrl && (
                  <a href={selectedProvider.keyUrl} target="_blank" rel="noreferrer" className="ai-settings-key-link">
                    <IconLink size={13} />
                    <span>API key 발급</span>
                  </a>
                )}
                <button type="button" className="ai-settings-connect" onClick={connectProvider} disabled={isConnecting || !apiKey.trim()}>
                  {isConnecting ? <IconLoader size={14} /> : connectionState === 'connected' ? '연결됨' : '연결'}
                </button>
              </div>

              {connectionState === 'connected' && models.length > 0 && (
                <label className="ai-settings-field ai-settings-model-select">
                  <span>모델</span>
                  <select value={selectedModel} onChange={event => setSelectedModel(event.target.value)}>
                    {models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
                  </select>
                </label>
              )}

              <button type="button" className="ai-settings-confirm" onClick={applySettings} disabled={connectionState !== 'connected' || !selectedModel}>
                확인
              </button>
            </div>
          )}

          {error && <p className="ai-settings-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}
