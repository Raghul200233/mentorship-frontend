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

  useEffect(() => {
    if (!socket) return

    // Only handle messages from OTHER users to avoid duplicates
    const handleMessage = (msg: any) => {
      if (msg.userId === userId) return  // skip own echoed messages
      setMessages(prev => [...prev, msg])
    }

    socket.on('chat-message', handleMessage)

    return () => {
      socket.off('chat-message', handleMessage)
    }
  }, [socket, userId])

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

    // Add to local state immediately (optimistic)
    setMessages(prev => [...prev, msg])

    // Emit to server so other participants receive it
    socket.emit('chat-message', { message: msg })
    setInput('')
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header */}
      <div className="bg-gray-700 p-3 border-b border-gray-600 flex items-center justify-between">
        <h3 className="text-white font-semibold">💬 Chat</h3>
        {isModal && onClose && (
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white hover:bg-gray-600 rounded-full w-8 h-8 flex items-center justify-center text-lg transition-colors"
            aria-label="Close chat"
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8 text-sm">No messages yet. Say hello! 👋</div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.userId === userId
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg p-2 ${isOwn ? 'bg-blue-600' : 'bg-gray-700'}`}>
                {!isOwn && (
                  <p className="text-xs text-blue-300 mb-1 font-semibold">{msg.userName}</p>
                )}
                <p className="text-sm text-white break-words">{msg.text}</p>
                <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-600">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}