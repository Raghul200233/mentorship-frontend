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

  const getMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setLocalStream(stream)
      if (localVideo.current) localVideo.current.srcObject = stream
      return stream
    } catch (err) {
      console.error('Camera error:', err)
      alert('Please allow camera and microphone access')
      return null
    }
  }

  const createPeer = () => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    peer.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('webrtc-ice-candidate', { candidate: e.candidate })
      }
    }

    peer.oniceconnectionstatechange = () => {
      setStatus(peer.iceConnectionState)
    }

    peer.ontrack = (e) => {
      setRemoteStream(e.streams[0])
      if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0]
    }

    if (localStream) {
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream))
    }

    return peer
  }

  const startCall = async () => {
    const stream = await getMedia()
    if (!stream) return

    const peer = createPeer()
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

      const peer = createPeer()
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
      if (pc.current) {
        await pc.current.addIceCandidate(new RTCIceCandidate(candidate))
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
    if (localStream) {
      const track = localStream.getVideoTracks()[0]
      if (track) {
        track.enabled = !videoEnabled
        setVideoEnabled(!videoEnabled)
      }
    }
  }

  const toggleAudio = () => {
    if (localStream) {
      const track = localStream.getAudioTracks()[0]
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
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop())
      setLocalStream(null)
    }
    if (localVideo.current) localVideo.current.srcObject = null
    if (remoteVideo.current) remoteVideo.current.srcObject = null
    setRemoteStream(null)
    setIsActive(false)
    socket.emit('end-call', {})
  }

  const getStatusText = () => {
    if (status === 'connected') return 'Connected'
    if (status === 'connecting') return 'Connecting...'
    return 'Disconnected'
  }

  return (
    <div className="bg-gray-800">
      {!isActive ? (
        <div className="p-6 text-center">
          <button
            onClick={startCall}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-full font-semibold"
          >
            📞 Start Call
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-900">
            <div className="relative bg-black rounded-lg aspect-video">
              <video ref={remoteVideo} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                {remoteStream ? 'Peer' : getStatusText()}
              </div>
            </div>
            <div className="relative bg-black rounded-lg aspect-video">
              <video ref={localVideo} autoPlay muted playsInline className="w-full h-full object-cover" />
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                You {!videoEnabled && '(Off)'}
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-4 p-3 bg-gray-800 border-t">
            <button onClick={toggleAudio} className={`px-4 py-2 rounded-full ${audioEnabled ? 'bg-gray-700' : 'bg-red-600'} text-white`}>
              {audioEnabled ? '🎤 Mic On' : '🔇 Mic Off'}
            </button>
            <button onClick={toggleVideo} className={`px-4 py-2 rounded-full ${videoEnabled ? 'bg-gray-700' : 'bg-red-600'} text-white`}>
              {videoEnabled ? '🎥 Camera On' : '📷 Camera Off'}
            </button>
            <button onClick={endCall} className="px-4 py-2 rounded-full bg-red-600 text-white">
              📞 End Call
            </button>
          </div>
        </>
      )}
    </div>
  )
}