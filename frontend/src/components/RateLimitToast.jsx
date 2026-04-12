import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const toasts = [];
let addToastGlobal = null;

/**
 * Show a global rate-limit toast notification.
 * Called from the API interceptor.
 */
export function showRateLimitToast(message) {
  if (addToastGlobal) {
    addToastGlobal(message);
  }
}

export default function RateLimitToast() {
  const [active, setActive] = useState([]);

  const addToast = useCallback((message) => {
    const id = Date.now() + Math.random();
    setActive((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setActive((prev) => prev.filter((t) => t.id !== id));
    }, 8000);
  }, []);

  useEffect(() => {
    addToastGlobal = addToast;
    return () => { addToastGlobal = null; };
  }, [addToast]);

  if (active.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {active.map((t) => (
        <div
          key={t.id}
          className="bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 animate-slide-in"
        >
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm font-medium">{t.message}</div>
          <button
            onClick={() => setActive((prev) => prev.filter((x) => x.id !== t.id))}
            className="flex-shrink-0 hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
