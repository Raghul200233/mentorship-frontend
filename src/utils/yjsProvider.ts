import * as Y from 'yjs'
import { Observable } from 'lib0/observable'

export class CustomWebsocketProvider extends Observable<string> {
  private ws: WebSocket | null = null
  private connected = false
  private sessionId: string
  private url: string
  private doc: Y.Doc

  constructor(url: string, sessionId: string, doc: Y.Doc) {
    super()
    this.url = url
    this.sessionId = sessionId
    this.doc = doc
    this.connect()
  }

  connect() {
    const wsUrl = `${this.url}/yjs?sessionId=${this.sessionId}`
    console.log('Yjs connecting to:', wsUrl)
    
    this.ws = new WebSocket(wsUrl)
    
    this.ws.onopen = () => {
      console.log('Yjs WebSocket connected')
      this.connected = true
      this.emit('status', [{ status: 'connected' }])
    }
    
    this.ws.onmessage = (event) => {
      const data = new Uint8Array(event.data)
      Y.applyUpdate(this.doc, data)
    }
    
    this.ws.onerror = (error) => {
      console.error('Yjs WebSocket error:', error)
      this.emit('status', [{ status: 'error' }])
    }
    
    this.ws.onclose = () => {
      console.log('Yjs WebSocket closed')
      this.connected = false
      this.emit('status', [{ status: 'disconnected' }])
      
      // Attempt to reconnect after 3 seconds
      setTimeout(() => this.connect(), 3000)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  sendUpdate(update: Uint8Array) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(update)
    }
  }

  get connectedState() {
    return this.connected
  }
}