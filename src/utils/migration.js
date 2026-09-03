import { encodeState } from './urlEncoder.js'

export const LEGACY_HOST = 'travel.hspace.site'
export const MIGRATION_HOST = 'travelink.hshim.dev'

// The migration notice is required through the end of September 23, 2026 (KST).
export const MIGRATION_DEADLINE = '2026-09-23T23:59:59.999+09:00'
export const MIGRATION_DEADLINE_LABEL = '9월 23일'

// Keep the legacy key so saved Travelink data remains available during migration.
const STORAGE_KEY = 'travel-plans'

export function isLegacyHost(location = globalThis.location) {
  return location?.hostname?.toLowerCase() === LEGACY_HOST
}

export function isMigrationActive(now = new Date()) {
  return new Date(now).getTime() <= new Date(MIGRATION_DEADLINE).getTime()
}

export function hasPlanData(plan) {
  if (!plan || typeof plan !== 'object') return false
  return Boolean(
    (typeof plan.title === 'string' && plan.title.trim()) ||
    (Array.isArray(plan.items) && plan.items.length > 0),
  )
}

export function loadStoredPlans(storage = globalThis.localStorage) {
  try {
    const plans = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(plans) ? plans : []
  } catch {
    return []
  }
}

export function getMigrationContext({
  location = globalThis.location,
  storage = globalThis.localStorage,
  now = new Date(),
  originalUrl,
} = {}) {
  const sourceUrl = originalUrl || location?.href || ''
  let hasHash = false
  try {
    hasHash = Boolean(new URL(sourceUrl, `https://${LEGACY_HOST}`).hash)
  } catch {}

  const hasVisited = Boolean(storage?.getItem('hasVisited'))
  const hasStoredData = loadStoredPlans(storage).some(hasPlanData)
  const shouldShowLanding = !hasVisited && !hasHash && !hasStoredData
  const active = isLegacyHost(location) && isMigrationActive(now)

  return {
    active,
    hasHash,
    hasVisited,
    hasStoredData,
    shouldShowLanding,
    shouldAutoRedirect: active && shouldShowLanding,
    sourceUrl,
  }
}

export function getMigratedDomainUrl(sourceUrl = globalThis.location?.href) {
  const url = new URL(sourceUrl)
  url.protocol = 'https:'
  url.hostname = MIGRATION_HOST
  url.port = ''
  return url.toString()
}

export async function buildMigratedPlanUrl(plan, sourceUrl = globalThis.location?.href) {
  const url = new URL(getMigratedDomainUrl(sourceUrl))
  const params = new URLSearchParams(url.search)

  if (plan?.locked) params.set('locked', '1')
  else params.delete('locked')

  url.search = params.toString() ? `?${params.toString()}` : ''
  url.hash = await encodeState({
    id: plan?.id,
    title: plan?.title || '',
    items: Array.isArray(plan?.items) ? plan.items : [],
  })

  if (!url.hash) throw new Error('일정 링크를 만들 수 없습니다.')
  return url.toString()
}
