import { useEffect, useRef, useState } from 'react'

export function VideoCall({ socket, userId, sessionId }: any) {
  const [isActive, setIsActive] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState('disconnected')
  
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const getMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setLocalStream(stream)
      localStreamRef.current = stream
      if (localVideo.current) {
        localVideo.current.srcObject = stream
      }
      return stream
    } catch (err) {
      console.error('Camera error:', err)
      alert('Please allow camera and microphone access')
      return null
    }
  }

  // Accept stream directly to avoid stale closure problem
  const createPeer = (stream: MediaStream) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    })

    peer.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('webrtc-ice-candidate', { candidate: e.candidate })
      }
    }

    peer.oniceconnectionstatechange = () => {
      console.log('ICE state:', peer.iceConnectionState)
      setStatus(peer.iceConnectionState)
    }

    peer.ontrack = (e) => {
      console.log('Got remote track', e.streams)
      const remote = e.streams[0]
      setRemoteStream(remote)
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remote
      }
    }

    // Add all tracks from the provided stream
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream)
    })

    return peer
  }

  const startCall = async () => {
    const stream = await getMedia()
    if (!stream) return

    const peer = createPeer(stream)
    pc.current = peer

    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    socket.emit('webrtc-offer', { offer })

    setIsActive(true)
  }

  useEffect(() => {
    if (!socket) return

    const handleOffer = async ({ offer, fromUserId }: any) => {
      if (fromUserId === userId) return

      const stream = await getMedia()
      if (!stream) return

      const peer = createPeer(stream)
      pc.current = peer

      await peer.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      socket.emit('webrtc-answer', { answer })

      setIsActive(true)
    }

    const handleAnswer = async ({ answer }: any) => {
      if (pc.current) {
        await pc.current.setRemoteDescription(new RTCSessionDescription(answer))
      }
    }

    const handleIce = async ({ candidate }: any) => {
      if (pc.current && candidate) {
        try {
          await pc.current.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.error('ICE candidate error:', err)
        }
      }
    }

    const handleEndCall = () => {
      if (remoteVideo.current) remoteVideo.current.srcObject = null
      setRemoteStream(null)
      setIsActive(false)
      setStatus('disconnected')
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
  }, [socket, userId])

  const toggleVideo = () => {
    const stream = localStreamRef.current
    if (stream) {
      const track = stream.getVideoTracks()[0]
      if (track) {
        track.enabled = !videoEnabled
        setVideoEnabled(!videoEnabled)
      }
    }
  }

  const toggleAudio = () => {
    const stream = localStreamRef.current
    if (stream) {
      const track = stream.getAudioTracks()[0]
      if (track) {
        track.enabled = !audioEnabled
        setAudioEnabled(!audioEnabled)
      }
    }
  }

  const endCall = () => {
    if (pc.current) {
      pc.current.close()
      pc.current = null
    }
    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
      setLocalStream(null)
    }
    if (localVideo.current) localVideo.current.srcObject = null
    if (remoteVideo.current) remoteVideo.current.srcObject = null
    setRemoteStream(null)
    setIsActive(false)
    setStatus('disconnected')
    socket.emit('end-call', {})
  }

  const getStatusText = () => {
    if (status === 'connected') return 'Connected'
    if (status === 'connecting' || status === 'checking') return 'Connecting...'
    return 'Waiting for peer...'
  }

  return (
    <div className="bg-gray-800">
      {!isActive ? (
        <div className="p-6 text-center">
          <button
            onClick={startCall}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-full font-semibold transition-colors"
          >
            📞 Start Call
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-900">
            {/* Remote video */}
            <div className="relative bg-black rounded-lg aspect-video overflow-hidden">
              <video
                ref={remoteVideo}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {!remoteStream && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-gray-400 text-xs">{getStatusText()}</p>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                {remoteStream ? 'Peer' : getStatusText()}
              </div>
            </div>

            {/* Local video */}
            <div className="relative bg-black rounded-lg aspect-video overflow-hidden">
              <video
                ref={localVideo}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              {!videoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <p className="text-gray-400 text-xs">Camera Off</p>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                You {!videoEnabled && '(Off)'}
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-3 p-3 bg-gray-800 border-t border-gray-700">
            <button
              onClick={toggleAudio}
              className={`px-4 py-2 rounded-full ${audioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'} text-white text-sm transition-colors`}
            >
              {audioEnabled ? '🎤 Mic On' : '🔇 Mic Off'}
            </button>
            <button
              onClick={toggleVideo}
              className={`px-4 py-2 rounded-full ${videoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'} text-white text-sm transition-colors`}
            >
              {videoEnabled ? '🎥 Cam On' : '📷 Cam Off'}
            </button>
            <button
              onClick={endCall}
              className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
            >
              📞 End Call
            </button>
          </div>
        </>
      )}
    </div>
  )
}