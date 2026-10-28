import { useEffect, useRef } from 'react'

// Confirmation for destructive actions, on the native <dialog> (focus trap, Esc, backdrop).
// request: {title, body, action} or null. onClose(true) confirms; Esc, Cancel or a click
// outside call onClose(false). Cancel has the focus, so Enter never deletes by accident.
export default function Confirm({ request, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const d = ref.current
    if (request && !d.open) d.showModal()
    if (!request && d.open) d.close()
  }, [request])

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onClose={() => onClose(false)}
      onClick={(e) => e.target === ref.current && onClose(false)}
    >
      {request && (
        <div className="confirm-box">
          <h2 id="confirm-title">{request.title}</h2>
          <p id="confirm-body">{request.body}</p>
          <div className="confirm-actions">
            <button className="btn" autoFocus onClick={() => onClose(false)}>
              Cancel
            </button>
            <button className="btn danger" onClick={() => onClose(true)}>
              {request.action}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
