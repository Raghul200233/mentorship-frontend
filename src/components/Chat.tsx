import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  userId: string
  userName: string
  text: string
  timestamp: Date
}

interface ChatProps {
  socket: any;
  userId: string;
  sessionId: string;
  onClose?: () => void;
  isModal?: boolean;
}

export function Chat({ socket, userId, sessionId, onClose, isModal }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [userName, setUserName] = useState('User')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setUserName(userId?.substring(0, 8) || 'User')
  }, [userId])

  useEffect(() => {
    if (!socket) return

    const handleMessage = (message: Message) => {
      console.log('📨 Received message:', message)
      setMessages(prev => [...prev, message])
    }

    socket.on('chat-message', handleMessage)

    return () => {
      socket.off('chat-message', handleMessage)
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

    console.log('📤 Sending message:', message)
    socket.emit('chat-message', { sessionId, message })
    setInputText('')
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header with close button if modal */}
      <div className="bg-gray-700 p-3 border-b border-gray-600 flex justify-between items-center">
        <h3 className="text-white font-semibold text-sm">💬 Chat</h3>
        {isModal && onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-600"
          >
            ✕
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">
            No messages yet
          </div>
        )}
        {messages.map((msg) => {
          const isOwnMessage = msg.userId === userId
          
          return (
            <div key={msg.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg p-2 ${
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
          )
        })}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg text-sm"
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}