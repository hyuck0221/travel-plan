import { IconClose } from './Icons'

export default function QRModal({ image, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>QR 코드</h2>
          <button className="modal-close" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          {image ? (
            <img
              src={image.startsWith('data:') ? image : `data:image/png;base64,${image}`}
              alt="QR Code"
              className="qr-image"
            />
          ) : (
            <div className="qr-placeholder">QR 이미지를 불러올 수 없습니다.</div>
          )}
          <p className="qr-description">QR 코드를 스캔하면 이 여행 일정을 볼 수 있습니다.</p>
        </div>
      </div>
    </div>
  )
}
