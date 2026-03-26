import { Layout } from '@/components/Layout'
import { Chat } from '@/components/Chat'
import { VideoCall } from '@/components/VideoCall'
import { MobileVideoCall } from '@/components/MobileVideoCall'
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
  const [showVideoModal, setShowVideoModal] = useState(false)
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
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Invite Banner */}
        {isMentor && (
          <div className="bg-blue-900/30 border-b border-blue-500/30 p-2 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <code className="bg-gray-800 px-2 py-1 rounded text-xs text-gray-300 truncate flex-1">
                {inviteLink}
              </code>
              <button
                onClick={copyInviteLink}
                className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition whitespace-nowrap"
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
          </div>
        )}
        
        {/* Main Content */}
        <div className="flex-1 relative overflow-hidden">
          {/* Code Editor - Full Screen */}
          <div className="absolute inset-0">
            <CodeEditor 
              socket={socket} 
              code={code} 
              setCode={setCode} 
              sessionId={id as string}
              language={language}
              setLanguage={setLanguage}
            />
          </div>
          
          {/* Desktop Layout */}
          {!isMobile && (
            <div className="absolute top-4 right-4 bottom-4 w-80 flex flex-col gap-4 z-10">
              <div className="flex-1 min-h-0 bg-gray-800 rounded-lg shadow-xl overflow-hidden">
                <Chat socket={socket} userId={session.user.id} sessionId={id as string} />
              </div>
              <div className="h-80 bg-gray-800 rounded-lg shadow-xl overflow-hidden">
                <VideoCall 
                  socket={socket} 
                  userId={session.user.id} 
                  sessionId={id as string}
                  isMentor={isMentor}
                />
              </div>
            </div>
          )}
          
          {/* Mobile Layout */}
          {isMobile && (
            <>
              {/* Floating Video Button */}
              <button
                onClick={() => setShowVideoModal(true)}
                className="fixed bottom-4 left-4 bg-blue-600 text-white p-3 rounded-full shadow-lg z-20"
              >
                🎥
              </button>
              
              {/* Floating Chat Button */}
              {!showChat && (
                <button
                  onClick={() => setShowChat(true)}
                  className="fixed bottom-4 right-4 bg-green-600 text-white p-3 rounded-full shadow-lg z-20"
                >
                  💬
                </button>
              )}
              
              {/* Video Modal */}
              {showVideoModal && (
                <MobileVideoCall
                  socket={socket}
                  userId={session.user.id}
                  sessionId={id as string}
                  isMentor={isMentor}
                  onClose={() => setShowVideoModal(false)}
                />
              )}
              
              {/* Chat Panel */}
              {showChat && (
                <div className="absolute inset-0 z-30 bg-gray-900 flex flex-col">
                  <div className="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
                    <h3 className="text-white font-semibold">Chat</h3>
                    <button
                      onClick={() => setShowChat(false)}
                      className="text-gray-400 hover:text-white text-xl"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex-1">
                    <Chat socket={socket} userId={session.user.id} sessionId={id as string} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Connection Status */}
        {!isConnected && (
          <div className="fixed bottom-4 right-4 bg-yellow-600 text-white px-3 py-1 rounded-lg text-xs z-50">
            Connecting...
          </div>
        )}
      </div>
    </Layout>
  )
}