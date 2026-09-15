import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNaverMapUrl } from './naverMapUrl.js'

test('searches Naver Map by the selected place name and uses coordinates only for centering', () => {
  assert.equal(
    buildNaverMapUrl({
      destination: '삼성역 2호선',
      address: '서울특별시 강남구 테헤란로 538',
      lat: 37.5088643,
      lng: 127.0631622,
    }),
    'https://map.naver.com/p/search/%EC%82%BC%EC%84%B1%EC%97%AD%202%ED%98%B8%EC%84%A0?c=127.0631622,37.5088643,15,0,0,0,dh',
  )
})

test('uses the address when the place name is empty', () => {
  assert.equal(
    buildNaverMapUrl({ address: '서울특별시 중구 세종대로 110' }),
    'https://map.naver.com/p/search/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C%20%EC%A4%91%EA%B5%AC%20%EC%84%B8%EC%A2%85%EB%8C%80%EB%A1%9C%20110',
  )
})

test('opens the coordinate center when only coordinates are available', () => {
  assert.equal(
    buildNaverMapUrl({ lat: 37.5088643, lng: 127.0631622 }),
    'https://map.naver.com/p/?c=127.0631622,37.5088643,17,0,0,0,dh',
  )
})

test('returns no link when the itinerary has no map target', () => {
  assert.equal(buildNaverMapUrl({ destination: '   ', address: '' }), '')
})
