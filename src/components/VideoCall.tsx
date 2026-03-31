import { useEffect, useRef, useState } from 'react'

interface VideoCallProps {
  socket: any;
  userId: string;
  sessionId: string;
  isMentor: boolean;
}

export function VideoCall({ socket, userId, sessionId, isMentor }: VideoCallProps) {
  const [isCallActive, setIsCallActive] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [remoteStreamActive, setRemoteStreamActive] = useState(false)
  const [connectionState, setConnectionState] = useState<string>('new')
  const [error, setError] = useState<string>('')
  const [localStreamReady, setLocalStreamReady] = useState(false)
  const [autoStartAttempted, setAutoStartAttempted] = useState(false)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // Auto-start call when component mounts
  useEffect(() => {
    if (!autoStartAttempted && !isCallActive) {
      setAutoStartAttempted(true)
      // Small delay to ensure everything is ready
      setTimeout(() => {
        startCall()
      }, 1000)
    }
  }, [])

  const cleanupCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop()
      })
      localStreamRef.current = null
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    setIsCallActive(false)
    setRemoteStreamActive(false)
    setConnectionState('closed')
    setLocalStreamReady(false)
  }

  useEffect(() => {
    if (!socket) return

    const handleOffer = (data: { offer: RTCSessionDescriptionInit; fromUserId: string }) => {
      if (data.fromUserId === userId) return
      handleOfferInternal(data.offer)
    }

    const handleAnswer = (data: { answer: RTCSessionDescriptionInit }) => {
      handleAnswerInternal(data.answer)
    }

    const handleIceCandidate = (data: { candidate: RTCIceCandidateInit }) => {
      handleIceCandidateInternal(data.candidate)
    }

    const handlePeerEndedCall = () => {
      cleanupCall()
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

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled
        setIsVideoEnabled(!isVideoEnabled)
      }
    }
  }

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled
        setIsAudioEnabled(!isAudioEnabled)
      }
    }
  }

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', { sessionId, candidate: event.candidate })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState)
      setConnectionState(pc.iceConnectionState)
      if (pc.iceConnectionState === 'connected') {
        setRemoteStreamActive(true)
      }
    }

    pc.ontrack = (event) => {
      console.log('Received remote track')
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
        setRemoteStreamActive(true)
      }
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    return pc
  }

  const startCall = async () => {
    try {
      console.log('Starting call with camera and mic...')
      setError('')
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      })
      
      localStreamRef.current = stream
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.play().catch(e => console.log(e))
        setLocalStreamReady(true)
      }
      
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)

      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('webrtc-offer', { sessionId, offer: pc.localDescription })

      setIsCallActive(true)
      setConnectionState('connecting')
    } catch (error: any) {
      console.error('Error starting call:', error)
      if (error.name === 'NotAllowedError') {
        setError('Please allow camera and microphone access to join the session')
      } else if (error.name === 'NotFoundError') {
        setError('No camera or microphone found on your device')
      } else {
        setError('Unable to access camera/microphone. Please check permissions.')
      }
    }
  }

  const handleOfferInternal = async (offer: RTCSessionDescriptionInit) => {
    try {
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        })
        localStreamRef.current = stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.play().catch(e => console.log(e))
          setLocalStreamReady(true)
        }
        setIsVideoEnabled(true)
        setIsAudioEnabled(true)
      }

      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('webrtc-answer', { sessionId, answer: pc.localDescription })

      setIsCallActive(true)
      setConnectionState('connecting')
    } catch (error) {
      console.error('Error handling offer:', error)
    }
  }

  const handleAnswerInternal = async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
  }

  const handleIceCandidateInternal = async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) return
    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
  }

  const endCall = () => {
    cleanupCall()
    socket.emit('end-call', { sessionId })
  }

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected': return 'Connected'
      case 'connecting': return 'Connecting...'
      default: return 'Not connected'
    }
  }

  return (
    <div className="bg-gray-800">
      {error && (
        <div className="p-2 bg-red-900/50 text-red-400 text-xs text-center">
          {error}
        </div>
      )}

      {!isCallActive ? (
        <div className="p-6 text-center">
          {error ? (
            <button
              onClick={startCall}
              className="bg-green-600 text-white px-6 py-2 rounded-full font-semibold"
            >
              Try Again
            </button>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-3"></div>
              <p className="text-gray-400 text-sm">Requesting camera and microphone access...</p>
            </div>
          )}
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
                {remoteStreamActive ? 'Peer' : getStatusText()}
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
              {!localStreamReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4 p-3 bg-gray-800 border-t border-gray-700">
            <button
              onClick={toggleAudio}
              className={`p-3 rounded-full ${
                isAudioEnabled ? 'bg-gray-700' : 'bg-red-600'
              } text-white`}
            >
              {isAudioEnabled ? '🎤 Mic On' : '🔇 Mic Off'}
            </button>
            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full ${
                isVideoEnabled ? 'bg-gray-700' : 'bg-red-600'
              } text-white`}
            >
              {isVideoEnabled ? '🎥 Camera On' : '📷 Camera Off'}
            </button>
            <button
              onClick={endCall}
              className="p-3 rounded-full bg-red-600 text-white"
            >
              📞 End Call
            </button>
          </div>
        </>
      )}
    </div>
  )
}