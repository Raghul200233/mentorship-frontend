import { useState } from 'react'
import { supabase } from '@/utils/supabase'

export function Auth() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [role, setRole] = useState('student')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: role,
              name: email.split('@')[0]
            }
          }
        })
        if (error) {
          setError(error.message)
        } else {
          alert('Signup successful! Please check your email to confirm your account.')
          setIsSignUp(false)
          setEmail('')
          setPassword('')
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        if (error) {
          setError(error.message)
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>
        <p className="text-gray-400 text-sm">
          {isSignUp ? 'Join as a mentor or student' : 'Sign in to continue'}
        </p>
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-300 mb-2 text-sm font-medium">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
            required
            placeholder="you@example.com"
          />
        </div>
        
        <div>
          <label className="block text-gray-300 mb-2 text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
            required
            placeholder="••••••••"
            minLength={6}
          />
        </div>
        
        {isSignUp && (
          <div>
            <label className="block text-gray-300 mb-2 text-sm font-medium">I want to join as a</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
            >
              <option value="student">📚 Student - Looking to learn</option>
              <option value="mentor">🎓 Mentor - Ready to teach</option>
            </select>
          </div>
        )}
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          ) : (
            isSignUp ? 'Create Account' : 'Sign In'
          )}
        </button>
      </form>
      
      <div className="mt-6 text-center">
        <button
          onClick={() => {
            setIsSignUp(!isSignUp)
            setError('')
          }}
          className="text-blue-400 hover:text-blue-300 text-sm transition"
        >
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </button>
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-700">
        <p className="text-gray-500 text-xs text-center">
          <span className="block mb-1">Demo Accounts (for testing):</span>
          <span className="block text-gray-600">mentor@example.com / password123</span>
          <span className="block text-gray-600">student@example.com / password123</span>
        </p>
      </div>
    </div>
  )
}