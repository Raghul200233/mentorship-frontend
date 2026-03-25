export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Frontend is Working!</h1>
        <p className="text-gray-600">Next.js + Tailwind CSS is configured correctly.</p>
        <p className="text-gray-500 text-sm mt-4">Time: {new Date().toLocaleString()}</p>
      </div>
    </div>
  )
}