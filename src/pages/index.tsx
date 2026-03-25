import { Auth } from '@/components/Auth'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function Home({ session }: any) {
  const router = useRouter()

  useEffect(() => {
    if (session) {
      router.push('/dashboard')
    }
  }, [session, router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <Auth />
    </div>
  )
}