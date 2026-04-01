import { useState, useEffect, useRef } from 'react'

interface ChatProps {
  socket: any
  userId: string
  sessionId: string
  onClose?: () => void
  isModal?: boolean
}

export function Chat({ socket, userId, sessionId, onClose, isModal }: ChatProps) {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  // Track message IDs to deduplicate (sender gets echo back from server)
  const seenIds = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!socket) return

    const handleMessage = (msg: any) => {
      // Deduplicate by ID — sender already added it locally, server echoes it back
      if (seenIds.current.has(msg.id)) return
      seenIds.current.add(msg.id)
      setMessages(prev => [...prev, msg])
    }

    socket.on('chat-message', handleMessage)
    return () => { socket.off('chat-message', handleMessage) }
  }, [socket])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!input.trim() || !socket) return

    const msg = {
      id: Date.now(),
      userId,
      userName: userId.substring(0, 6),
      text: input.trim(),
      timestamp: new Date(),
    }

    // Mark as seen so the server echo is ignored
    seenIds.current.add(msg.id)
    // Add optimistically to local state
    setMessages(prev => [...prev, msg])
    // Send to server — server broadcasts to ALL in room (including this socket)
    socket.emit('chat-message', { message: msg })
    setInput('')
  }

  const formatTime = (date: Date) =>
    new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header */}
      <div className="bg-gray-700 px-4 py-3 border-b border-gray-600 flex items-center justify-between shrink-0">
        <h3 className="text-white font-semibold text-sm">💬 Session Chat</h3>
        {isModal && onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-gray-600 transition-colors text-lg leading-none"
            aria-label="Close chat"
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm gap-1">
            <span className="text-2xl">💬</span>
            <span>No messages yet — say hello!</span>
          </div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.userId === userId
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isOwn ? 'bg-blue-600 rounded-br-sm' : 'bg-gray-700 rounded-bl-sm'}`}>
                {!isOwn && (
                  <p className="text-xs text-blue-300 font-semibold mb-0.5">{msg.userName}</p>
                )}
                <p className="text-sm text-white break-words leading-snug">{msg.text}</p>
                <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'} text-right`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-600 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Type a message…"
            className="flex-1 px-3 py-2 bg-gray-700 text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}