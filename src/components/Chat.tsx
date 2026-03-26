import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  userId: string
  userName: string
  text: string
  timestamp: Date
}

export function Chat({ socket, userId, sessionId }: any) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    setUserName(userId?.substring(0, 8) || 'User')
  }, [userId])

  useEffect(() => {
    if (!socket) return

    socket.on('chat-message', (message: Message) => {
      setMessages(prev => [...prev, message])
    })

    return () => {
      socket.off('chat-message')
    }
  }, [socket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!inputText.trim()) return

    const message: Message = {
      id: Date.now().toString(),
      userId,
      userName: userName,
      text: inputText,
      timestamp: new Date()
    }

    socket.emit('chat-message', { sessionId, message })
    setInputText('')
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const msgDate = new Date(date)
    if (msgDate.toDateString() === now.toDateString()) {
      return 'Today'
    }
    return msgDate.toLocaleDateString()
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="bg-gray-700 p-3 sm:p-4 border-b border-gray-600">
        <h3 className="text-white font-semibold text-sm sm:text-base">💬 Chat</h3>
        <p className="text-gray-400 text-xs mt-1 hidden sm:block">Discuss and share ideas</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        )}
        {messages.map((msg, index) => {
          const showDate = index === 0 || new Date(msg.timestamp).toDateString() !== new Date(messages[index - 1]?.timestamp).toDateString()
          const isOwnMessage = msg.userId === userId
          
          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                    {formatDate(msg.timestamp)}
                  </span>
                </div>
              )}
              <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg p-2 sm:p-3 ${
                    isOwnMessage
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-200'
                  }`}
                >
                  {!isOwnMessage && (
                    <p className="text-xs font-semibold mb-1 text-blue-300">
                      {msg.userName}
                    </p>
                  )}
                  <p className="text-sm break-words">{msg.text}</p>
                  <p className={`text-xs mt-1 ${isOwnMessage ? 'text-blue-200' : 'text-gray-400'}`}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-3 sm:p-4 border-t border-gray-700">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-3 sm:px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-lg transition text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}