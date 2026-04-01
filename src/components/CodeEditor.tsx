import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import MonacoEditor from '@monaco-editor/react'
import { CustomWebsocketProvider, REMOTE_ORIGIN } from '@/utils/yjsProvider'

const LANGUAGE_CONFIGS: Record<string, { name: string; default: string }> = {
  javascript: { name: 'JavaScript', default: '// JavaScript\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();' },
  python:     { name: 'Python',     default: '# Python\n\ndef hello():\n    print("Hello, World!")\n\nhello()' },
  html:       { name: 'HTML',       default: '<!-- HTML -->\n<h1>Hello World</h1>' },
  css:        { name: 'CSS',        default: '/* CSS */\nbody {\n  margin: 0;\n  background: #1e1e1e;\n}' },
  java:       { name: 'Java',       default: '// Java\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, World!");\n  }\n}' },
  cpp:        { name: 'C++',        default: '// C++\n#include <iostream>\n\nint main() {\n  std::cout << "Hello, World!" << std::endl;\n  return 0;\n}' },
}

export function CodeEditor({ socket, code, setCode, sessionId, language, setLanguage }: any) {
  const editorRef = useRef<any>(null)
  const yjsProvider = useRef<CustomWebsocketProvider | null>(null)
  const yDocRef = useRef<Y.Doc | null>(null)
  const [syncStatus, setSyncStatus] = useState<'connected' | 'connecting' | 'offline'>('connecting')

  // Track whether we are currently applying a remote update to the editor
  // so handleEditorChange doesn't re-send it back to the server
  const applyingRemote = useRef(false)

  useEffect(() => {
    if (!sessionId) return

    // ── 1. Create Yjs document ──────────────────────────────────────────────
    const ydoc = new Y.Doc()
    yDocRef.current = ydoc
    const ytext = ydoc.getText('codemirror')

    // ── 2. Connect to backend Yjs WebSocket ─────────────────────────────────
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    const wsUrl = backendUrl.replace(/^http/, 'ws').replace(/^https/, 'wss')
    const provider = new CustomWebsocketProvider(wsUrl, sessionId, ydoc)
    yjsProvider.current = provider

    provider.on('status', (event: any) => {
      const s = event.status
      console.log('[CodeEditor] Yjs status:', s)
      setSyncStatus(s === 'connected' ? 'connected' : s === 'error' ? 'offline' : 'connecting')
    })

    // ── 3. Listen for remote (and initial) doc changes → update editor ──────
    ytext.observe((_event, transaction) => {
      // transaction.origin === REMOTE_ORIGIN means it came from the server
      // transaction.origin === null means it's local (from handleEditorChange)
      const newValue = ytext.toString()
      const isRemote = transaction.origin === REMOTE_ORIGIN

      if (isRemote && editorRef.current) {
        const currentValue = editorRef.current.getValue()
        if (currentValue !== newValue) {
          // Tell handleEditorChange to ignore this synthetic value change
          applyingRemote.current = true
          editorRef.current.setValue(newValue)
          applyingRemote.current = false
        }
      }

      setCode(newValue)
    })

    // ── 4. Send LOCAL updates (only) to the server ──────────────────────────
    // The Yjs 'update' event fires for every change; origin lets us pick only local ones.
    ydoc.on('update', (update: Uint8Array, origin: any) => {
      if (origin === REMOTE_ORIGIN) return   // don't echo back
      provider.sendUpdate(update)            // send local edit to peers
    })

    // ── 5. Set default content (only on fresh doc) ──────────────────────────
    // We wait a moment for the server to send initial state before inserting defaults.
    const initTimer = setTimeout(() => {
      if (ytext.toString() === '') {
        const defaultCode = LANGUAGE_CONFIGS[language]?.default ?? LANGUAGE_CONFIGS.javascript.default
        ydoc.transact(() => {
          ytext.insert(0, defaultCode)
        }) // origin = null → treated as local → sent to server → stored
      }
    }, 500)

    return () => {
      clearTimeout(initTimer)
      provider.disconnect()
      ydoc.destroy()
      yDocRef.current = null
      yjsProvider.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // ── Handle Monaco editor value changes (user is typing) ──────────────────
  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return
    if (applyingRemote.current) return   // skip — we set this value ourselves from Yjs

    const ydoc = yDocRef.current
    if (!ydoc) return

    const ytext = ydoc.getText('codemirror')
    if (ytext.toString() === value) return  // nothing changed

    // Update Yjs; origin = null (default) → 'update' observer will send it to server
    ydoc.transact(() => {
      ytext.delete(0, ytext.length)
      ytext.insert(0, value)
    })

    setCode(value)
  }

  // ── Handle Monaco mount ───────────────────────────────────────────────────
  const handleEditorMount = (editor: any) => {
    editorRef.current = editor

    if (yDocRef.current) {
      const ytext = yDocRef.current.getText('codemirror')
      const current = ytext.toString()
      if (current) {
        applyingRemote.current = true
        editor.setValue(current)
        applyingRemote.current = false
        setCode(current)
      }
    }
  }

  // ── Language switch ───────────────────────────────────────────────────────
  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang)
    const newCode = LANGUAGE_CONFIGS[newLang]?.default ?? LANGUAGE_CONFIGS.javascript.default

    const ydoc = yDocRef.current
    if (ydoc) {
      const ytext = ydoc.getText('codemirror')
      ydoc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, newCode)
      })
    }

    if (editorRef.current) {
      applyingRemote.current = true
      editorRef.current.setValue(newCode)
      applyingRemote.current = false
    }

    setCode(newCode)
  }

  const statusColor = syncStatus === 'connected' ? 'bg-green-600' : syncStatus === 'offline' ? 'bg-red-600' : 'bg-yellow-500'
  const statusText  = syncStatus === 'connected' ? 'Live' : syncStatus === 'offline' ? 'Offline' : 'Connecting'

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Toolbar */}
      <div className="bg-gray-800 px-3 py-2 border-b border-gray-700 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-semibold">✏️ Collaborative Editor</span>
          <span className={`text-xs px-2 py-0.5 rounded-full text-white font-medium ${statusColor}`}>
            {statusText}
          </span>
        </div>
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="bg-gray-700 text-white px-3 py-1 rounded text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(LANGUAGE_CONFIGS).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.name}</option>
          ))}
        </select>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
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
            lineNumbers: 'on',
            renderLineHighlight: 'all',
          }}
        />
      </div>

      {syncStatus === 'offline' && (
        <div className="absolute bottom-4 right-4 bg-yellow-600 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-10">
          🔌 Offline — changes will sync when reconnected
        </div>
      )}
    </div>
  )
}