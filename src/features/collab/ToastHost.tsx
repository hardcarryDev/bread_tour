// Renders the active non-destructive toasts (SPEC-BREADTOUR-001 / NFR-CONFLICT-003).
// Presentational only: state lives in useToasts so this stays trivially testable.

import type { Toast } from './useToasts';

interface ToastHostProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export default function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="status">
          <span className="toast-message">{t.message}</span>
          <button
            type="button"
            className="link-button toast-dismiss"
            aria-label="알림 닫기"
            onClick={() => onDismiss(t.id)}
          >
            닫기
          </button>
        </div>
      ))}
    </div>
  );
}
