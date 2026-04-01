import { useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';

export const useSocket = (sessionId: string, userId: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId || !userId) return;

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://mentorship-backend-tvcf.onrender.com';
    
    console.log('Connecting to socket server:', backendUrl);
    
    const newSocket = io(backendUrl, {
      query: { sessionId, userId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 30000,
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket connected successfully');
      setIsConnected(true);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      setIsConnected(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [sessionId, userId]);

  return { socket, isConnected };
};