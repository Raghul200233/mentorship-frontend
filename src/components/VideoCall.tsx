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
  const [localVideoReady, setLocalVideoReady] = useState(false)
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [otherUserId, setOtherUserId] = useState<string | null>(null)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // Listen for existing users in session
  useEffect(() => {
    if (!socket) return
    
    const handleExistingUsers = (data: { users: string[] }) => {
      console.log('Existing users in session:', data.users)
      if (data.users.length > 0) {
        setOtherUserId(data.users[0])
      }
    }
    
    const handleUserJoined = (data: { userId: string }) => {
      console.log('User joined:', data.userId)
      if (data.userId !== userId) {
        setOtherUserId(data.userId)
      }
    }
    
    socket.on('existing-users', handleExistingUsers)
    socket.on('user-joined', handleUserJoined)
    
    return () => {
      socket.off('existing-users', handleExistingUsers)
      socket.off('user-joined', handleUserJoined)
    }
  }, [socket, userId])

  const cleanupCall = () => {
    console.log('Cleaning up call...')
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
    setLocalVideoReady(false)
    setConnectionStatus('disconnected')
  }

  useEffect(() => {
    if (!socket) return

    const handleOffer = async (data: { offer: RTCSessionDescriptionInit; fromUserId: string }) => {
      if (data.fromUserId === userId) return
      console.log('📞 Received offer from:', data.fromUserId)
      setOtherUserId(data.fromUserId)
      await handleOfferInternal(data.offer, data.fromUserId)
    }

    const handleAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      console.log('📞 Received answer')
      await handleAnswerInternal(data.answer)
    }

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      console.log('📞 Received ICE candidate')
      await handleIceCandidateInternal(data.candidate)
    }

    const handlePeerEndedCall = () => {
      console.log('Peer ended call')
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null
      }
      setRemoteStreamActive(false)
      setConnectionStatus('disconnected')
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
      cleanupCall()
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

  const createPeerConnection = (targetUserId: string) => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    }

    const pc = new RTCPeerConnection(configuration)

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc-ice-candidate', { 
          sessionId, 
          candidate: event.candidate,
          targetUserId 
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState)
      setConnectionStatus(pc.iceConnectionState)
      if (pc.iceConnectionState === 'connected') {
        setRemoteStreamActive(true)
      }
    }

    pc.ontrack = (event) => {
      console.log('📺 Received remote track')
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
    if (!otherUserId) {
      setError('Waiting for other user to join...')
      return
    }
    
    try {
      setError('')
      console.log('🎥 Starting video call with:', otherUserId)
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      })
      
      localStreamRef.current = stream
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.onloadedmetadata = () => {
          setLocalVideoReady(true)
        }
        localVideoRef.current.play()
      }
      
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)

      const pc = createPeerConnection(otherUserId)
      peerConnectionRef.current = pc

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      if (socket) {
        socket.emit('webrtc-offer', { 
          sessionId, 
          offer: pc.localDescription,
          targetUserId: otherUserId
        })
        console.log('📞 Offer sent to:', otherUserId)
      }

      setIsCallActive(true)
    } catch (error: any) {
      console.error('Error starting call:', error)
      if (error.name === 'NotAllowedError') {
        setError('Please allow camera and microphone access')
      } else {
        setError('Unable to access camera/microphone')
      }
    }
  }

  const handleOfferInternal = async (offer: RTCSessionDescriptionInit, fromUserId: string) => {
    try {
      console.log('Processing offer from:', fromUserId)
      
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        })
        localStreamRef.current = stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.onloadedmetadata = () => {
            setLocalVideoReady(true)
          }
          localVideoRef.current.play()
        }
        setIsVideoEnabled(true)
        setIsAudioEnabled(true)
      }

      const pc = createPeerConnection(fromUserId)
      peerConnectionRef.current = pc

      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      if (socket) {
        socket.emit('webrtc-answer', { 
          sessionId, 
          answer: pc.localDescription,
          targetUserId: fromUserId
        })
        console.log('📞 Answer sent to:', fromUserId)
      }

      setIsCallActive(true)
    } catch (error) {
      console.error('Error handling offer:', error)
    }
  }

  const handleAnswerInternal = async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
    console.log('Remote description set')
  }

  const handleIceCandidateInternal = async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) return
    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
  }

  const endCall = () => {
    console.log('📞 Ending call')
    cleanupCall()
    if (socket && otherUserId) {
      socket.emit('end-call', { sessionId, targetUserId: otherUserId })
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected'
      case 'connecting': return 'Connecting...'
      case 'disconnected': return 'Disconnected'
      case 'failed': return 'Connection failed'
      default: return 'Waiting...'
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
          <button
            onClick={startCall}
            disabled={!otherUserId}
            className={`px-6 py-3 rounded-full font-semibold text-base ${
              otherUserId 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            📞 Start Call
          </button>
          <p className="text-gray-400 text-xs mt-3">
            {otherUserId 
              ? 'Click to start video call' 
              : 'Waiting for other user to join...'}
          </p>
        </div>
      ) : (
        <>
          {/* 2 Video Images Side by Side */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-900">
            {/* Peer Video */}
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

            {/* Your Video */}
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                {localVideoReady ? 'You' : 'Starting...'}
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
              {isAudioEnabled ? '🎤 Mic On' : '🔇 Mic Off'}
            </button>
            <button
              onClick={toggleVideo}
              className={`px-4 py-2 rounded-full text-sm ${
                isVideoEnabled ? 'bg-gray-700' : 'bg-red-600'
              } text-white`}
            >
              {isVideoEnabled ? '🎥 Camera On' : '📷 Camera Off'}
            </button>
            <button
              onClick={endCall}
              className="px-4 py-2 rounded-full bg-red-600 text-white text-sm"
            >
              📞 End Call
            </button>
          </div>
        </>
      )}
    </div>
  )
}