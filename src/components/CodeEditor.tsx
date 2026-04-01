import { useEffect, useRef, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import MonacoEditor from '@monaco-editor/react'

const LANGUAGE_CONFIGS: Record<string, { name: string; default: string }> = {
  javascript: { name: 'JavaScript', default: '// JavaScript\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();' },
  python:     { name: 'Python',     default: '# Python\n\ndef hello():\n    print("Hello, World!")\n\nhello()' },
  html:       { name: 'HTML',       default: '<!-- HTML -->\n<h1>Hello World</h1>' },
  css:        { name: 'CSS',        default: '/* CSS */\nbody {\n  margin: 0;\n  background: #1e1e1e;\n}' },
  java:       { name: 'Java',       default: '// Java\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, World!");\n  }\n}' },
  cpp:        { name: 'C++',        default: '// C++\n#include <iostream>\n\nint main() {\n  std::cout << "Hello, World!" << std::endl;\n  return 0;\n}' },
}

interface CodeEditorProps {
  socket: any
  code: string
  setCode: (v: string) => void
  sessionId: string
  language: string
  setLanguage: (l: string) => void
}

export function CodeEditor({ socket, code, setCode, sessionId, language, setLanguage }: CodeEditorProps) {
  const editorRef       = useRef<any>(null)
  const providerRef     = useRef<WebsocketProvider | null>(null)
  const yDocRef         = useRef<Y.Doc | null>(null)
  const [syncStatus, setSyncStatus] = useState<'live' | 'connecting' | 'offline'>('connecting')

  // Prevent echo: set true while we're pushing a Yjs update into Monaco
  const applyingRemote = useRef(false)

  // ── Set up Yjs + WebsocketProvider ──────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return

    const ydoc  = new Y.Doc()
    yDocRef.current = ydoc
    const ytext = ydoc.getText('monaco')

    // Build ws URL: wss://backend.com/yjs/<sessionId>
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    const wsBase = backendUrl.replace(/^http(s?)/, 'ws$1')

    // WebsocketProvider implements the full y-websocket CRDT sync protocol:
    // state vector exchange, incremental diffs, offline queue
    const provider = new WebsocketProvider(`${wsBase}/yjs`, sessionId, ydoc, {
      connect: true,
    })
    providerRef.current = provider

    provider.on('status', (event: { status: string }) => {
      console.log('[CodeEditor] Yjs status:', event.status)
      if (event.status === 'connected')    setSyncStatus('live')
      else if (event.status === 'disconnected') setSyncStatus('offline')
      else setSyncStatus('connecting')
    })

    // ── Listen for Yjs text changes (local OR remote) ─────────────────────
    // We check the transaction origin to skip echoing local edits back
    ytext.observe((event) => {
      const isRemote = event.transaction.origin !== null &&
                       event.transaction.origin !== ydoc

      if (!isRemote) return   // local change — Monaco already has this value

      const newValue = ytext.toString()
      const editor = editorRef.current
      if (!editor) { setCode(newValue); return }

      const model = editor.getModel()
      if (!model) { setCode(newValue); return }

      // Apply using Monaco model API (preserves undo history, no cursor jump)
      applyingRemote.current = true
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: newValue }],
        () => null
      )
      applyingRemote.current = false

      setCode(newValue)
    })

    // ── Initialize content if doc is fresh ───────────────────────────────
    // Wait briefly for the server to send existing state before inserting defaults
    const initTimer = setTimeout(() => {
      if (ytext.toString() === '') {
        const defaultCode = LANGUAGE_CONFIGS[language]?.default
          ?? LANGUAGE_CONFIGS.javascript.default
        ydoc.transact(() => {
          ytext.insert(0, defaultCode)
        }, ydoc)   // origin = ydoc → treated as "local, already in Monaco" → ytext observer skips it
      }
    }, 600)

    return () => {
      clearTimeout(initTimer)
      provider.destroy()
      ydoc.destroy()
      yDocRef.current   = null
      providerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // ── Monaco onChange: user is typing → update Yjs ─────────────────────────
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value === undefined) return
    if (applyingRemote.current) return

    const ydoc = yDocRef.current
    if (!ydoc) return

    const ytext = ydoc.getText('monaco')
    if (ytext.toString() === value) return

    // Wrap in a transaction with origin = ydoc (signals "came from local editor")
    // so the observe callback above skips updating Monaco again
    ydoc.transact(() => {
      ytext.delete(0, ytext.length)
      ytext.insert(0, value)
    }, ydoc)

    setCode(value)
  }, [setCode])

  // ── Monaco mount ──────────────────────────────────────────────────────────
  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor

    const ydoc = yDocRef.current
    if (ydoc) {
      const current = ydoc.getText('monaco').toString()
      if (current) {
        applyingRemote.current = true
        editor.getModel()?.setValue(current)
        applyingRemote.current = false
        setCode(current)
      }
    }
  }, [setCode])

  // ── Language switch ───────────────────────────────────────────────────────
  const handleLanguageChange = useCallback((newLang: string) => {
    setLanguage(newLang)
    const newCode = LANGUAGE_CONFIGS[newLang]?.default ?? LANGUAGE_CONFIGS.javascript.default

    const ydoc = yDocRef.current
    if (ydoc) {
      const ytext = ydoc.getText('monaco')
      ydoc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, newCode)
      }, ydoc)   // local origin → observer skips Monaco update
    }

    applyingRemote.current = true
    editorRef.current?.getModel()?.setValue(newCode)
    applyingRemote.current = false

    setCode(newCode)
  }, [setLanguage, setCode])

  const statusColor = syncStatus === 'live' ? 'bg-green-600'
                    : syncStatus === 'offline' ? 'bg-red-600'
                    : 'bg-yellow-500'
  const statusText  = syncStatus === 'live' ? 'Live'
                    : syncStatus === 'offline' ? 'Offline'
                    : 'Connecting…'

  return (
    <div className="h-full flex flex-col bg-gray-900 relative">
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

      {/* Monaco */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language={language}
          theme="vs-dark"
          defaultValue={LANGUAGE_CONFIGS[language]?.default ?? LANGUAGE_CONFIGS.javascript.default}
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

      {/* Offline banner */}
      {syncStatus === 'offline' && (
        <div className="absolute bottom-4 right-4 bg-yellow-600 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-10">
          🔌 Offline — edits queued, will sync on reconnect
        </div>
      )}
    </div>
  )
}