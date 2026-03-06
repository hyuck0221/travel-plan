import { IconPlus } from '../Icons'
import ItineraryItem from './ItineraryItem'

export default function DateSection({ date, items, activeItemId, currentItemId, onUpdate, onDelete, onItemClick, onAddItem }) {
  const dateLabel = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      })
    : '날짜 미정'

  return (
    <div className="date-section">
      <div className="date-section-header">
        <span className="date-label">{dateLabel}</span>
        <span className="date-count">{items.length}개</span>
      </div>
      <div className="date-items">
        {items.map(item => (
          <ItineraryItem
            key={item.id}
            item={item}
            isActive={activeItemId === item.id}
            isCurrent={currentItemId === item.id}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onClick={onItemClick}
          />
        ))}
      </div>
      <button className="add-item-btn" onClick={() => onAddItem(date)}>
        <IconPlus size={13} /> 일정 추가
      </button>
    </div>
  )
}
