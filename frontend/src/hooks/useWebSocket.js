import { useEffect, useRef, useCallback } from 'react';

/**
 * useWebSocket — connects to the VajraKavach WebSocket for real-time messaging events.
 * Automatically reconnects with exponential backoff on disconnect.
 * Auth is handled via httpOnly cookies (sent automatically by the browser).
 *
 * @param {Function} onEvent - callback invoked with parsed JSON event objects
 * @returns {{ connected: boolean }}
 */
export default function useWebSocket(onEvent) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const backoffMs = useRef(1000);
  const connectedRef = useRef(false);
  const pingInterval = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    // Clean up any previous connection
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      connectedRef.current = true;
      backoffMs.current = 1000; // reset backoff on success
      // Keep-alive ping every 30s
      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 30000);
    };

    ws.onmessage = (e) => {
      if (e.data === 'pong') return; // keep-alive response
      try {
        const event = JSON.parse(e.data);
        onEventRef.current?.(event);
      } catch {}
    };

    ws.onclose = (e) => {
      connectedRef.current = false;
      if (pingInterval.current) clearInterval(pingInterval.current);
      // Don't reconnect if auth failed (4001/4003)
      if (e.code === 4001 || e.code === 4003) return;
      // Exponential backoff reconnect (max 30s)
      reconnectTimer.current = setTimeout(() => {
        backoffMs.current = Math.min(backoffMs.current * 2, 30000);
        connect();
      }, backoffMs.current);
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (pingInterval.current) clearInterval(pingInterval.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
    };
  }, [connect]);

  return { connected: connectedRef.current };
}
