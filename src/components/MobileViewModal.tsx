import { useState, useRef, useEffect } from 'react'

interface MobileVideoModalProps {
  socket: any;
  userId: string;
  sessionId: string;
  isMentor: boolean;
  onClose: () => void;
}

export function MobileVideoModal({ socket, userId, sessionId, isMentor, onClose }: MobileVideoModalProps) {
  const [isCallActive, setIsCallActive] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [remoteStreamActive, setRemoteStreamActive] = useState(false)
  const [connectionState, setConnectionState] = useState('new')
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

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
      cleanupCall()
    }
  }, [socket])

  const cleanupCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
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
  }

  const handlePeerEndedCall = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    setRemoteStreamActive(false)
    setConnectionState('disconnected')
  }

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
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', {
          sessionId,
          candidate: event.candidate
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      setConnectionState(pc.iceConnectionState)
      if (pc.iceConnectionState === 'connected') {
        setRemoteStreamActive(true)
      }
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null
        }
        setRemoteStreamActive(false)
      }
    }

    pc.ontrack = (event) => {
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
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
    } catch (error) {
      console.error('Error starting call:', error)
      alert('Please allow camera and microphone access')
    }
  }

  const handleOffer = async ({ offer, fromUserId }: any) => {
    if (fromUserId === userId) return

    try {
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        })
        localStreamRef.current = stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
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
    } catch (error) {
      console.error('Error handling offer:', error)
    }
  }

  const handleAnswer = async ({ answer }: any) => {
    if (!peerConnectionRef.current) return
    
    try {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
    } catch (error) {
      console.error('Error handling answer:', error)
    }
  }

  const handleIceCandidate = async ({ candidate }: any) => {
    if (!peerConnectionRef.current) return

    try {
      if (peerConnectionRef.current.remoteDescription) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error)
    }
  }

  const endCall = () => {
    cleanupCall()
    socket.emit('end-call', { sessionId })
    onClose()
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
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 p-4 flex justify-between items-center border-b border-gray-700">
        <h3 className="text-white font-semibold text-lg">🎥 Video Call</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-2xl"
        >
          ✕
        </button>
      </div>
      
      {/* Video Container */}
      <div className="flex-1 p-4">
        {!isCallActive ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">📞</div>
              <p className="text-gray-400 mb-6">Start a video call to connect with your peer</p>
              <button
                onClick={startCall}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-full font-semibold text-lg transition"
              >
                Start Call
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 h-full">
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
      
      {/* Controls */}
      {isCallActive && (
        <div className="bg-gray-900 p-6 border-t border-gray-700">
          <div className="flex justify-center gap-4">
            <button
              onClick={toggleVideo}
              className={`p-4 rounded-full transition ${
                isVideoEnabled 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-red-600 hover:bg-red-700'
              } text-white`}
            >
              {isVideoEnabled ? '🎥' : '🚫'}
            </button>
            <button
              onClick={toggleAudio}
              className={`p-4 rounded-full transition ${
                isAudioEnabled 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-red-600 hover:bg-red-700'
              } text-white`}
            >
              {isAudioEnabled ? '🎤' : '🔇'}
            </button>
            <button
              onClick={endCall}
              className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition"
            >
              📞
            </button>
          </div>
          <p className="text-center text-gray-400 text-xs mt-4">
            Tap buttons to control your camera and microphone
          </p>
        </div>
      )}
    </div>
  )
}