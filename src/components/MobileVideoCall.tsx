import { useEffect, useRef, useState } from 'react'

interface MobileVideoCallProps {
  socket: any;
  userId: string;
  sessionId: string;
  isMentor: boolean;
  onClose: () => void;
}

export function MobileVideoCall({ socket, userId, sessionId, isMentor, onClose }: MobileVideoCallProps) {
  const [isCallActive, setIsCallActive] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [remoteStreamActive, setRemoteStreamActive] = useState(false)
  const [connectionState, setConnectionState] = useState<string>('new')
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])

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
    pendingCandidatesRef.current = []
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
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null
        }
        setRemoteStreamActive(false)
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setRemoteStreamActive(true)
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

      while (pendingCandidatesRef.current.length) {
        const candidate = pendingCandidatesRef.current.shift()
        if (candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (e) {
            console.error('Error adding pending candidate:', e)
          }
        }
      }

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
      
      while (pendingCandidatesRef.current.length) {
        const candidate = pendingCandidatesRef.current.shift()
        if (candidate) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (e) {
            console.error('Error adding pending candidate after answer:', e)
          }
        }
      }
    } catch (error) {
      console.error('Error handling answer:', error)
    }
  }

  const handleIceCandidate = async ({ candidate }: any) => {
    if (!peerConnectionRef.current) {
      pendingCandidatesRef.current.push(candidate)
      return
    }

    try {
      if (peerConnectionRef.current.remoteDescription) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
      } else {
        pendingCandidatesRef.current.push(candidate)
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

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 p-4 flex justify-between items-center border-b border-gray-700">
        <h3 className="text-white font-semibold">🎥 Video Call</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-2xl"
        >
          ✕
        </button>
      </div>
      
      {/* Video Container */}
      <div className="flex-1 p-4">
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
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
              You {!isVideoEnabled && '(Camera Off)'}
            </div>
          </div>
          
          {/* Remote Video */}
          <div className="relative bg-gray-900 rounded-lg overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
              {remoteStreamActive ? 'Peer' : connectionState}
            </div>
            {!remoteStreamActive && isCallActive && connectionState !== 'connected' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                  <div className="text-sm">Connecting...</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Controls */}
      <div className="bg-gray-900 p-6 border-t border-gray-700">
        {!isCallActive ? (
          <button
            onClick={startCall}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-xl text-lg transition"
          >
            📞 Start Call
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3">
              <button
                onClick={toggleVideo}
                className={`flex-1 py-4 rounded-xl font-semibold text-base transition ${
                  isVideoEnabled 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-red-600 hover:bg-red-700'
                } text-white`}
              >
                {isVideoEnabled ? '🎥 Camera On' : '🎥 Camera Off'}
              </button>
              <button
                onClick={toggleAudio}
                className={`flex-1 py-4 rounded-xl font-semibold text-base transition ${
                  isAudioEnabled 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-red-600 hover:bg-red-700'
                } text-white`}
              >
                {isAudioEnabled ? '🎤 Mic On' : '🎤 Mic Off'}
              </button>
            </div>
            <button
              onClick={endCall}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-4 rounded-xl text-lg transition"
            >
              📞 End Call
            </button>
          </div>
        )}
      </div>
    </div>
  )
}