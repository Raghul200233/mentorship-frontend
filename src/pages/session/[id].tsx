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
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'code' | 'chat' | 'video'>('code')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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
        <div className="flex items-center justify-center h-full">
          <div className="text-white">Loading...</div>
        </div>
      </Layout>
    )
  }

  const isMentor = session.user.user_metadata?.role === 'mentor'
  const inviteLink = `${window.location.origin}/session/${id}`

  return (
    <Layout session={session}>
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Invite Banner - Only for Mentor */}
        {isMentor && (
          <div className="bg-blue-900/30 border-b border-blue-500/30 p-2 sm:p-3 flex-shrink-0">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-blue-400 text-xs sm:text-sm hidden sm:inline">🔗 Share:</span>
                <code className="bg-gray-800 px-2 sm:px-3 py-1 rounded text-xs text-gray-300 truncate flex-1">
                  {inviteLink}
                </code>
              </div>
              <button
                onClick={copyInviteLink}
                className="bg-blue-600 hover:bg-blue-700 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm transition whitespace-nowrap"
              >
                {copied ? '✓ Copied!' : '📋 Copy Link'}
              </button>
            </div>
          </div>
        )}
        
        {/* Mobile Tab Navigation */}
        {isMobile && (
          <div className="lg:hidden bg-gray-800 border-b border-gray-700 flex-shrink-0">
            <div className="flex">
              <button
                onClick={() => setActiveTab('code')}
                className={`tab-button flex-1 py-3 text-sm font-medium transition ${
                  activeTab === 'code'
                    ? 'active text-blue-400 border-b-2 border-blue-400 bg-gray-700'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                ✏️ Code
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`tab-button flex-1 py-3 text-sm font-medium transition ${
                  activeTab === 'chat'
                    ? 'active text-blue-400 border-b-2 border-blue-400 bg-gray-700'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                💬 Chat
              </button>
              <button
                onClick={() => setActiveTab('video')}
                className={`tab-button flex-1 py-3 text-sm font-medium transition ${
                  activeTab === 'video'
                    ? 'active text-blue-400 border-b-2 border-blue-400 bg-gray-700'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                🎥 Video
              </button>
            </div>
          </div>
        )}
        
        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          {/* Desktop Layout */}
          {!isMobile && (
            <div className="hidden lg:flex h-full">
              {/* Left Panel - Code Editor */}
              <div className="w-2/3 flex flex-col border-r border-gray-700">
                <CodeEditor 
                  socket={socket} 
                  code={code} 
                  setCode={setCode} 
                  sessionId={id as string}
                  language={language}
                  setLanguage={setLanguage}
                />
              </div>
              
              {/* Right Panel - Chat and Video */}
              <div className="w-1/3 flex flex-col">
                <div className="h-1/2 border-b border-gray-700 overflow-hidden">
                  <Chat socket={socket} userId={session.user.id} sessionId={id as string} />
                </div>
                <div className="h-1/2 overflow-hidden">
                  <VideoCall 
                    socket={socket} 
                    userId={session.user.id} 
                    sessionId={id as string}
                    isMentor={isMentor}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Mobile Layout */}
          {isMobile && (
            <div className="lg:hidden h-full">
              {activeTab === 'code' && (
                <div className="h-full">
                  <CodeEditor 
                    socket={socket} 
                    code={code} 
                    setCode={setCode} 
                    sessionId={id as string}
                    language={language}
                    setLanguage={setLanguage}
                  />
                </div>
              )}
              {activeTab === 'chat' && (
                <div className="h-full">
                  <Chat socket={socket} userId={session.user.id} sessionId={id as string} />
                </div>
              )}
              {activeTab === 'video' && (
                <div className="h-full">
                  <VideoCall 
                    socket={socket} 
                    userId={session.user.id} 
                    sessionId={id as string}
                    isMentor={isMentor}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Connection Status Indicator */}
        {!isConnected && (
          <div className="fixed bottom-4 right-4 bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm z-50">
            Connecting to server...
          </div>
        )}
      </div>
    </Layout>
  )
}