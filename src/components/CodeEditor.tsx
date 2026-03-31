import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import MonacoEditor from '@monaco-editor/react'

// Language configurations
const LANGUAGE_CONFIGS = {
  javascript: { language: 'javascript', name: 'JavaScript' },
  python: { language: 'python', name: 'Python' },
  c: { language: 'c', name: 'C' },
  cpp: { language: 'cpp', name: 'C++' },
  java: { language: 'java', name: 'Java' },
  html: { language: 'html', name: 'HTML' },
  css: { language: 'css', name: 'CSS' },
  typescript: { language: 'typescript', name: 'TypeScript' },
  sql: { language: 'sql', name: 'SQL' },
  go: { language: 'go', name: 'Go' },
  rust: { language: 'rust', name: 'Rust' },
  php: { language: 'php', name: 'PHP' },
  ruby: { language: 'ruby', name: 'Ruby' },
  swift: { language: 'swift', name: 'Swift' },
  kotlin: { language: 'kotlin', name: 'Kotlin' },
}

const DEFAULT_CODE: Record<string, string> = {
  javascript: '// JavaScript Code\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();',
  python: '# Python Code\n\ndef hello():\n    print("Hello, World!")\n\nhello()',
  c: '// C Code\n#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}',
  cpp: '// C++ Code\n#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}',
  java: '// Java Code\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
  html: '<!-- HTML Code -->\n<!DOCTYPE html>\n<html>\n<head>\n    <title>Hello World</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>',
  css: '/* CSS Code */\nbody {\n    margin: 0;\n    padding: 20px;\n    font-family: Arial, sans-serif;\n}\n\nh1 {\n    color: #333;\n}',
  typescript: '// TypeScript Code\n\nfunction hello(name: string): void {\n    console.log(`Hello, ${name}!`);\n}\n\nhello("World");',
  sql: '-- SQL Code\nCREATE TABLE users (\n    id INT PRIMARY KEY,\n    name VARCHAR(100),\n    email VARCHAR(100)\n);\n\nSELECT * FROM users;',
  go: '// Go Code\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}',
  rust: '// Rust Code\nfn main() {\n    println!("Hello, World!");\n}',
  php: '<?php\n// PHP Code\necho "Hello, World!\\n";\n?>',
  ruby: '# Ruby Code\nputs "Hello, World!"',
  swift: '// Swift Code\nprint("Hello, World!")',
  kotlin: '// Kotlin Code\nfun main() {\n    println("Hello, World!")\n}',
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
  const yjsProviderRef = useRef<any>(null)
  const yDocRef = useRef<any>(null)
  const [syncStatus, setSyncStatus] = useState<'connected' | 'connecting' | 'offline'>('connecting')
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (yjsProviderRef.current) {
        yjsProviderRef.current.connect()
      }
    }
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('offline')
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Initialize Yjs CRDT
  useEffect(() => {
    if (!sessionId) return

    // Create Yjs document
    const ydoc = new Y.Doc()
    yDocRef.current = ydoc

    // Get the shared text type
    const ytext = ydoc.getText('codemirror')

    // Set initial content if empty
    if (ytext.toString() === '') {
      ytext.insert(0, DEFAULT_CODE[language] || DEFAULT_CODE.javascript)
    }

    // Setup WebSocket provider
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    const wsUrl = backendUrl.replace('http', 'ws').replace('https', 'wss')
    
    // Dynamically import y-monaco to avoid SSR issues
    let binding: any = null
    
    const setupBinding = async () => {
      const { MonacoBinding } = await import('y-monaco')
      
      if (editorRef.current && yDocRef.current) {
        binding = new MonacoBinding(
          ytext,
          editorRef.current.getModel(),
          new Set([editorRef.current]),
          yjsProviderRef.current?.awareness
        )
      }
    }
    
    const provider = new WebsocketProvider(
      `${wsUrl}/yjs`,
      sessionId,
      ydoc,
      { connect: isOnline }
    )
    
    yjsProviderRef.current = provider

    // Track connection status
    provider.on('status', (event: { status: string }) => {
      console.log('Yjs connection status:', event.status)
      if (event.status === 'connected') {
        setSyncStatus('connected')
        setupBinding()
      } else if (event.status === 'connecting') {
        setSyncStatus('connecting')
      }
    })

    // Store the binding reference to clean up later
    return () => {
      if (binding) {
        binding.destroy()
      }
      if (provider) {
        provider.destroy()
      }
      if (ydoc) {
        ydoc.destroy()
      }
    }
  }, [sessionId, isOnline])

  // Bind to Monaco editor when editor is ready
  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor
    
    if (yDocRef.current && yjsProviderRef.current) {
      const ytext = yDocRef.current.getText('codemirror')
      
      // Set initial content
      if (editor.getValue() === '') {
        editor.setValue(ytext.toString())
      }
      
      // Setup binding after editor is ready
      import('y-monaco').then(({ MonacoBinding }) => {
        new MonacoBinding(
          ytext,
          editor.getModel(),
          new Set([editor]),
          yjsProviderRef.current?.awareness
        )
      })
    }
  }

  // Handle language change
  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage)
    const newCode = DEFAULT_CODE[newLanguage] || DEFAULT_CODE.javascript
    
    if (yDocRef.current) {
      const ytext = yDocRef.current.getText('codemirror')
      ytext.delete(0, ytext.length)
      ytext.insert(0, newCode)
    }
    
    if (editorRef.current) {
      editorRef.current.setValue(newCode)
    }
  }

  // Update parent code state when Yjs changes
  useEffect(() => {
    if (!yDocRef.current) return
    
    const ytext = yDocRef.current.getText('codemirror')
    
    const observer = () => {
      const newCode = ytext.toString()
      setCode(newCode)
    }
    
    ytext.observe(observer)
    
    return () => {
      ytext.unobserve(observer)
    }
  }, [setCode])

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="bg-gray-800 p-3 border-b border-gray-700 flex flex-wrap justify-between items-center gap-2 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-semibold text-sm sm:text-base">✏️ Collaborative Code Editor</h3>
          <span className={`text-xs px-2 py-1 rounded ${
            syncStatus === 'connected' 
              ? 'bg-green-600' 
              : syncStatus === 'connecting' 
                ? 'bg-yellow-600' 
                : 'bg-red-600'
          } text-white`}>
            {syncStatus === 'connected' ? '🟢 Live' : syncStatus === 'connecting' ? '🟡 Connecting' : '🔴 Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2 bg-gray-700 px-3 py-1.5 rounded-lg">
          <label className="text-gray-300 text-xs sm:text-sm font-medium">Language:</label>
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-gray-800 text-white px-3 py-1 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium cursor-pointer"
          >
            {Object.entries(LANGUAGE_CONFIGS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex-1 relative">
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
            suggestOnTriggerCharacters: true,
            formatOnPaste: true,
            formatOnType: true,
            readOnly: false,
          }}
        />
        {syncStatus === 'offline' && (
          <div className="absolute bottom-4 right-4 bg-yellow-600 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
            🔌 Offline Mode - Changes will sync when online
          </div>
        )}
        {syncStatus === 'connecting' && (
          <div className="absolute bottom-4 right-4 bg-blue-600 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
            🔄 Connecting to sync server...
          </div>
        )}
      </div>
    </div>
  )
}