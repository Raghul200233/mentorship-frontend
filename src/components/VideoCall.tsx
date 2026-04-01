import { useEffect, useRef, useState } from 'react'

export function VideoCall({ socket, userId, sessionId, isMentor }: any) {
  const [isCallActive, setIsCallActive] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState('new')
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)

  // Create peer connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc-ice-candidate', { sessionId, candidate: event.candidate })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState)
      setConnectionState(pc.iceConnectionState)
    }

    pc.ontrack = (event) => {
      console.log('Got remote track')
      setRemoteStream(event.streams[0])
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
      }
    }

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream)
      })
    }

    return pc
  }

  // Start local camera
  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      return stream
    } catch (err) {
      console.error('Camera error:', err)
      alert('Please allow camera and microphone access')
      return null
    }
  }

  // Start call
  const startCall = async () => {
    const stream = await startLocalStream()
    if (!stream) return

    const pc = createPeerConnection()
    pcRef.current = pc

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('webrtc-offer', { sessionId, offer: pc.localDescription })
    
    setIsCallActive(true)
  }

  // Handle incoming offer
  useEffect(() => {
    if (!socket) return

    const handleOffer = async ({ offer, fromUserId }: any) => {
      if (fromUserId === userId) return
      console.log('Received offer')
      
      const stream = await startLocalStream()
      if (!stream) return

      const pc = createPeerConnection()
      pcRef.current = pc

      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('webrtc-answer', { sessionId, answer: pc.localDescription })
      
      setIsCallActive(true)
    }

    const handleAnswer = async ({ answer }: any) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer))
      }
    }

    const handleIceCandidate = async ({ candidate }: any) => {
      if (pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
      }
    }

    const handlePeerEndedCall = () => {
      setRemoteStream(null)
      setIsCallActive(false)
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    }

    socket.on('webrtc-offer', handleOffer)
    socket.on('webrtc-answer', handleAnswer)
    socket.on('webrtc-ice-candidate', handleIceCandidate)
    socket.on('peer-ended-call', handlePeerEndedCall)

    return () => {
      socket.off('webrtc-offer', handleOffer)
      socket.off('webrtc-answer', handleAnswer)
      socket.off('webrtc-ice-candidate', handleIceCandidate)
      socket.off('peer-ended-call', handlePeerEndedCall)
    }
  }, [socket, userId])

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const track = localStream.getVideoTracks()[0]
      if (track) {
        track.enabled = !isVideoEnabled
        setIsVideoEnabled(!isVideoEnabled)
      }
    }
  }

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const track = localStream.getAudioTracks()[0]
      if (track) {
        track.enabled = !isAudioEnabled
        setIsAudioEnabled(!isAudioEnabled)
      }
    }
  }

  // End call
  const endCall = () => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      setLocalStream(null)
    }
    setRemoteStream(null)
    setIsCallActive(false)
    socket.emit('end-call', { sessionId })
  }

  const getStatus = () => {
    if (connectionState === 'connected') return 'Connected'
    if (connectionState === 'connecting') return 'Connecting...'
    return 'Disconnected'
  }

  return (
    <div className="bg-gray-800">
      {!isCallActive ? (
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
          {/* Video Grid */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-900">
            {/* Remote Video */}
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                {remoteStream ? 'Peer' : getStatus()}
              </div>
            </div>

            {/* Local Video */}
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                You {!isVideoEnabled && '(Off)'}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4 p-3 bg-gray-800 border-t border-gray-700">
            <button
              onClick={toggleAudio}
              className={`px-4 py-2 rounded-full text-sm ${
                isAudioEnabled ? 'bg-gray-700' : 'bg-red-600'
              } text-white`}
            >
              {isAudioEnabled ? 'Mic On' : 'Mic Off'}
            </button>
            <button
              onClick={toggleVideo}
              className={`px-4 py-2 rounded-full text-sm ${
                isVideoEnabled ? 'bg-gray-700' : 'bg-red-600'
              } text-white`}
            >
              {isVideoEnabled ? 'Camera On' : 'Camera Off'}
            </button>
            <button
              onClick={endCall}
              className="px-4 py-2 rounded-full bg-red-600 text-white text-sm"
            >
              End Call
            </button>
          </div>
        </>
      )}
    </div>
  )
}