import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Toast notification for rate limit (HTTP 429) errors.
 * Auto-dismisses after a configurable duration.
 */
export default function RateLimitToast({ message, retryAfter, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, (retryAfter || 5) * 1000);
    return () => clearTimeout(timeout);
  }, [retryAfter, onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 flex items-start gap-3 animate-slide-in">
      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-red-800">Rate Limit Exceeded</p>
        <p className="text-sm text-red-600 mt-1">
          {message || 'Too many requests. Please wait before trying again.'}
        </p>
        {retryAfter && (
          <p className="text-xs text-red-500 mt-1">
            Try again in {retryAfter} seconds
          </p>
        )}
      </div>
      <button
        onClick={() => { setVisible(false); onDismiss?.(); }}
        className="text-red-400 hover:text-red-600 ml-auto"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
