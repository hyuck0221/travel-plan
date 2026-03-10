import { useEffect, useRef, useState } from 'react'
import SearchBar from './SearchBar'
import { getSortedMarkerItems } from '../../utils/markerNumbers'
import { IconLocation } from '../Icons'

function createMarkerIcon(number, active = false) {
  const fill = active ? '#f97316' : '#4F9CF9'
  const textFill = active ? '#f97316' : '#4F9CF9'
  const svg = `
    <svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 28 16 28S32 26 32 16C32 7.163 24.837 0 16 0z"
        fill="${fill}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="10" fill="white"/>
      <text x="16" y="21" text-anchor="middle" font-size="12" font-weight="bold"
        fill="${textFill}" font-family="Arial,sans-serif">${number}</text>
    </svg>`
  return {
    content: svg,
    size: new window.naver.maps.Size(32, 44),
    anchor: new window.naver.maps.Point(16, 44),
  }
}

function createStackedMarkerIcon(numbers, active = false) {
  const fill = active ? '#f97316' : '#4F9CF9'
  const count = numbers.length
  const label = count === 2
    ? `${numbers[0]}·${numbers[1]}`
    : `${numbers[0]}+${count - 1}`
  // Wider pin (38px) with double stroke to signal "multiple items"
  const svg = `
    <svg width="38" height="44" viewBox="0 0 38 44" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 0C10.163 0 3 7.163 3 16c0 10 16 28 16 28S35 26 35 16C35 7.163 27.837 0 19 0z"
        fill="${fill}" stroke="white" stroke-width="3"/>
      <path d="M19 0C10.163 0 3 7.163 3 16c0 10 16 28 16 28S35 26 35 16C35 7.163 27.837 0 19 0z"
        fill="none" stroke="${fill}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.6"/>
      <circle cx="19" cy="16" r="11" fill="white"/>
      <text x="19" y="21" text-anchor="middle" font-size="10" font-weight="bold"
        fill="${fill}" font-family="Arial,sans-serif">${label}</text>
    </svg>`
  return {
    content: svg,
    size: new window.naver.maps.Size(38, 44),
    anchor: new window.naver.maps.Point(19, 44),
  }
}

const PREVIEW_SVG = `
  <svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 28 16 28S32 26 32 16C32 7.163 24.837 0 16 0z"
      fill="#64748b" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="6" fill="white"/>
    <circle cx="16" cy="16" r="3" fill="#64748b"/>
  </svg>`

function parseReverseGeocode(response) {
  const results = response.v2?.results || []
  for (const r of results) {
    if (r.name === 'roadaddr') {
      const { region: g = {}, land: l = {} } = r
      const parts = [g.area1?.name, g.area2?.name, l.name, l.number1 && (l.number2 ? `${l.number1}-${l.number2}` : l.number1)].filter(Boolean)
      const address = parts.join(' ')
      const buildingName = l.addition0?.type === 'building' && l.addition0?.value ? l.addition0.value : null
      return { name: buildingName || address, address }
    }
  }
  for (const r of results) {
    if (r.name === 'addr') {
      const { region: g = {}, land: l = {} } = r
      const parts = [g.area1?.name, g.area2?.name, g.area3?.name, l.number1 && (l.number2 ? `${l.number1}-${l.number2}` : l.number1)].filter(Boolean)
      const address = parts.join(' ')
      return { name: address, address }
    }
  }
  return { name: '', address: '' }
}

