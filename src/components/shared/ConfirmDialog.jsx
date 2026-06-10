import Modal from './Modal.jsx'

export default function ConfirmDialog({ title, message, confirmLabel = '확인', danger = false, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} maxWidth={400}>
      <p className="confirm-message">{message}</p>
      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={onCancel}>취소</button>
        <button type="button" className={danger ? 'modal-submit modal-submit-danger' : 'modal-submit'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
