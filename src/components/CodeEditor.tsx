import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import MonacoEditor from '@monaco-editor/react'
import { CustomWebsocketProvider } from '@/utils/yjsProvider'

const LANGUAGE_CONFIGS = {
  javascript: { name: 'JavaScript', default: '// JavaScript Code\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();' },
  python: { name: 'Python', default: '# Python Code\n\ndef hello():\n    print("Hello, World!")\n\nhello()' },
  html: { name: 'HTML', default: '<!-- HTML Code -->\n<h1>Hello World</h1>' },
  css: { name: 'CSS', default: '/* CSS Code */\nbody {\n    margin: 0;\n    padding: 20px;\n    background: #f0f0f0;\n}' },
  java: { name: 'Java', default: '// Java Code\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}' },
  cpp: { name: 'C++', default: '// C++ Code\n#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}' },
}

export function CodeEditor({ socket, code, setCode, sessionId, language, setLanguage }: any) {
  const editorRef = useRef<any>(null)
  const yjsProvider = useRef<any>(null)
  const yDocRef = useRef<any>(null)
  const [syncStatus, setSyncStatus] = useState('connecting')
  const [isOnline, setIsOnline] = useState(true)
  const isRemoteUpdate = useRef(false)

  // Monitor online/offline
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

  // Setup Yjs
  useEffect(() => {
    if (!sessionId) return

    // Create Yjs document
    const ydoc = new Y.Doc()
    yDocRef.current = ydoc
    const ytext = ydoc.getText('codemirror')

    // Set initial content
    const defaultCode = LANGUAGE_CONFIGS[language as keyof typeof LANGUAGE_CONFIGS]?.default || LANGUAGE_CONFIGS.javascript.default
    if (ytext.toString() === '') {
      ytext.insert(0, defaultCode)
    }

    // Setup custom WebSocket provider
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    const wsUrl = backendUrl.replace('http', 'ws').replace('https', 'wss')
    
    const provider = new CustomWebsocketProvider(wsUrl, sessionId, ydoc)
    yjsProvider.current = provider

    // Track connection status
    provider.on('status', (event: any) => {
      console.log('Yjs status:', event.status)
      setSyncStatus(event.status === 'connected' ? 'connected' : 'connecting')
    })

    // Handle Yjs changes
    const handleYjsChange = () => {
      if (!isRemoteUpdate.current && editorRef.current) {
        const newValue = ytext.toString()
        setCode(newValue)
      }
    }
    ytext.observe(handleYjsChange)

    // Send local changes to peers
    const observer = (event: any) => {
      if (isRemoteUpdate.current) return
      const update = Y.encodeStateAsUpdate(ydoc)
      provider.sendUpdate(update)
    }
    ydoc.on('update', observer)

    // Cleanup
    return () => {
      ydoc.off('update', observer)
      ytext.unobserve(handleYjsChange)
      provider.disconnect()
      ydoc.destroy()
    }
  }, [sessionId, isOnline])

  // Handle editor changes
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && yDocRef.current && !isRemoteUpdate.current) {
      isRemoteUpdate.current = true
      const ytext = yDocRef.current.getText('codemirror')
      // Update Yjs
      ytext.delete(0, ytext.length)
      ytext.insert(0, value)
      setCode(value)
      setTimeout(() => {
        isRemoteUpdate.current = false
      }, 100)
    }
  }

  // Handle editor mount
  const handleEditorMount = (editor: any) => {
    editorRef.current = editor
    
    // Set initial value
    if (yDocRef.current) {
      const ytext = yDocRef.current.getText('codemirror')
      const initialValue = ytext.toString()
      editor.setValue(initialValue)
      setCode(initialValue)
    }
  }

  // Handle language change
  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang)
    const newCode = LANGUAGE_CONFIGS[newLang as keyof typeof LANGUAGE_CONFIGS]?.default || LANGUAGE_CONFIGS.javascript.default
    
    if (yDocRef.current) {
      isRemoteUpdate.current = true
      const ytext = yDocRef.current.getText('codemirror')
      ytext.delete(0, ytext.length)
      ytext.insert(0, newCode)
      setTimeout(() => {
        isRemoteUpdate.current = false
      }, 100)
    }
    
    if (editorRef.current) {
      editorRef.current.setValue(newCode)
    }
    setCode(newCode)
  }

  const getStatusColor = () => {
    if (syncStatus === 'connected') return 'bg-green-600'
    if (syncStatus === 'connecting') return 'bg-yellow-600'
    return 'bg-red-600'
  }

  const getStatusText = () => {
    if (syncStatus === 'connected') return 'Live'
    if (syncStatus === 'connecting') return 'Connecting'
    return 'Offline'
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="bg-gray-800 p-3 border-b border-gray-700 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-white text-sm font-semibold">✏️ Collaborative Code Editor</h3>
          <span className={`text-xs px-2 py-1 rounded ${getStatusColor()} text-white`}>
            {getStatusText()}
          </span>
        </div>
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="bg-gray-700 text-white px-3 py-1 rounded text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(LANGUAGE_CONFIGS).map(([key, config]) => (
            <option key={key} value={key}>{config.name}</option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={language}
          theme="vs-dark"
          onMount={handleEditorMount}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>
      {syncStatus === 'offline' && (
        <div className="absolute bottom-4 right-4 bg-yellow-600 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-10">
          🔌 Offline Mode - Changes will sync when online
        </div>
      )}
    </div>
  )
}