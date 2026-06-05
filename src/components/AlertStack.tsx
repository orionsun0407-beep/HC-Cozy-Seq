import type { AppAlert } from '../types';

interface AlertStackProps {
  alerts: AppAlert[];
  onDismiss: (id: string) => void;
}

export function AlertStack({ alerts, onDismiss }: AlertStackProps) {
  if (!alerts.length) return null;

  return (
    <div className="alert-stack" aria-live="polite">
      {alerts.map((alert) => (
        <div className={`alert alert--${alert.tone}`} key={alert.id} role={alert.tone === 'error' ? 'alert' : 'status'}>
          <span>{alert.message}</span>
          <button className="icon-button" type="button" onClick={() => onDismiss(alert.id)} aria-label="关闭提示">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
