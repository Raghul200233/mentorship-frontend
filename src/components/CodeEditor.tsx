import { useEffect, useRef } from 'react'
import MonacoEditor from '@monaco-editor/react'

const LANGUAGE_CONFIGS = {
  javascript: { language: 'javascript', extension: 'js' },
  python: { language: 'python', extension: 'py' },
  c: { language: 'c', extension: 'c' },
  cpp: { language: 'cpp', extension: 'cpp' },
  java: { language: 'java', extension: 'java' },
  html: { language: 'html', extension: 'html' },
  css: { language: 'css', extension: 'css' },
  typescript: { language: 'typescript', extension: 'ts' },
  sql: { language: 'sql', extension: 'sql' },
  go: { language: 'go', extension: 'go' },
  rust: { language: 'rust', extension: 'rs' },
  php: { language: 'php', extension: 'php' },
  ruby: { language: 'ruby', extension: 'rb' },
  swift: { language: 'swift', extension: 'swift' },
  kotlin: { language: 'kotlin', extension: 'kt' },
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

export function CodeEditor({ socket, code, setCode, sessionId, language, setLanguage }: any) {
  const editorRef = useRef<any>(null)
  const isLocalChange = useRef(false)

  useEffect(() => {
    if (!socket) return

    const handleCodeUpdate = (data: { code: string, language: string }) => {
      if (!isLocalChange.current && editorRef.current) {
        setCode(data.code)
        if (data.language && data.language !== language) {
          setLanguage(data.language)
          if (editorRef.current) {
            editorRef.current.setValue(data.code)
          }
        } else if (editorRef.current) {
          editorRef.current.setValue(data.code)
        }
      }
      isLocalChange.current = false
    }

    socket.on('code-update', handleCodeUpdate)

    return () => {
      socket.off('code-update', handleCodeUpdate)
    }
  }, [socket, setCode, language, setLanguage])

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      isLocalChange.current = true
      setCode(value)
      if (socket) {
        socket.emit('code-update', { sessionId, code: value, language })
      }
    }
  }

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor
    if (code) {
      editor.setValue(code)
    }
  }

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage)
    const newCode = DEFAULT_CODE[newLanguage] || DEFAULT_CODE.javascript
    setCode(newCode)
    if (editorRef.current) {
      editorRef.current.setValue(newCode)
    }
    if (socket) {
      socket.emit('code-update', { sessionId, code: newCode, language: newLanguage })
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="bg-gray-800 p-2 sm:p-4 border-b border-gray-700 flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-semibold text-sm sm:text-base">✏️ Code Editor</h3>
          <span className="text-xs bg-blue-600 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">Real-time</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-300 text-xs sm:text-sm">Language:</label>
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-gray-700 text-white px-2 sm:px-3 py-1 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
          >
            {Object.keys(LANGUAGE_CONFIGS).map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={language}
          theme="vs-dark"
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            suggestOnTriggerCharacters: true,
            formatOnPaste: true,
            formatOnType: true,
            readOnly: false,
          }}
        />
      </div>
    </div>
  )
}