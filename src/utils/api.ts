export const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

export const api = {
  async get(endpoint: string, token?: string) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    })
    return response.json()
  },
  
  async post(endpoint: string, data: any, token?: string) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    return response.json()
  },
  
  async delete(endpoint: string, token?: string) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    })
    return response.json()
  }
}