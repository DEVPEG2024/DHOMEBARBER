import { useState, useEffect, useRef } from 'react';
import { API_SERVER_URL } from '@/api/apiClient';

const WS_URL = API_SERVER_URL.replace(/^http/, 'ws') + '/ws/live';

export function useLiveCount() {
  const [count, setCount] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    let reconnectTimer;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'live_count') setCount(data.count);
        } catch {}
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return count;
}