function buildStackedInfoWindowContent(group, onSelect, onClose) {
  const F = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif`
  const esc = s => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  window.__stackedSelectItem = onSelect
  window.__stackedClosePopup = onClose
  const rows = group.map(item => `
    <div onclick="window.__stackedSelectItem('${item.id}')"
      style="padding:7px 8px;cursor:pointer;border-radius:6px;display:flex;align-items:center;gap:8px;"
      onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
      <span style="min-width:22px;height:22px;background:#4F9CF9;color:white;border-radius:50%;
        display:inline-flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:700;flex-shrink:0;">${item.markerNumber}</span>
      <div style="min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#1a1a2e;white-space:nowrap;
          overflow:hidden;text-overflow:ellipsis;">${esc(item.destination || '장소 미지정')}</div>
        ${item.date || item.time ? `<div style="font-size:11px;color:#64748b;">${[item.date, item.time].filter(Boolean).join(' ')}</div>` : ''}
      </div>
    </div>
  `).join('')
  return `
    <div style="background:white;border-radius:10px;padding:10px 10px 6px;
      box-shadow:0 4px 20px rgba(0,0,0,0.18);min-width:180px;max-width:240px;font-family:${F};">
      <div style="display:flex;justify-content:space-between;align-items:center;
        margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:11px;color:#64748b;">같은 위치 ${group.length}개 일정</span>
        <button onclick="window.__stackedClosePopup()"
          style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:18px;
          line-height:1;padding:0 2px;">×</button>
      </div>
      ${rows}
    </div>`
}

function buildInfoWindowContent(destination, address, onRegister, onClose) {
  const F = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif`
  const esc = s => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  window.__registerPreviewPlace = onRegister
  window.__closePreviewPlace = onClose
  return `
    <div style="background:white;border-radius:10px;padding:12px 14px;
      box-shadow:0 4px 20px rgba(0,0,0,0.18);min-width:160px;max-width:220px;
      font-family:${F};">
      ${destination ? `<div style="font-size:13px;font-weight:600;color:#1a1a2e;
        margin-bottom:${address ? '3px' : '10px'};overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap;">${esc(destination)}</div>` : ''}
      ${address ? `<div style="font-size:11px;color:#64748b;margin-bottom:10px;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(address)}</div>` : ''}
      <div style="display:flex;gap:6px;">
        <button onclick="window.__registerPreviewPlace()"
          style="flex:1;padding:8px 0;background:#4F9CF9;color:white;border:none;
          border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;font-family:${F};">
          일정 등록
        </button>
        <button onclick="window.__closePreviewPlace()"
          style="padding:8px 10px;background:#f1f5f9;color:#64748b;border:none;
          border-radius:6px;font-size:13px;cursor:pointer;font-family:${F};">
          취소
        </button>
      </div>
    </div>`
}

export default function MapPanel({ items, activeItemId, onMarkerClick, onRegisterPlace, tracking, onToggleTracking, isLocked }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const polylinesRef = useRef([])
  const initializedRef = useRef(false)
  const itemsRef = useRef(items)
  const previewMarkerRef = useRef(null)
  const previewInfoWindowRef = useRef(null)
  const stackedInfoWindowRef = useRef(null)
  const locationMarkerRef = useRef(null)
  const watchIdRef = useRef(null)
  const onRegisterRef = useRef(onRegisterPlace)
  const isLockedRef = useRef(isLocked)

  useEffect(() => { onRegisterRef.current = onRegisterPlace }, [onRegisterPlace])
  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => {
    isLockedRef.current = isLocked
    if (isLocked) setPreviewPlace(null)
  }, [isLocked])

  const [previewPlace, setPreviewPlace] = useState(null)

  // 지도 컨테이너 크기 변경 감지 → 지도 리사이즈 트리거 (같이보기 전환 대응)
  useEffect(() => {
    if (!mapRef.current) return
    const observer = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        window.naver.maps.Event.trigger(mapInstanceRef.current, 'resize')
      }
    })
    observer.observe(mapRef.current)
    return () => observer.disconnect()
  }, [])

  // Initialize map
  useEffect(() => {
    const tryInit = () => {
      if (!window.naver?.maps || initializedRef.current) return
      initializedRef.current = true

      const map = new window.naver.maps.Map(mapRef.current, {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 12,
        mapTypeId: window.naver.maps.MapTypeId.NORMAL,
      })
      mapInstanceRef.current = map

      // 초기 위치: 일정 좌표 → 현재 위치 → 서울 기본
      const coordItems = itemsRef.current.filter(i => i.lat != null && i.lng != null)
      if (coordItems.length === 1) {
        map.setCenter(new window.naver.maps.LatLng(coordItems[0].lat, coordItems[0].lng))
        map.setZoom(14)
      } else if (coordItems.length > 1) {
        const lats = coordItems.map(i => i.lat)
        const lngs = coordItems.map(i => i.lng)
        const sw = new window.naver.maps.LatLng(Math.min(...lats), Math.min(...lngs))
        const ne = new window.naver.maps.LatLng(Math.max(...lats), Math.max(...lngs))
        map.fitBounds(new window.naver.maps.LatLngBounds(sw, ne), { top: 80, right: 30, bottom: 30, left: 30 })
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.setCenter(new window.naver.maps.LatLng(coords.latitude, coords.longitude))
              mapInstanceRef.current.setZoom(13)
            }
          },
          () => {} // 권한 없으면 서울 기본 유지
        )
      }

      // Map click → close stacked popup + preview pin with reverse geocode
      window.naver.maps.Event.addListener(map, 'click', (e) => {
        if (stackedInfoWindowRef.current) {
          stackedInfoWindowRef.current.close()
          stackedInfoWindowRef.current = null
        }
        if (isLockedRef.current) return

        const lat = e.coord.lat()
        const lng = e.coord.lng()

        if (window.naver.maps.Service?.reverseGeocode) {
          window.naver.maps.Service.reverseGeocode(
            {
              coords: new window.naver.maps.LatLng(lat, lng),
              orders: [
                window.naver.maps.Service.OrderType.ROAD_ADDR,
                window.naver.maps.Service.OrderType.ADDR,
              ].join(','),
            },
            (status, response) => {
              let name = '', address = ''
              if (status === window.naver.maps.Service.Status.OK) {
                ;({ name, address } = parseReverseGeocode(response))
              }
              setPreviewPlace({ lat, lng, destination: name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, address })
            }
          )
        } else {
          setPreviewPlace({ lat, lng, destination: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, address: '' })
        }
      })
    }

    if (window.naver?.maps) {
      tryInit()
    } else {
      const interval = setInterval(() => {
        if (window.naver?.maps) { clearInterval(interval); tryInit() }
      }, 100)
      return () => clearInterval(interval)
    }
  }, [])

  // Preview pin + InfoWindow
  useEffect(() => {
    if (previewMarkerRef.current) { previewMarkerRef.current.setMap(null); previewMarkerRef.current = null }
    if (previewInfoWindowRef.current) { previewInfoWindowRef.current.close(); previewInfoWindowRef.current = null }
    delete window.__registerPreviewPlace
    delete window.__closePreviewPlace

    if (!previewPlace || !mapInstanceRef.current) return

    const marker = new window.naver.maps.Marker({
      position: new window.naver.maps.LatLng(previewPlace.lat, previewPlace.lng),
      map: mapInstanceRef.current,
      icon: { content: PREVIEW_SVG, size: new window.naver.maps.Size(32, 44), anchor: new window.naver.maps.Point(16, 44) },
      zIndex: 200,
    })
    previewMarkerRef.current = marker

    const content = buildInfoWindowContent(
      previewPlace.destination,
      previewPlace.address,
      () => { onRegisterRef.current(previewPlace); setPreviewPlace(null) },
      () => setPreviewPlace(null)
    )

    const infoWindow = new window.naver.maps.InfoWindow({
      content,
      borderWidth: 0,
      backgroundColor: 'transparent',
      disableAnchor: false,
      anchorSize: new window.naver.maps.Size(12, 12),
      anchorColor: 'white',
      pixelOffset: new window.naver.maps.Point(0, -8),
    })
    infoWindow.open(mapInstanceRef.current, marker)
    previewInfoWindowRef.current = infoWindow

    return () => { delete window.__registerPreviewPlace; delete window.__closePreviewPlace }
  }, [previewPlace])

  // Markers + polylines
  useEffect(() => {
    if (!mapInstanceRef.current) return
    markersRef.current.forEach(m => m.setMap(null)); markersRef.current = []
    polylinesRef.current.forEach(p => p.setMap(null)); polylinesRef.current = []
    if (stackedInfoWindowRef.current) { stackedInfoWindowRef.current.close(); stackedInfoWindowRef.current = null }
    delete window.__stackedSelectItem
    delete window.__stackedClosePopup

    // Group items by coordinate to detect overlapping pins
    const groups = {}
    items.forEach(item => {
      if (item.lat == null || item.lng == null || item.markerNumber == null) return
      const key = `${Number(item.lat).toFixed(6)},${Number(item.lng).toFixed(6)}`
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })

    Object.values(groups).forEach(group => {
      const pos = new window.naver.maps.LatLng(group[0].lat, group[0].lng)
      const isActive = group.some(item => item.id === activeItemId)

      if (group.length === 1) {
        const item = group[0]
        const marker = new window.naver.maps.Marker({
          position: pos,
          map: mapInstanceRef.current,
          icon: createMarkerIcon(item.markerNumber, item.id === activeItemId),
          title: item.destination || '',
          zIndex: item.id === activeItemId ? 100 : 10,
        })
        window.naver.maps.Event.addListener(marker, 'click', () => onMarkerClick(item.id))
        markersRef.current.push(marker)
      } else {
        // Overlapping pins: show stacked marker with popup on click
        const numbers = group.map(i => i.markerNumber)
        const marker = new window.naver.maps.Marker({
          position: pos,
          map: mapInstanceRef.current,
          icon: createStackedMarkerIcon(numbers, isActive),
          zIndex: isActive ? 100 : 15,
        })
        window.naver.maps.Event.addListener(marker, 'click', () => {
          if (stackedInfoWindowRef.current) { stackedInfoWindowRef.current.close(); stackedInfoWindowRef.current = null }
          const content = buildStackedInfoWindowContent(
            group,
            (id) => {
              if (stackedInfoWindowRef.current) { stackedInfoWindowRef.current.close(); stackedInfoWindowRef.current = null }
              onMarkerClick(id)
            },
            () => {
              if (stackedInfoWindowRef.current) { stackedInfoWindowRef.current.close(); stackedInfoWindowRef.current = null }
            }
          )
          const iw = new window.naver.maps.InfoWindow({
            content,
            borderWidth: 0,
            backgroundColor: 'transparent',
            disableAnchor: false,
            anchorSize: new window.naver.maps.Size(12, 12),
            anchorColor: 'white',
            pixelOffset: new window.naver.maps.Point(0, -8),
          })
          iw.open(mapInstanceRef.current, marker)
          stackedInfoWindowRef.current = iw
        })
        markersRef.current.push(marker)
      }
    })

    const sorted = getSortedMarkerItems(items)
    if (sorted.length >= 2) {
      const polyline = new window.naver.maps.Polyline({
        path: sorted.map(i => new window.naver.maps.LatLng(i.lat, i.lng)),
        map: mapInstanceRef.current,
        strokeColor: '#4F9CF9', strokeWeight: 2, strokeOpacity: 0.7,
      })
      polylinesRef.current.push(polyline)
    }
  }, [items, activeItemId, onMarkerClick])

  // Pan to active item
  useEffect(() => {
    if (!mapInstanceRef.current || !activeItemId) return
    const item = items.find(i => i.id === activeItemId)
    if (item?.lat != null && item?.lng != null) {
      mapInstanceRef.current.panTo(new window.naver.maps.LatLng(item.lat, item.lng))
    }
  }, [activeItemId, items])

  // Location tracking
  useEffect(() => {
    if (!tracking) {
      if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null }
      if (locationMarkerRef.current) { locationMarkerRef.current.setMap(null); locationMarkerRef.current = null }
      return
    }

    if (!navigator.geolocation) { onToggleTracking(false); return }

    const dot = `<div style="width:14px;height:14px;position:relative;">
      <div style="position:absolute;inset:0;background:#ef4444;border-radius:50%;
        border:2.5px solid white;box-shadow:0 1px 6px rgba(239,68,68,0.6);"></div>
    </div>`

    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        if (!mapInstanceRef.current) return
        const pos = new window.naver.maps.LatLng(lat, lng)
        if (locationMarkerRef.current) {
          locationMarkerRef.current.setPosition(pos)
        } else {
          locationMarkerRef.current = new window.naver.maps.Marker({
            position: pos,
            map: mapInstanceRef.current,
            icon: { content: dot, size: new window.naver.maps.Size(14, 14), anchor: new window.naver.maps.Point(7, 7) },
            zIndex: 300,
          })
          mapInstanceRef.current.panTo(pos)
        }
      },
      () => onToggleTracking(false),
      { enableHighAccuracy: true, maximumAge: 3000 }
    )

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [tracking])

  const handleSelectPlace = ({ lat, lng, destination, address }) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo(new window.naver.maps.LatLng(lat, lng))
      mapInstanceRef.current.setZoom(15)
    }
    if (!isLocked) {
      setPreviewPlace({ lat, lng, destination, address })
    }
  }

  return (
    <div className="map-panel">
      <SearchBar onSelectPlace={handleSelectPlace} />
      <div id="naver-map" ref={mapRef} />
      <div className="map-controls map-controls--desktop">
        <button
          className={`map-control-btn${tracking ? ' map-control-btn--active' : ''}`}
          onClick={() => onToggleTracking(v => !v)}
          title={tracking ? '현위치 표시 끄기' : '현위치 표시'}
        >
          <IconLocation size={18} />
        </button>
      </div>
    </div>
  )
}
