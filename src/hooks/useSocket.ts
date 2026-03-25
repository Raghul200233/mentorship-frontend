import { useEffect, useState } from 'react'
import io from 'socket.io-client'

export function useSocket(sessionId: string, userId: string) {
  const [socket, setSocket] = useState<any>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!sessionId || !userId) return

    const socketInstance = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001', {
      query: { sessionId, userId }
    })

    socketInstance.on('connect', () => {
      setIsConnected(true)
      console.log('Socket connected')
    })

    socketInstance.on('disconnect', () => {
      setIsConnected(false)
      console.log('Socket disconnected')
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [sessionId, userId])

  return { socket, isConnected }
}