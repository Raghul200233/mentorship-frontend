import { useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';

export const useSocket = (sessionId: string, userId: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId || !userId) return;

    // Use the correct backend URL
    const backendUrl = 'https://mentorship-backend-tvcf.onrender.com';
    
    console.log('Connecting to socket server:', backendUrl);
    
    const newSocket = io(backendUrl, {
      query: { sessionId, userId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket connected');
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

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
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