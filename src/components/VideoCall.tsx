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
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // Cleanup function
  const cleanupCall = () => {
    console.log('Cleaning up call...')
    
    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop()
        console.log('Stopped track:', track.kind)
      })
      localStreamRef.current = null
    }
    
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    
    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    
    setIsCallActive(false)
    setRemoteStreamActive(false)
    setConnectionState('closed')
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
      console.log('Peer ended call')
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
      cleanupCall()
    }
  }, [socket, userId])

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled
        setIsVideoEnabled(!isVideoEnabled)
        console.log('Video toggled:', !isVideoEnabled)
      }
    }
  }

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled
        setIsAudioEnabled(!isAudioEnabled)
        console.log('Audio toggled:', !isAudioEnabled)
      }
    }
  }

  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    }

    const pc = new RTCPeerConnection(configuration)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', {
          sessionId,
          candidate: event.candidate
        })
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
      setError('')
      console.log('Starting call...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      })
      
      localStreamRef.current = stream
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.play()
      }
      
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)

      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      socket.emit('webrtc-offer', {
        sessionId,
        offer: pc.localDescription
      })

      setIsCallActive(true)
      setConnectionState('connecting')
      console.log('Call started')
    } catch (error: any) {
      console.error('Error:', error)
      setError('Please allow camera and microphone access')
    }
  }

  const handleOfferInternal = async (offer: RTCSessionDescriptionInit) => {
    try {
      console.log('Handling offer')
      
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        })
        localStreamRef.current = stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.play()
        }
        setIsVideoEnabled(true)
        setIsAudioEnabled(true)
      }

      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      socket.emit('webrtc-answer', {
        sessionId,
        answer: pc.localDescription
      })

      setIsCallActive(true)
      setConnectionState('connecting')
      console.log('Answer sent')
    } catch (error) {
      console.error('Error handling offer:', error)
    }
  }

  const handleAnswerInternal = async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return
    
    try {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
      console.log('Remote description set')
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handleIceCandidateInternal = async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) return

    try {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      console.error('Error adding ICE candidate:', error)
    }
  }

  const endCall = () => {
    console.log('Ending call')
    cleanupCall()
    socket.emit('end-call', { sessionId })
  }

  const getConnectionStatusText = () => {
    switch (connectionState) {
      case 'new': return 'Not connected'
      case 'connecting': return 'Connecting...'
      case 'connected': return 'Connected'
      case 'disconnected': return 'Disconnected'
      case 'failed': return 'Connection failed'
      default: return 'Unknown'
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="bg-gray-700 p-3 border-b border-gray-600">
        <h3 className="text-white font-semibold text-sm">🎥 Video Call</h3>
        <p className="text-gray-400 text-xs mt-1">
          Status: {getConnectionStatusText()}
        </p>
      </div>
      
      <div className="flex-1 p-3 overflow-auto">
        {error && (
          <div className="mb-3 p-2 bg-red-900/50 border border-red-500 rounded text-red-400 text-xs">
            {error}
          </div>
        )}
        
        {!isCallActive ? (
          <div className="h-full flex flex-col items-center justify-center">
            <button
              onClick={startCall}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full font-semibold"
            >
              Start Call
            </button>
            <p className="text-gray-400 text-xs mt-4">
              Allow camera and microphone access
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 h-full min-h-[200px]">
            {/* Local Video */}
            <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                You {!isVideoEnabled && '(Camera Off)'}
              </div>
            </div>
            
            {/* Remote Video */}
            <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                {remoteStreamActive ? 'Peer' : getConnectionStatusText()}
              </div>
              {!remoteStreamActive && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Controls - Always at bottom */}
      {isCallActive && (
        <div className="p-3 border-t border-gray-700 bg-gray-800">
          <div className="flex justify-center gap-3">
            <button
              onClick={toggleVideo}
              className={`px-4 py-2 rounded-lg ${
                isVideoEnabled ? 'bg-blue-600' : 'bg-red-600'
              } text-white text-sm`}
            >
              {isVideoEnabled ? 'Camera' : 'Camera Off'}
            </button>
            <button
              onClick={toggleAudio}
              className={`px-4 py-2 rounded-lg ${
                isAudioEnabled ? 'bg-blue-600' : 'bg-red-600'
              } text-white text-sm`}
            >
              {isAudioEnabled ? 'Mic' : 'Mic Off'}
            </button>
            <button
              onClick={endCall}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm"
            >
              End Call
            </button>
          </div>
        </div>
      )}
    </div>
  )
}