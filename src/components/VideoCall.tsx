import { useEffect, useRef, useState, useCallback } from 'react'

export function VideoCall({ socket, userId, sessionId }: any) {
  const [isActive, setIsActive]     = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [hasRemote, setHasRemote]   = useState(false)
  const [status, setStatus]         = useState('idle')

  const localVideo  = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const pc          = useRef<RTCPeerConnection | null>(null)
  const localStreamRef  = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

  // ── Stop camera/mic when component unmounts (navigating away) ─────────────
  useEffect(() => {
    return () => {
      stopAllTracks()
      if (pc.current) { pc.current.close(); pc.current = null }
    }
  }, [])

  function stopAllTracks() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    remoteStreamRef.current = null
  }

  // ── Assign local srcObject once the video element is in the DOM ───────────
  useEffect(() => {
    if (!isActive) return
    if (localVideo.current && localStreamRef.current) {
      localVideo.current.srcObject = localStreamRef.current
      localVideo.current.play().catch(() => {/* muted — fine */})
    }
  }, [isActive])

  // ── Assign remote srcObject whenever remote stream arrives ─────────────────
  useEffect(() => {
    if (!hasRemote) return
    const vid = remoteVideo.current
    const stream = remoteStreamRef.current
    if (vid && stream) {
      vid.srcObject = stream
      // Explicitly call play() to satisfy browser autoplay policy for audio
      vid.play().catch(e => console.warn('[VideoCall] remote play():', e))
    }
  }, [hasRemote])

  const getMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true }
      })
      localStreamRef.current = stream
      return stream
    } catch (err: any) {
      console.error('[VideoCall] getUserMedia error:', err)
      alert(
        err.name === 'NotAllowedError'
          ? 'Camera / microphone blocked — please allow access and try again.'
          : `Media error: ${err.message}`
      )
      return null
    }
  }, [])

  const createPeer = useCallback((stream: MediaStream) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    })

    peer.onicecandidate = ({ candidate }) => {
      if (candidate && socket) {
        socket.emit('webrtc-ice-candidate', { candidate })
      }
    }

    peer.oniceconnectionstatechange = () => {
      console.log('[VideoCall] ICE:', peer.iceConnectionState)
      setStatus(peer.iceConnectionState)
    }

    peer.ontrack = (e) => {
      console.log('[VideoCall] ontrack — streams:', e.streams.length, 'tracks:', e.track.kind)
      // e.streams[0] contains both video and audio tracks
      const remote = e.streams[0] ?? new MediaStream([e.track])
      remoteStreamRef.current = remote

      // If video element already mounted, attach immediately
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remote
        remoteVideo.current.play().catch(e => console.warn('[VideoCall] remote play():', e))
      }
      setHasRemote(true)
    }

    // Add BOTH video and audio tracks so peer receives them
    stream.getTracks().forEach(track => {
      console.log('[VideoCall] addTrack:', track.kind, track.enabled, track.readyState)
      peer.addTrack(track, stream)
    })

    return peer
  }, [socket])

  // ── Start call (caller side) ───────────────────────────────────────────────
  const startCall = useCallback(async () => {
    const stream = await getMedia()
    if (!stream) return

    const peer = createPeer(stream)
    pc.current = peer

    // Mount video elements first
    setIsActive(true)
    await new Promise<void>(r => setTimeout(r, 80))

    if (localVideo.current) {
      localVideo.current.srcObject = stream
      localVideo.current.play().catch(() => {})
    }

    const offer = await peer.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
    await peer.setLocalDescription(offer)
    console.log('[VideoCall] → offer sent')
    socket.emit('webrtc-offer', { offer })
  }, [getMedia, createPeer, socket])

  // ── Socket event handlers ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return

    const handleOffer = async ({ offer, fromUserId }: any) => {
      if (fromUserId === userId) return
      console.log('[VideoCall] ← offer received')

      const stream = await getMedia()
      if (!stream) return

      const peer = createPeer(stream)
      pc.current = peer

      setIsActive(true)
      await new Promise<void>(r => setTimeout(r, 80))
      if (localVideo.current) {
        localVideo.current.srcObject = stream
        localVideo.current.play().catch(() => {})
      }

      await peer.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      console.log('[VideoCall] → answer sent')
      socket.emit('webrtc-answer', { answer })
    }

    const handleAnswer = async ({ answer }: any) => {
      console.log('[VideoCall] ← answer received')
      if (pc.current?.signalingState === 'have-local-offer') {
        await pc.current.setRemoteDescription(new RTCSessionDescription(answer))
      }
    }

    const handleIce = async ({ candidate }: any) => {
      if (!pc.current || !candidate) return
      try { await pc.current.addIceCandidate(new RTCIceCandidate(candidate)) }
      catch (e) { console.warn('[VideoCall] ICE candidate error:', e) }
    }

    socket.on('webrtc-offer',         handleOffer)
    socket.on('webrtc-answer',        handleAnswer)
    socket.on('webrtc-ice-candidate', handleIce)
    socket.on('peer-ended-call',      cleanup)

    return () => {
      socket.off('webrtc-offer',         handleOffer)
      socket.off('webrtc-answer',        handleAnswer)
      socket.off('webrtc-ice-candidate', handleIce)
      socket.off('peer-ended-call',      cleanup)
    }
  }, [socket, userId, getMedia, createPeer])

  function cleanup() {
    if (pc.current) { pc.current.close(); pc.current = null }
    stopAllTracks()
    if (localVideo.current)  localVideo.current.srcObject  = null
    if (remoteVideo.current) remoteVideo.current.srcObject = null
    setHasRemote(false)
    setIsActive(false)
    setStatus('idle')
    setVideoEnabled(true)
    setAudioEnabled(true)
  }

  const endCall = () => {
    socket?.emit('end-call', {})
    cleanup()
  }

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (track) { const n = !videoEnabled; track.enabled = n; setVideoEnabled(n) }
  }

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (track) { const n = !audioEnabled; track.enabled = n; setAudioEnabled(n) }
  }

  const STATUS: Record<string, string> = {
    idle: '⚪ Ready', connected: '🟢 Connected',
    connecting: '🟡 Connecting…', checking: '🟡 Checking…',
    disconnected: '🔴 Disconnected', failed: '🔴 Failed', closed: '⚫ Ended',
  }

  return (
    <div className="bg-gray-800 flex flex-col">
      {!isActive ? (
        <div className="p-6 text-center space-y-2">
          <p className="text-gray-400 text-sm">Start a live video call with the other participant</p>
          <button
            onClick={startCall}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-full font-semibold transition-colors"
          >
            📞 Start Call
          </button>
        </div>
      ) : (
        <>
          <div className="px-3 pt-2 pb-0.5 text-xs text-gray-400 text-right">{STATUS[status] ?? status}</div>

          {/* Video tiles */}
          <div className="grid grid-cols-2 gap-2 px-3 pb-2 bg-gray-900">
            {/* Remote */}
            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={remoteVideo} autoPlay playsInline className="w-full h-full object-cover" />
              {!hasRemote && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                  <span className="text-2xl">👤</span>
                  <span className="text-xs mt-1">Waiting for peer…</span>
                </div>
              )}
              <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">Peer</span>
            </div>

            {/* Local */}
            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={localVideo} autoPlay muted playsInline className="w-full h-full object-cover" />
              {!videoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500 text-xs">Camera Off</div>
              )}
              <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">You</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-3 px-3 pb-3 bg-gray-800">
            <button onClick={toggleAudio}
              className={`px-3 py-2 rounded-full text-white text-xs font-medium transition-colors ${audioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}>
              {audioEnabled ? '🎤 Mic On' : '🔇 Muted'}
            </button>
            <button onClick={toggleVideo}
              className={`px-3 py-2 rounded-full text-white text-xs font-medium transition-colors ${videoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}>
              {videoEnabled ? '🎥 Cam On' : '📷 Cam Off'}
            </button>
            <button onClick={endCall}
              className="px-3 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors">
              📞 End Call
            </button>
          </div>
        </>
      )}
    </div>
  )
}