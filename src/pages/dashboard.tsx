import { Layout } from '@/components/Layout'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

export default function Dashboard({ session }: any) {
  const router = useRouter()
  const [sessions, setSessions] = useState([])
  const [newSessionId, setNewSessionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  useEffect(() => {
    if (!session) {
      router.push('/')
    } else {
      fetchSessions()
    }
  }, [session])

  const fetchSessions = async () => {
    try {
      setError('')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/sessions`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch sessions')
      }
      
      const data = await response.json()
      setSessions(data)
    } catch (error: any) {
      console.error('Error fetching sessions:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const createSession = async () => {
    try {
      setCreating(true)
      setError('')
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Failed to create session')
      }
      
      const data = await response.json()
      
      const userRole = session.user.user_metadata?.role || 'mentor'
      if (userRole === 'mentor') {
        alert(`✅ Session created successfully!\n\nShare this link with your student:\n${data.inviteLink}`)
      }
      
      router.push(`/session/${data.id}`)
    } catch (error: any) {
      console.error('Error creating session:', error)
      setError(error.message)
      alert(`Failed to create session: ${error.message}`)
    } finally {
      setCreating(false)
    }
  }

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      return
    }
    
    try {
      setDeleting(sessionId)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete session')
      }
      
      // Remove session from list
      setSessions(sessions.filter((s: any) => s.id !== sessionId))
      alert('Session deleted successfully')
    } catch (error: any) {
      console.error('Error deleting session:', error)
      alert(`Failed to delete session: ${error.message}`)
    } finally {
      setDeleting(null)
    }
  }

  const joinSession = () => {
    if (newSessionId.trim()) {
      router.push(`/session/${newSessionId}`)
    } else {
      setError('Please enter a session ID')
    }
  }

  const copyInviteLink = (sessionId: string, inviteLink?: string) => {
    const link = inviteLink || `${window.location.origin}/session/${sessionId}`
    navigator.clipboard.writeText(link)
    setCopiedLink(sessionId)
    setTimeout(() => setCopiedLink(null), 2000)
  }

  if (loading) {
    return (
      <Layout session={session}>
        <div className="flex items-center justify-center h-64">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Loading your sessions...</p>
          </div>
        </div>
      </Layout>
    )
  }

  const userRole = session?.user?.user_metadata?.role || 'student'
  const isMentor = userRole === 'mentor'

  return (
    <Layout session={session}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to MentorConnect</h1>
          <p className="text-gray-400 mb-8">
            {isMentor ? 'Start or manage mentorship sessions' : 'Join sessions to learn from mentors'}
          </p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {isMentor && (
              <div className="bg-gray-700 rounded-lg p-6">
                <div className="text-4xl mb-4">🎯</div>
                <h2 className="text-xl font-semibold text-white mb-2">Create New Session</h2>
                <p className="text-gray-400 text-sm mb-4">Start a new mentorship session and share the link with your student</p>
                <button
                  onClick={createSession}
                  disabled={creating}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating...
                    </span>
                  ) : (
                    'Create New Session'
                  )}
                </button>
              </div>
            )}

            <div className="bg-gray-700 rounded-lg p-6">
              <div className="text-4xl mb-4">🔗</div>
              <h2 className="text-xl font-semibold text-white mb-2">Join Session</h2>
              <p className="text-gray-400 text-sm mb-4">Paste a session link or ID to join an existing session</p>
              <input
                type="text"
                placeholder="Session ID or full link"
                value={newSessionId}
                onChange={(e) => {
                  let value = e.target.value
                  if (value.includes('/session/')) {
                    value = value.split('/session/')[1]
                  }
                  setNewSessionId(value)
                }}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-500"
              />
              <button
                onClick={joinSession}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                Join Session
              </button>
            </div>
          </div>

          {sessions.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold text-white mb-4">Your Sessions</h2>
              <div className="space-y-3">
                {sessions.map((session: any) => {
                  const inviteLink = session.inviteLink || `${window.location.origin}/session/${session.id}`
                  const isCopied = copiedLink === session.id
                  const isDeleting = deleting === session.id
                  
                  return (
                    <div key={session.id} className="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-white font-mono text-sm mb-1">
                            Session ID: <span className="text-blue-400">{session.id.substring(0, 8)}...</span>
                          </p>
                          <p className="text-gray-400 text-xs">
                            Status: <span className={`${session.status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
                              {session.status === 'active' ? '🟢 Active' : '🟡 Waiting for student'}
                            </span>
                            {' '}| Created: {new Date(session.created_at).toLocaleString()}
                          </p>
                          {session.student_id && (
                            <p className="text-gray-400 text-xs mt-1">
                              👤 Student joined: {new Date(session.updated_at).toLocaleString()}
                            </p>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              value={inviteLink}
                              readOnly
                              className="flex-1 px-3 py-1 bg-gray-600 text-gray-300 text-xs rounded border border-gray-500 cursor-pointer"
                              onClick={() => copyInviteLink(session.id, inviteLink)}
                            />
                            <button
                              onClick={() => copyInviteLink(session.id, inviteLink)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition"
                            >
                              {isCopied ? '✓ Copied!' : '📋 Copy'}
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => router.push(`/session/${session.id}`)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm whitespace-nowrap"
                          >
                            Join Session
                          </button>
                          {isMentor && (
                            <button
                              onClick={() => deleteSession(session.id)}
                              disabled={isDeleting}
                              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition text-sm whitespace-nowrap disabled:opacity-50"
                            >
                              {isDeleting ? 'Deleting...' : '🗑️ Delete'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          {sessions.length === 0 && !loading && (
            <div className="mt-8 text-center py-12 bg-gray-700 rounded-lg">
              <div className="text-6xl mb-4">🚀</div>
              <h3 className="text-xl text-white mb-2">No sessions yet</h3>
              <p className="text-gray-400">
                {isMentor ? 'Create your first session to get started!' : 'Ask your mentor to share a session link with you'}
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}