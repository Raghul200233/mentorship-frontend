import { useEffect, useRef, useState } from 'react'

export function VideoCall({ socket, userId, sessionId, isMentor }: any) {
  const [isCallActive, setIsCallActive] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [remoteStreamActive, setRemoteStreamActive] = useState(false)
  const [connectionState, setConnectionState] = useState<string>('new')
  const [error, setError] = useState<string>('')
  const [remoteUserId, setRemoteUserId] = useState<string>('')
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // Listen for user joined/left events
  useEffect(() => {
    if (!socket) return

    socket.on('user-joined', ({ userId: joinedUserId }) => {
      console.log('User joined:', joinedUserId)
      setRemoteUserId(joinedUserId)
    })

    socket.on('user-left', ({ userId: leftUserId }) => {
      console.log('User left:', leftUserId)
      if (isCallActive) {
        setError('The other user has left the session')
        endCall()
      }
    })

    return () => {
      socket.off('user-joined')
      socket.off('user-left')
    }
  }, [socket, isCallActive])

  useEffect(() => {
    if (!socket) return

    socket.on('webrtc-offer', handleOffer)
    socket.on('webrtc-answer', handleAnswer)
    socket.on('webrtc-ice-candidate', handleIceCandidate)
    socket.on('peer-ended-call', handlePeerEndedCall)

    return () => {
      socket.off('webrtc-offer')
      socket.off('webrtc-answer')
      socket.off('webrtc-ice-candidate')
      socket.off('peer-ended-call')
    }
  }, [socket])

  const handlePeerEndedCall = () => {
    console.log('Peer ended call')
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    setRemoteStreamActive(false)
    setConnectionState('disconnected')
    setError('The other user ended the call')
  }

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
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    }

    const pc = new RTCPeerConnection(configuration)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('📡 Sending ICE candidate')
        socket.emit('webrtc-ice-candidate', {
          sessionId,
          candidate: event.candidate
        })
      } else {
        console.log('ICE gathering complete')
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('🔌 ICE connection state:', pc.iceConnectionState)
      setConnectionState(pc.iceConnectionState)
      if (pc.iceConnectionState === 'connected') {
        setRemoteStreamActive(true)
        setError('')
      } else if (pc.iceConnectionState === 'failed') {
        setError('Connection failed. Please try again.')
      }
    }

    pc.ontrack = (event) => {
      console.log('📺 Received remote stream')
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
        setRemoteStreamActive(true)
        console.log('Remote stream attached')
      }
    }

    // Add local tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!)
        console.log('Added track:', track.kind)
      })
    }

    return pc
  }

  const startCall = async () => {
    try {
      setError('')
      console.log('🎥 Starting call...')
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      
      console.log('Got local stream, tracks:', stream.getTracks().map(t => t.kind))
      localStreamRef.current = stream
      
      // Display local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.play().catch(e => console.log('Play error:', e))
      }
      
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)

      // Create peer connection
      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true
      })
      await pc.setLocalDescription(offer)
      
      socket.emit('webrtc-offer', {
        sessionId,
        offer: pc.localDescription
      })

      setIsCallActive(true)
      setConnectionState('connecting')
      console.log('📞 Call started, offer sent')
    } catch (error: any) {
      console.error('Error starting call:', error)
      if (error.name === 'NotAllowedError') {
        setError('Please allow camera and microphone access')
      } else if (error.name === 'NotFoundError') {
        setError('No camera or microphone found')
      } else {
        setError('Failed to start call: ' + error.message)
      }
    }
  }

  const handleOffer = async ({ offer, fromUserId }: any) => {
    if (fromUserId === userId) return
    
    console.log('📞 Received offer from:', fromUserId)

    try {
      setError('')
      
      // Get user media if not already
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        localStreamRef.current = stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.play().catch(e => console.log('Play error:', e))
        }
        setIsVideoEnabled(true)
        setIsAudioEnabled(true)
      }

      // Create peer connection
      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      // Set remote description
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      
      // Create and send answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      socket.emit('webrtc-answer', {
        sessionId,
        answer: pc.localDescription
      })

      setIsCallActive(true)
      setConnectionState('connecting')
      console.log('📞 Answer sent')
    } catch (error: any) {
      console.error('Error handling offer:', error)
      setError('Failed to connect: ' + error.message)
    }
  }

  const handleAnswer = async ({ answer }: any) => {
    if (!peerConnectionRef.current) return
    
    console.log('📞 Received answer')
    try {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
      console.log('✅ Remote description set')
    } catch (error) {
      console.error('Error handling answer:', error)
      setError('Failed to set remote description')
    }
  }

  const handleIceCandidate = async ({ candidate }: any) => {
    if (!peerConnectionRef.current) return

    try {
      if (peerConnectionRef.current.remoteDescription) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        console.log('✅ ICE candidate added')
      } else {
        console.log('Waiting for remote description to add ICE candidate')
        // Store candidate for later
        setTimeout(async () => {
          if (peerConnectionRef.current?.remoteDescription) {
            try {
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
              console.log('✅ Delayed ICE candidate added')
            } catch (err) {
              console.error('Error adding delayed ICE candidate:', err)
            }
          }
        }, 1000)
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error)
    }
  }

  const endCall = () => {
    console.log('📞 Ending call')
    
    // Stop all tracks
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
          {isCallActive ? `Status: ${getConnectionStatusText()}` : 'Click Start Call to begin'}
        </p>
      </div>
      
      <div className="flex-1 p-3">
        {error && (
          <div className="mb-3 p-2 bg-red-900/50 border border-red-500 rounded text-red-400 text-xs">
            {error}
          </div>
        )}
        
        {!isCallActive ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">📞</div>
              <button
                onClick={startCall}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full font-semibold transition"
              >
                Start Call
              </button>
              <p className="text-gray-400 text-xs mt-4">
                Allow camera and microphone access when prompted
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 h-full">
            {/* Local Video */}
            <div className="relative bg-gray-900 rounded-lg overflow-hidden">
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
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <span className="text-white text-sm">Camera is off</span>
                </div>
              )}
            </div>
            
            {/* Remote Video */}
            <div className="relative bg-gray-900 rounded-lg overflow-hidden">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${remoteStreamActive ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></span>
                {remoteStreamActive ? 'Peer' : getConnectionStatusText()}
              </div>
              {!remoteStreamActive && connectionState !== 'connected' && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                    <p className="text-white text-sm">{getConnectionStatusText()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {isCallActive && (
        <div className="p-3 border-t border-gray-700">
          <div className="flex justify-center gap-3">
            <button
              onClick={toggleVideo}
              className={`px-4 py-2 rounded-lg transition ${
                isVideoEnabled 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-red-600 hover:bg-red-700'
              } text-white`}
            >
              {isVideoEnabled ? '🎥 Camera' : '🎥 Off'}
            </button>
            <button
              onClick={toggleAudio}
              className={`px-4 py-2 rounded-lg transition ${
                isAudioEnabled 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-red-600 hover:bg-red-700'
              } text-white`}
            >
              {isAudioEnabled ? '🎤 Mic' : '🎤 Off'}
            </button>
            <button
              onClick={endCall}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition"
            >
              📞 End Call
            </button>
          </div>
        </div>
      )}
    </div>
  )
}