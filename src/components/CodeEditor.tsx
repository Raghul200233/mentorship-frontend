import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import MonacoEditor from '@monaco-editor/react'

const LANGUAGE_CONFIGS = {
  javascript: { name: 'JavaScript' },
  python: { name: 'Python' },
  html: { name: 'HTML' },
  css: { name: 'CSS' },
  java: { name: 'Java' },
  cpp: { name: 'C++' },
}

const DEFAULT_CODE: Record<string, string> = {
  javascript: '// JavaScript Code\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();',
  python: '# Python Code\n\ndef hello():\n    print("Hello, World!")\n\nhello()',
  html: '<!-- HTML Code -->\n<h1>Hello World</h1>',
  css: '/* CSS Code */\nbody { margin: 0; padding: 20px; }',
  java: '// Java Code\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}',
  cpp: '// C++ Code\n#include <iostream>\nint main() {\n    std::cout << "Hello";\n    return 0;\n}',
}

export function CodeEditor({ socket, code, setCode, sessionId, language, setLanguage }: any) {
  const editorRef = useRef<any>(null)
  const yjsProvider = useRef<any>(null)
  const [syncStatus, setSyncStatus] = useState('connecting')
  const [isOnline, setIsOnline] = useState(navigator.onLine)

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

  useEffect(() => {
    if (!sessionId) return

    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('codemirror')
    
    if (ytext.toString() === '') {
      ytext.insert(0, DEFAULT_CODE[language] || DEFAULT_CODE.javascript)
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    const wsUrl = backendUrl.replace('http', 'ws').replace('https', 'wss')
    
    const provider = new WebsocketProvider(`${wsUrl}/yjs`, sessionId, ydoc, { connect: isOnline })
    yjsProvider.current = provider

    provider.on('status', (event: any) => {
      console.log('Yjs status:', event.status)
      setSyncStatus(event.status)
    })

    const setupBinding = async () => {
      if (editorRef.current) {
        const { MonacoBinding } = await import('y-monaco')
        new MonacoBinding(ytext, editorRef.current.getModel(), new Set([editorRef.current]), provider.awareness)
      }
    }

    provider.on('sync', setupBinding)
    setupBinding()

    const observer = () => setCode(ytext.toString())
    ytext.observe(observer)

    return () => {
      provider.destroy()
      ydoc.destroy()
    }
  }, [sessionId, isOnline])

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang)
    const newCode = DEFAULT_CODE[newLang] || DEFAULT_CODE.javascript
    setCode(newCode)
    if (editorRef.current) {
      editorRef.current.setValue(newCode)
    }
  }

  const getStatusColor = () => {
    if (syncStatus === 'connected') return 'bg-green-600'
    if (syncStatus === 'connecting') return 'bg-yellow-600'
    return 'bg-red-600'
  }

  const getStatusText = () => {
    if (syncStatus === 'connected') return 'Live'
    if (syncStatus === 'connecting') return 'Connecting'
    return isOnline ? 'Offline' : 'Offline Mode'
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="bg-gray-800 p-3 border-b flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-white text-sm font-semibold">✏️ Collaborative Code Editor</h3>
          <span className={`text-xs px-2 py-1 rounded ${getStatusColor()} text-white`}>
            {getStatusText()}
          </span>
        </div>
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="bg-gray-700 text-white px-3 py-1 rounded text-sm"
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
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            automaticLayout: true,
          }}
        />
      </div>
      {syncStatus === 'offline' && (
        <div className="absolute bottom-4 right-4 bg-yellow-600 text-white text-xs px-3 py-2 rounded shadow-lg">
          🔌 Offline - Changes will sync when online
        </div>
      )}
    </div>
  )
}