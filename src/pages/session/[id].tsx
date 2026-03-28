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
  const [showChat, setShowChat] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
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
      {/* Desktop View */}
      {!isMobile && (
        <div className="h-screen flex overflow-hidden">
          {/* Left - Code Editor */}
          <div className="w-2/3 border-r border-gray-700">
            <CodeEditor 
              socket={socket} 
              code={code} 
              setCode={setCode} 
              sessionId={id as string}
              language={language}
              setLanguage={setLanguage}
            />
          </div>
          
          {/* Right - Chat and Video */}
          <div className="w-1/3 flex flex-col">
            <div className="h-1/2 border-b border-gray-700">
              <Chat socket={socket} userId={session.user.id} sessionId={id as string} />
            </div>
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
      )}

      {/* Mobile View */}
      {isMobile && (
        <div className="h-screen flex flex-col bg-gray-900">
          {/* Top - Copy Link Bar (always visible for mentor) */}
          {isMentor && (
            <div className="bg-blue-900/50 p-3 flex justify-between items-center border-b border-gray-700">
              <code className="bg-gray-800 px-2 py-1 rounded text-xs text-gray-300 truncate flex-1">
                {inviteLink}
              </code>
              <button
                onClick={copyInviteLink}
                className="bg-blue-600 text-white px-3 py-1 rounded text-xs ml-2"
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          )}

          {/* Code Editor Section */}
          <div className="flex-1 min-h-0">
            <CodeEditor 
              socket={socket} 
              code={code} 
              setCode={setCode} 
              sessionId={id as string}
              language={language}
              setLanguage={setLanguage}
            />
          </div>

          {/* Video Call Section - Bottom */}
          <div className="bg-gray-800 border-t border-gray-700">
            <VideoCall 
              socket={socket} 
              userId={session.user.id} 
              sessionId={id as string}
              isMentor={isMentor}
            />
          </div>

          {/* Floating Chat Button */}
          <button
            onClick={() => setShowChat(true)}
            className="fixed bottom-4 right-4 bg-green-600 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl z-30"
          >
            💬
          </button>

          {/* Chat Modal - Hidden until button clicked */}
{/* Chat Modal - Hidden until button clicked */}
{showChat && (
  <div className="fixed inset-0 z-40 bg-gray-900 flex flex-col">
    <div className="flex-1">
      <Chat 
        socket={socket} 
        userId={session.user.id} 
        sessionId={id as string}
        onClose={() => setShowChat(false)}
        isModal={true}
      />
    </div>
  </div>
)}
        </div>
      )}

      {/* Desktop Copy Link Bar - Add for desktop too */}
      {!isMobile && isMentor && (
        <div className="fixed top-16 right-4 z-20 bg-gray-800 rounded-lg shadow-lg p-2 flex items-center gap-2">
          <code className="text-xs text-gray-300 max-w-xs truncate">
            {inviteLink}
          </code>
          <button
            onClick={copyInviteLink}
            className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
          >
            {copied ? '✓' : 'Copy Link'}
          </button>
        </div>
      )}

      {/* Connection Status */}
      {!isConnected && (
        <div className="fixed bottom-4 left-4 bg-yellow-600 text-white px-3 py-1 rounded-lg text-xs z-50">
          Connecting...
        </div>
      )}
    </Layout>
  )
}