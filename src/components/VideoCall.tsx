import { useEffect, useRef, useState, useCallback } from 'react'

export function VideoCall({ socket, userId, sessionId }: any) {
  const [isActive, setIsActive] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [hasRemote, setHasRemote] = useState(false)
  const [status, setStatus] = useState('idle')

  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

  // ── Key fix: assign srcObject whenever the video element mounts (isActive → true)
  useEffect(() => {
    if (!isActive) return
    if (localVideo.current && localStreamRef.current) {
      localVideo.current.srcObject = localStreamRef.current
    }
    if (remoteVideo.current && remoteStreamRef.current) {
      remoteVideo.current.srcObject = remoteStreamRef.current
    }
  }, [isActive])

  // ── Assign remote stream to video element whenever remote stream arrives
  useEffect(() => {
    if (remoteVideo.current && remoteStreamRef.current) {
      remoteVideo.current.srcObject = remoteStreamRef.current
    }
  }, [hasRemote])

  const getMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = stream
      // NOTE: localVideo.current may not exist yet if isActive is still false
      // We rely on the isActive useEffect above to set srcObject after render
      return stream
    } catch (err: any) {
      console.error('[VideoCall] Camera/mic error:', err)
      if (err.name === 'NotAllowedError') {
        alert('Camera/microphone permission denied. Please allow access and try again.')
      } else {
        alert(`Could not access camera: ${err.message}`)
      }
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

    peer.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('webrtc-ice-candidate', { candidate: e.candidate })
      }
    }

    peer.oniceconnectionstatechange = () => {
      console.log('[VideoCall] ICE state:', peer.iceConnectionState)
      setStatus(peer.iceConnectionState)
    }

    peer.onconnectionstatechange = () => {
      console.log('[VideoCall] Connection state:', peer.connectionState)
    }

    peer.ontrack = (e) => {
      console.log('[VideoCall] Remote track received', e.streams)
      const remote = e.streams[0]
      remoteStreamRef.current = remote
      // Immediately assign if video element already in DOM
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remote
      }
      setHasRemote(true)
    }

    // Add local tracks to peer
    stream.getTracks().forEach(track => {
      console.log('[VideoCall] Adding track:', track.kind)
      peer.addTrack(track, stream)
    })

    return peer
  }, [socket])

  const startCall = useCallback(async () => {
    const stream = await getMedia()
    if (!stream) return

    const peer = createPeer(stream)
    pc.current = peer

    // Set active BEFORE creating offer so video element mounts
    setIsActive(true)

    // Small delay to let React render the video elements
    await new Promise(r => setTimeout(r, 50))

    // Assign local stream now that element should be in DOM
    if (localVideo.current) {
      localVideo.current.srcObject = stream
    }

    const offer = await peer.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: true,
    })
    await peer.setLocalDescription(offer)
    console.log('[VideoCall] Sending offer')
    socket.emit('webrtc-offer', { offer })
  }, [getMedia, createPeer, socket])

  useEffect(() => {
    if (!socket) return

    const handleOffer = async ({ offer, fromUserId }: any) => {
      if (fromUserId === userId) return
      console.log('[VideoCall] Received offer, getting media...')

      const stream = await getMedia()
      if (!stream) return

      const peer = createPeer(stream)
      pc.current = peer

      setIsActive(true)
      await new Promise(r => setTimeout(r, 50))
      if (localVideo.current) {
        localVideo.current.srcObject = stream
      }

      await peer.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      console.log('[VideoCall] Sending answer')
      socket.emit('webrtc-answer', { answer })
    }

    const handleAnswer = async ({ answer }: any) => {
      console.log('[VideoCall] Received answer')
      if (pc.current) {
        await pc.current.setRemoteDescription(new RTCSessionDescription(answer))
      }
    }

    const handleIce = async ({ candidate }: any) => {
      if (pc.current && candidate) {
        try {
          await pc.current.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.warn('[VideoCall] ICE candidate error:', err)
        }
      }
    }

    const handleEndCall = () => {
      cleanup()
    }

    socket.on('webrtc-offer', handleOffer)
    socket.on('webrtc-answer', handleAnswer)
    socket.on('webrtc-ice-candidate', handleIce)
    socket.on('peer-ended-call', handleEndCall)

    return () => {
      socket.off('webrtc-offer', handleOffer)
      socket.off('webrtc-answer', handleAnswer)
      socket.off('webrtc-ice-candidate', handleIce)
      socket.off('peer-ended-call', handleEndCall)
    }
  }, [socket, userId, getMedia, createPeer])

  const cleanup = () => {
    if (pc.current) {
      pc.current.close()
      pc.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    remoteStreamRef.current = null
    if (localVideo.current) localVideo.current.srcObject = null
    if (remoteVideo.current) remoteVideo.current.srcObject = null
    setHasRemote(false)
    setIsActive(false)
    setStatus('idle')
    setVideoEnabled(true)
    setAudioEnabled(true)
  }

  const toggleVideo = () => {
    const stream = localStreamRef.current
    if (stream) {
      const track = stream.getVideoTracks()[0]
      if (track) {
        const next = !videoEnabled
        track.enabled = next
        setVideoEnabled(next)
      }
    }
  }

  const toggleAudio = () => {
    const stream = localStreamRef.current
    if (stream) {
      const track = stream.getAudioTracks()[0]
      if (track) {
        const next = !audioEnabled
        track.enabled = next
        setAudioEnabled(next)
      }
    }
  }

  const endCall = () => {
    socket.emit('end-call', {})
    cleanup()
  }

  const statusLabel = {
    idle: 'Ready',
    connected: '🟢 Connected',
    connecting: '🟡 Connecting…',
    checking: '🟡 Checking…',
    disconnected: '🔴 Disconnected',
    failed: '🔴 Failed',
    closed: 'Ended',
  }[status] ?? status

  return (
    <div className="bg-gray-800 flex flex-col">
      {!isActive ? (
        <div className="p-6 text-center space-y-2">
          <p className="text-gray-400 text-sm">Click to start a video call with the other participant</p>
          <button
            onClick={startCall}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-full font-semibold transition-colors"
          >
            📞 Start Call
          </button>
        </div>
      ) : (
        <>
          {/* Status bar */}
          <div className="px-3 pt-2 text-xs text-gray-400 text-right">{statusLabel}</div>

          {/* Video grid */}
          <div className="grid grid-cols-2 gap-2 px-3 pb-2 bg-gray-900">
            {/* Remote */}
            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
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
              <video ref={localVideo} autoPlay muted playsInline className="w-full h-full object-cover" />
              {!videoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500 text-xs">
                  Camera Off
                </div>
              )}
              <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">You</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-3 px-3 pb-3 bg-gray-800">
            <button
              onClick={toggleAudio}
              className={`flex items-center gap-1 px-3 py-2 rounded-full text-white text-xs font-medium transition-colors ${audioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {audioEnabled ? '🎤 Mic On' : '🔇 Muted'}
            </button>
            <button
              onClick={toggleVideo}
              className={`flex items-center gap-1 px-3 py-2 rounded-full text-white text-xs font-medium transition-colors ${videoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {videoEnabled ? '🎥 Cam On' : '📷 Cam Off'}
            </button>
            <button
              onClick={endCall}
              className="flex items-center gap-1 px-3 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
            >
              📞 End Call
            </button>
          </div>
        </>
      )}
    </div>
  )
}