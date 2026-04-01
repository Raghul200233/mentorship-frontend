import * as Y from 'yjs'
import { Observable } from 'lib0/observable'

const REMOTE_ORIGIN = 'remote-ws'

export class CustomWebsocketProvider extends Observable<string> {
  private ws: WebSocket | null = null
  private destroyed = false
  private sessionId: string
  private url: string
  private doc: Y.Doc
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(url: string, sessionId: string, doc: Y.Doc) {
    super()
    this.url = url
    this.sessionId = sessionId
    this.doc = doc
    this.connect()
  }

  connect() {
    if (this.destroyed) return

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const wsUrl = `${this.url}/yjs?sessionId=${this.sessionId}`
    console.log('[Yjs] Connecting to:', wsUrl)

    try {
      this.ws = new WebSocket(wsUrl)
    } catch (err) {
      console.error('[Yjs] Failed to create WebSocket:', err)
      this.scheduleReconnect()
      return
    }

    this.ws.binaryType = 'arraybuffer'

    this.ws.onopen = () => {
      if (this.destroyed) { this.ws?.close(); return }
      console.log('[Yjs] Connected')
      this.emit('status', [{ status: 'connected' }])
    }

    this.ws.onmessage = (event) => {
      try {
        const data = new Uint8Array(event.data as ArrayBuffer)
        // Mark updates as coming from the remote so the doc observer
        // can distinguish them from local edits and NOT echo back
        Y.applyUpdate(this.doc, data, REMOTE_ORIGIN)
      } catch (err) {
        console.error('[Yjs] Error applying update:', err)
      }
    }

    this.ws.onerror = () => {
      this.emit('status', [{ status: 'error' }])
    }

    this.ws.onclose = () => {
      console.log('[Yjs] Closed')
      this.emit('status', [{ status: 'disconnected' }])
      if (!this.destroyed) this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.destroyed) return
    this.emit('status', [{ status: 'connecting' }])
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this.connect()
    }, 3000)
  }

  disconnect() {
    this.destroyed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
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
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Export the origin constant so CodeEditor can check it
export { REMOTE_ORIGIN }