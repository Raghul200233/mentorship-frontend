import { useEffect, useState, useRef } from 'react';
import io, { Socket } from 'socket.io-client';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'https://mentorship-backend-tvcf.onrender.com';

// Wake the Render free-tier backend before opening the socket.
// Returns true when the health endpoint responds OK (or after max retries).
async function wakeBackend(maxWaitMs = 75_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BACKEND_URL}/health`, {
        // short per-request timeout so we loop fast
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) return true;
    } catch {
      // still waking — wait and retry
    }
    await new Promise(r => setTimeout(r, 3_000));
  }
  return false;
}

export const useSocket = (sessionId: string, userId: string) => {
  const [socket, setSocket]       = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isWaking, setIsWaking]   = useState(false);   // true while ping-warming the backend
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!sessionId || !userId) return;

    let cancelled = false;

    const connect = async () => {
      // ── 1. Wake the backend (important on Render free tier) ──────────────
      setIsWaking(true);
      console.log('[Socket] Pinging backend to wake it…');
      const alive = await wakeBackend();
      if (cancelled) return;
      setIsWaking(false);

      if (!alive) {
        console.error('[Socket] Backend did not respond after 75 s — giving up');
        return;
      }
      console.log('[Socket] Backend is awake — connecting socket.io');

      // ── 2. Connect socket.io ──────────────────────────────────────────────
      const newSocket = io(BACKEND_URL, {
        query: { sessionId, userId },
        // polling first — more reliable through proxies/firewalls.
        // socket.io will automatically upgrade to WebSocket if possible.
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2_000,
        reconnectionDelayMax: 10_000,
        timeout: 60_000,          // 60 s to accommodate slow cold starts
      });

      socketRef.current = newSocket;

      newSocket.on('connect', () => {
        console.log('✅ Socket connected —', newSocket.id);
        setIsConnected(true);
      });

      newSocket.on('connect_error', (err) => {
        console.warn('[Socket] connect_error:', err.message);
        setIsConnected(false);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('[Socket] disconnected:', reason);
        setIsConnected(false);
      });

      if (!cancelled) setSocket(newSocket);
    };

    connect();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [sessionId, userId]);

  return { socket, isConnected, isWaking };
};