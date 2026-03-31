import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import MonacoEditor from '@monaco-editor/react'

// Language configurations (same as before)
const LANGUAGE_CONFIGS = {
  javascript: { language: 'javascript', name: 'JavaScript' },
  python: { language: 'python', name: 'Python' },
  // ... add all other languages
}

const DEFAULT_CODE: Record<string, string> = {
  javascript: '// JavaScript Code\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();',
  // ... add all other default codes
}

interface CodeEditorProps {
  socket: any;
  code: string;
  setCode: (code: string) => void;
  sessionId: string;
  language: string;
  setLanguage: (lang: string) => void;
}

export function CodeEditor({ socket, code, setCode, sessionId, language, setLanguage }: CodeEditorProps) {
  const editorRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const [syncStatus, setSyncStatus] = useState<'connected' | 'connecting' | 'offline'>('connecting')
  const [isOnline, setIsOnline] = useState(true)

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Setup Yjs and WebSocket
  useEffect(() => {
    if (!sessionId) return

    // Create Yjs document
    const ydoc = new Y.Doc()
    ydocRef.current = ydoc
    const ytext = ydoc.getText('codemirror')

    // Set initial content
    if (ytext.toString() === '') {
      ytext.insert(0, DEFAULT_CODE[language] || DEFAULT_CODE.javascript)
    }

    // Setup WebSocket connection
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    const wsUrl = backendUrl.replace('http', 'ws').replace('https', 'wss')
    const ws = new WebSocket(`${wsUrl}/yjs?sessionId=${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Yjs WebSocket connected')
      setSyncStatus('connected')
    }

    ws.onclose = () => {
      console.log('Yjs WebSocket disconnected')
      setSyncStatus('offline')
    }

    ws.onerror = (error) => {
      console.error('Yjs WebSocket error:', error)
      setSyncStatus('offline')
    }

    ws.onmessage = (event) => {
      // Convert blob to Uint8Array
      const reader = new FileReader()
      reader.onload = () => {
        const update = new Uint8Array(reader.result as ArrayBuffer)
        Y.applyUpdate(ydoc, update)
      }
      reader.readAsArrayBuffer(event.data)
    }

    // Observe changes and send updates
    ytext.observe(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const update = Y.encodeStateAsUpdate(ydoc)
        ws.send(update)
      }
    })

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
      ydoc.destroy()
    }
  }, [sessionId])

  // Bind to Monaco editor
  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor
    
    if (ydocRef.current) {
      const ytext = ydocRef.current.getText('codemirror')
      editor.setValue(ytext.toString())
      
      // Update parent when Yjs changes
      const updateParent = () => {
        setCode(ytext.toString())
      }
      ytext.observe(updateParent)
    }
  }

  // Handle language change
  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage)
    const newCode = DEFAULT_CODE[newLanguage] || DEFAULT_CODE.javascript
    
    if (ydocRef.current) {
      const ytext = ydocRef.current.getText('codemirror')
      ytext.delete(0, ytext.length)
      ytext.insert(0, newCode)
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="bg-gray-800 p-3 border-b border-gray-700 flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-semibold text-sm">✏️ Collaborative Code Editor</h3>
          <span className={`text-xs px-2 py-1 rounded ${
            syncStatus === 'connected' ? 'bg-green-600' : 
            syncStatus === 'connecting' ? 'bg-yellow-600' : 'bg-red-600'
          } text-white`}>
            {syncStatus === 'connected' ? '🟢 Live' : syncStatus === 'connecting' ? '🟡 Connecting' : '🔴 Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2 bg-gray-700 px-3 py-1.5 rounded-lg">
          <label className="text-gray-300 text-xs font-medium">Language:</label>
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-gray-800 text-white px-3 py-1 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer"
          >
            {Object.entries(LANGUAGE_CONFIGS).map(([key, config]) => (
              <option key={key} value={key}>{config.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={language}
          theme="vs-dark"
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  )
}