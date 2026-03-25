import { Layout } from '@/components/Layout'
import { Chat } from '@/components/Chat'
import { VideoCall } from '@/components/VideoCall'
import { CodeEditor } from '@/components/CodeEditor'
import { useSocket } from '@/hooks/useSocket'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'

export default function SessionPage({ session }: any) {
  const router = useRouter()
  const { id } = router.query
  const { socket, isConnected } = useSocket(id as string, session?.user?.id)
  const [code, setCode] = useState('// Start coding here...\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n')
  const [language, setLanguage] = useState('javascript')
  const [showInvite, setShowInvite] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!session) {
      router.push('/')
    }
  }, [session, router])

  const copyInviteLink = () => {
    const link = `${window.location.origin}/session/${id}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!session || !id) {
    return (
      <Layout session={session}>
        <div className="flex items-center justify-center h-64">
          <div className="text-white">Loading...</div>
        </div>
      </Layout>
    )
  }

  const isMentor = session.user.user_metadata?.role === 'mentor'
  const inviteLink = `${window.location.origin}/session/${id}`

  return (
    <Layout session={session}>
      {/* Invite Banner */}
      {isMentor && (
        <div className="bg-blue-900/30 border-b border-blue-500/30 p-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-blue-400 text-sm">🔗 Share this link with your student:</span>
              <code className="bg-gray-800 px-3 py-1 rounded text-xs text-gray-300 break-all">
                {inviteLink}
              </code>
            </div>
            <button
              onClick={copyInviteLink}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition whitespace-nowrap"
            >
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
          </div>
        </div>
      )}
      
      <div className="h-screen flex flex-col lg:flex-row">
        {/* LEFT PANEL - Code Editor */}
        <div className="lg:w-2/3 flex flex-col border-r border-gray-700">
          <CodeEditor 
            socket={socket} 
            code={code} 
            setCode={setCode} 
            sessionId={id as string}
            language={language}
            setLanguage={setLanguage}
          />
        </div>
        
        {/* RIGHT PANEL - Chat and Video */}
        <div className="lg:w-1/3 flex flex-col">
          {/* Chat Section */}
          <div className="h-1/2 border-b border-gray-700">
            <Chat socket={socket} userId={session.user.id} sessionId={id as string} />
          </div>
          
          {/* Video Section */}
          <div className="h-1/2">
            <VideoCall 
              socket={socket} 
              userId={session.user.id} 
              sessionId={id as string}
              isMentor={isMentor}
            />
          </div>
        </div>
      </div>
      
      {/* Connection Status Indicator */}
      {!isConnected && (
        <div className="fixed bottom-4 right-4 bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm">
          Connecting to server...
        </div>
      )}
    </Layout>
  )
}