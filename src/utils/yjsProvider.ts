import * as Y from 'yjs'
import { Observable } from 'lib0/observable'

export class CustomWebsocketProvider extends Observable<string> {
  private ws: WebSocket | null = null
  private connected = false
  private destroyed = false  // prevents reconnect after intentional disconnect
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

    // Clear any pending reconnect timer
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
      if (this.destroyed) {
        this.ws?.close()
        return
      }
      console.log('[Yjs] WebSocket connected')
      this.connected = true
      this.emit('status', [{ status: 'connected' }])
    }

    this.ws.onmessage = (event) => {
      try {
        const data = event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new Uint8Array(event.data)
        Y.applyUpdate(this.doc, data)
      } catch (err) {
        console.error('[Yjs] Error applying update:', err)
      }
    }

    this.ws.onerror = (error) => {
      console.error('[Yjs] WebSocket error:', error)
      this.emit('status', [{ status: 'error' }])
    }

    this.ws.onclose = () => {
      console.log('[Yjs] WebSocket closed')
      this.connected = false
      this.emit('status', [{ status: 'disconnected' }])

      // Only reconnect if not intentionally destroyed
      if (!this.destroyed) {
        this.scheduleReconnect()
      }
    }
  }

  private scheduleReconnect() {
    if (this.destroyed) return
    this.emit('status', [{ status: 'connecting' }])
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.connect()
      }
    }, 3000)
  }

  disconnect() {
    this.destroyed = true
    this.connected = false

    // Cancel any pending reconnect
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
    return this.connected
  }
}