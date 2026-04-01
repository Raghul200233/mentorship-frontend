import { useState, useEffect, useRef } from 'react'

export function Chat({ socket, userId, sessionId }: any) {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!socket) return

    const handleMessage = (msg: any) => {
      console.log('Received:', msg)
      setMessages(prev => [...prev, msg])
    }

    socket.on('chat-message', handleMessage)
    return () => {
      socket.off('chat-message', handleMessage)
    }
  }, [socket])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!input.trim()) return

    const msg = {
      id: Date.now(),
      userId,
      userName: userId.substring(0, 6),
      text: input,
      timestamp: new Date()
    }

    socket.emit('chat-message', { sessionId, message: msg })
    setMessages(prev => [...prev, msg])
    setInput('')
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="bg-gray-700 p-3 border-b border-gray-600">
        <h3 className="text-white font-semibold">💬 Chat</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">No messages yet</div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.userId === userId
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg p-2 ${isOwn ? 'bg-blue-600' : 'bg-gray-700'}`}>
                {!isOwn && <p className="text-xs text-blue-300 mb-1">{msg.userName}</p>}
                <p className="text-sm">{msg.text}</p>
                <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      
      <div className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg"
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}