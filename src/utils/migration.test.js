import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LEGACY_HOST,
  MIGRATION_HOST,
  buildMigratedPlanUrl,
  getMigratedDomainUrl,
  getMigrationContext,
  hasPlanData,
  isLegacyHost,
  isMigrationActive,
} from './migration.js'
import { decodeState } from './urlEncoder.js'

test('migration is limited to the legacy host and deadline', () => {
  assert.equal(isLegacyHost({ hostname: LEGACY_HOST }), true)
  assert.equal(isLegacyHost({ hostname: MIGRATION_HOST }), false)
  assert.equal(isMigrationActive(new Date('2026-09-23T23:59:59.999+09:00')), true)
  assert.equal(isMigrationActive(new Date('2026-09-24T00:00:00+09:00')), false)
})

test('only plans with saved content are migratable', () => {
  assert.equal(hasPlanData({ title: '', items: [] }), false)
  assert.equal(hasPlanData({ title: '부산 여행', items: [] }), true)
  assert.equal(hasPlanData({ title: '', items: [{ id: 'item-1' }] }), true)
})

test('new users on the legacy host are redirected during the migration period', () => {
  const storage = {
    getItem(key) {
      if (key === 'travel-plans') return JSON.stringify([{ title: '', items: [] }])
      return null
    },
  }
  const context = getMigrationContext({
    location: { hostname: LEGACY_HOST, href: `https://${LEGACY_HOST}/` },
    storage,
    now: new Date('2026-09-03T12:00:00+09:00'),
  })

  assert.equal(context.shouldAutoRedirect, true)
})

test('a migrated plan URL changes only the domain and keeps the plan payload', async () => {
  const sourceUrl = `https://${LEGACY_HOST}/trip?foo=bar#old-hash`
  assert.equal(
    getMigratedDomainUrl(sourceUrl),
    `https://${MIGRATION_HOST}/trip?foo=bar#old-hash`,
  )

  const plan = {
    id: '12345678-1234-1234-1234-123456789012',
    title: '제주 여행',
    locked: true,
    items: [{
      id: 'item-1',
      destination: '성산일출봉',
      address: '제주특별자치도',
      memo: '일출 시간 확인',
      date: '2026-09-03',
      time: '10:00',
      lat: null,
      lng: null,
    }],
  }

  const migratedUrl = new URL(await buildMigratedPlanUrl(plan, sourceUrl))
  const decoded = await decodeState(migratedUrl.hash.slice(1))

  assert.equal(migratedUrl.hostname, MIGRATION_HOST)
  assert.equal(migratedUrl.searchParams.get('foo'), 'bar')
  assert.equal(migratedUrl.searchParams.get('locked'), '1')
  assert.equal(decoded.title, plan.title)
  assert.equal(decoded.items[0].destination, plan.items[0].destination)
  assert.equal(decoded.items[0].memo, plan.items[0].memo)
})
