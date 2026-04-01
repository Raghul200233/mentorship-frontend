import { Layout } from '@/components/Layout'
import { Chat } from '@/components/Chat'
import { VideoCall } from '@/components/VideoCall'
import { CodeEditor } from '@/components/CodeEditor'
import { useSocket } from '@/hooks/useSocket'
import { useRouter } from 'next/router'
import { useState, useEffect, useRef } from 'react'

export default function SessionPage({ session }: any) {
  const router = useRouter()
  const { id } = router.query
  const { socket, isConnected, isWaking } = useSocket(id as string, session?.user?.id)
  const [code, setCode] = useState('// Start coding here...\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n')
  const [language, setLanguage] = useState('javascript')
  const [copied, setCopied] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Only show "Connecting…" after 2 s so it doesn't flash on first render
  const [showConnecting, setShowConnecting] = useState(false)
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isConnected) {
      connectTimer.current = setTimeout(() => setShowConnecting(true), 2000)
    } else {
      if (connectTimer.current) clearTimeout(connectTimer.current)
      setShowConnecting(false)
    }
    return () => { if (connectTimer.current) clearTimeout(connectTimer.current) }
  }, [isConnected])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!session) router.push('/')
  }, [session, router])

  // Stop any lingering camera/mic tracks when leaving the page
  useEffect(() => {
    const stopCamera = () => {
      navigator.mediaDevices.enumerateDevices().catch(() => {})
      // Actual track stopping is handled inside VideoCall's own unmount
    }
    return () => { stopCamera() }
  }, [])

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
          <div className="text-white">Loading…</div>
        </div>
      </Layout>
    )
  }

  const isMentor  = session.user.user_metadata?.role === 'mentor'
  const inviteLink = `${window.location.origin}/session/${id}`

  return (
    <Layout session={session}>
      {/* ── Desktop ─────────────────────────────────────────────────────────── */}
      {!isMobile && (
        <div className="h-screen flex overflow-hidden">
          {/* Code editor — left 2/3 */}
          <div className="w-2/3 border-r border-gray-700 min-h-0">
            <CodeEditor
              socket={socket}
              code={code}
              setCode={setCode}
              sessionId={id as string}
              language={language}
              setLanguage={setLanguage}
            />
          </div>

          {/* Chat + Video — right 1/3 */}
          <div className="w-1/3 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 border-b border-gray-700">
              <Chat socket={socket} userId={session.user.id} sessionId={id as string} />
            </div>
            <div className="shrink-0">
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

      {/* ── Mobile ──────────────────────────────────────────────────────────── */}
      {isMobile && (
        <div className="h-screen flex flex-col bg-gray-900">
          {isMentor && (
            <div className="bg-blue-900/50 p-3 flex justify-between items-center border-b border-gray-700 shrink-0">
              <code className="bg-gray-800 px-2 py-1 rounded text-xs text-gray-300 truncate flex-1">{inviteLink}</code>
              <button onClick={copyInviteLink} className="bg-blue-600 text-white px-3 py-1 rounded text-xs ml-2">
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          )}

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

          <div className="shrink-0 bg-gray-800 border-t border-gray-700">
            <VideoCall
              socket={socket}
              userId={session.user.id}
              sessionId={id as string}
              isMentor={isMentor}
            />
          </div>

          {/* Floating chat button */}
          {!showChat && (
            <button
              onClick={() => setShowChat(true)}
              className="fixed bottom-4 right-4 bg-green-600 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl z-30"
            >
              💬
            </button>
          )}

          {/* Chat modal */}
          {showChat && (
            <div className="fixed inset-0 z-50 bg-gray-900">
              <Chat
                socket={socket}
                userId={session.user.id}
                sessionId={id as string}
                onClose={() => setShowChat(false)}
                isModal={true}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Desktop invite bar ───────────────────────────────────────────────── */}
      {!isMobile && isMentor && (
        <div className="fixed top-16 right-4 z-20 bg-gray-800 rounded-lg shadow-lg p-2 flex items-center gap-2">
          <code className="text-xs text-gray-300 max-w-xs truncate">{inviteLink}</code>
          <button onClick={copyInviteLink} className="bg-blue-600 text-white px-2 py-1 rounded text-xs">
            {copied ? '✓' : 'Copy Link'}
          </button>
        </div>
      )}

      {/* ── Connection indicator ──────────────────────────────────────────── */}
      {isWaking && (
        <div className="fixed bottom-4 left-4 bg-orange-600 text-white px-3 py-1 rounded-lg text-xs z-50 flex items-center gap-2">
          <span className="animate-spin inline-block">⟳</span> Starting server… (first load may take ~30s)
        </div>
      )}
      {!isWaking && showConnecting && !isConnected && (
        <div className="fixed bottom-4 left-4 bg-yellow-600 text-white px-3 py-1 rounded-lg text-xs z-50 flex items-center gap-2">
          <span className="animate-spin inline-block">⟳</span> Reconnecting…
        </div>
      )}
    </Layout>
  )
}