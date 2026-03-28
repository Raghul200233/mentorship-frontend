import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'
import Head from 'next/head'
import { useRouter } from 'next/router'

export default function App({ Component, pageProps }: AppProps) {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check current session
    const checkSession = async () => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Error getting session:', error)
        }
        
        console.log('Session loaded:', currentSession?.user?.email || 'No session')
        setSession(currentSession)
      } catch (error) {
        console.error('Session check error:', error)
      } finally {
        setLoading(false)
      }
    }
    
    checkSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log('Auth state changed:', _event, newSession?.user?.email)
      setSession(newSession)
      
      // If user logs out, redirect to home
      if (!newSession && router.pathname !== '/') {
        router.push('/')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=yes" />
        <title>MentorConnect - Real-time Mentorship Platform</title>
        <meta name="description" content="Connect with mentors in real-time with video calls, chat, and collaborative coding" />
      </Head>
      <Component {...pageProps} session={session} />
    </>
  )
}