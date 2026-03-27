import { useState, useRef, useEffect } from 'react'

interface FloatingVideoProps {
  socket: any;
  userId: string;
  sessionId: string;
  isMentor: boolean;
  onOpenFullScreen?: () => void;
}

export function FloatingVideo({ socket, userId, sessionId, isMentor, onOpenFullScreen }: FloatingVideoProps) {
  const [isCallActive, setIsCallActive] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [remoteStreamActive, setRemoteStreamActive] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
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
    pendingCandidatesRef.current = []
  }

  const handlePeerEndedCall = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    setRemoteStreamActive(false)
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
  }

  // Drag functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.controls-overlay')) return
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragStart])

  return (
    <>
      {/* Floating Video Container */}
      {isCallActive && (
        <div
          ref={containerRef}
          className="fixed z-50 cursor-move"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: '280px',
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
          onMouseDown={handleMouseDown}
        >
          <div className="relative bg-gray-900 rounded-xl shadow-2xl overflow-hidden border-2 border-blue-500">
            {/* Video Container */}
            <div className="relative aspect-video">
              {/* Remote Video (Peer) */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              
              {/* Local Video (PiP) */}
              <div className="absolute bottom-2 right-2 w-20 h-16 bg-gray-800 rounded-lg overflow-hidden border-2 border-white shadow-lg">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* Status Badge */}
              {!remoteStreamActive && (
                <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                  Connecting...
                </div>
              )}
              
              {/* Call Duration (Optional) */}
              {remoteStreamActive && (
                <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                  🟢 Connected
                </div>
              )}
            </div>
            
            {/* Controls Overlay - Shows on Click */}
            {showControls && (
              <div 
                className="controls-overlay absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleVideo()
                    }}
                    className={`p-3 rounded-full transition ${
                      isVideoEnabled 
                        ? 'bg-blue-600 hover:bg-blue-700' 
                        : 'bg-red-600 hover:bg-red-700'
                    } text-white`}
                  >
                    {isVideoEnabled ? '🎥' : '🚫'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleAudio()
                    }}
                    className={`p-3 rounded-full transition ${
                      isAudioEnabled 
                        ? 'bg-blue-600 hover:bg-blue-700' 
                        : 'bg-red-600 hover:bg-red-700'
                    } text-white`}
                  >
                    {isAudioEnabled ? '🎤' : '🔇'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      endCall()
                      setShowControls(false)
                    }}
                    className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition"
                  >
                    📞
                  </button>
                </div>
                <p className="text-white text-xs">Click outside to hide</p>
              </div>
            )}
            
            {/* Click to Show Controls */}
            <div 
              className="absolute inset-0 cursor-pointer"
              onClick={() => setShowControls(!showControls)}
            />
          </div>
        </div>
      )}
      
      {/* Start Call Button - Only show when call is not active */}
      {!isCallActive && (
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={startCall}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-full shadow-lg transition flex items-center gap-2"
          >
            <span className="text-xl">📞</span>
            <span className="font-semibold">Start Call</span>
          </button>
        </div>
      )}
    </>
  )
}