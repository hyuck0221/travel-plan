function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasCoordinate(value) {
  return value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value))
}

function hasValidCoordinates(lat, lng) {
  return hasCoordinate(lat) && hasCoordinate(lng)
}

/**
 * Builds a stable Naver Map link without combining a place name and full address
 * into one exact-match search query.
 */
export function buildNaverMapUrl({ destination, address, lat, lng } = {}) {
  const placeQuery = cleanText(destination) || cleanText(address)
  const hasCoordinates = hasValidCoordinates(lat, lng)

  if (placeQuery) {
    const searchUrl = `https://map.naver.com/p/search/${encodeURIComponent(placeQuery)}`
    if (!hasCoordinates) return searchUrl

    // Naver Map's c parameter is longitude, latitude, zoom and map state.
    return `${searchUrl}?c=${Number(lng)},${Number(lat)},15,0,0,0,dh`
  }

  if (hasCoordinates) {
    return `https://map.naver.com/p/?c=${Number(lng)},${Number(lat)},17,0,0,0,dh`
  }

  return ''
}
