function sortByDateThenTime(a, b) {
  const dateA = a.date || ''
  const dateB = b.date || ''
  // 날짜 없는 항목은 뒤로 (날짜 있는 항목이 먼저 → 낮은 번호)
  if (!dateA && dateB) return 1
  if (dateA && !dateB) return -1
  if (dateA !== dateB) return dateA.localeCompare(dateB)
  const timeA = a.time || ''
  const timeB = b.time || ''
  return timeA.localeCompare(timeB)
}

/**
 * Assigns sequential numbers to items that have lat/lng.
 * Dated items (ascending) → 1, 2, 3 ... then undated items.
 */
export function computeNumberedItems(items) {
  const withCoords = items
    .filter(item => item.lat != null && item.lng != null)
    .sort(sortByDateThenTime)

  const numberMap = new Map()
  withCoords.forEach((item, index) => {
    numberMap.set(item.id, index + 1)
  })

  return items.map(item => ({
    ...item,
    markerNumber: numberMap.get(item.id) ?? null,
  }))
}

/**
 * Returns only items with coordinates, sorted by date then time.
 * Used for polyline rendering order.
 */
export function getSortedMarkerItems(items) {
  return items
    .filter(item => item.lat != null && item.lng != null)
    .sort(sortByDateThenTime)
}
