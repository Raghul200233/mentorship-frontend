import { supabase } from '@/utils/supabase'
import { useRouter } from 'next/router'
import { useState } from 'react'

export function Layout({ children, session }: any) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 shadow-lg border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-white cursor-pointer hover:text-blue-400 transition" onClick={() => router.push('/dashboard')}>
                MentorConnect
              </h1>
              <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full">Beta</span>
            </div>
            
            <div className="flex items-center space-x-4">
              {session?.user && (
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="flex items-center space-x-2 hover:opacity-80 transition"
                  >
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">
                        {session.user.email?.[0].toUpperCase()}
                      </span>
                    </div>
                    <span className="hidden md:block text-gray-300 text-sm">
                      {session.user.email?.split('@')[0]}
                    </span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 z-50">
                      <div className="px-4 py-2 border-b border-gray-700">
                        <p className="text-white text-sm font-medium">{session.user.email}</p>
                        <p className="text-gray-400 text-xs capitalize">{session.user.user_metadata?.role || 'User'}</p>
                      </div>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-red-400 hover:bg-gray-700 text-sm transition"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
    </div>
  )
}