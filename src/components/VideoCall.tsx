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
  const [error, setError] = useState<string>('')
  const [localVideoReady, setLocalVideoReady] = useState(false)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const cleanupCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
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
  }

  useEffect(() => {
    if (!socket) return

    const handleOffer = async (data: { offer: RTCSessionDescriptionInit; fromUserId: string }) => {
      if (data.fromUserId === userId) return
      await handleOfferInternal(data.offer)
    }

    const handleAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      await handleAnswerInternal(data.answer)
    }

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      await handleIceCandidateInternal(data.candidate)
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

  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    }

    const pc = new RTCPeerConnection(configuration)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', { sessionId, candidate: event.candidate })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState)
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
        console.log('Added track:', track.kind)
      })
    }

    return pc
  }

  const startCall = async () => {
    try {
      setError('')
      console.log('Starting call...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: true 
      })
      
      localStreamRef.current = stream
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.onloadedmetadata = () => {
          console.log('Local video loaded')
          setLocalVideoReady(true)
        }
        localVideoRef.current.play()
      }
      
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)

      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('webrtc-offer', { sessionId, offer: pc.localDescription })
      console.log('Offer sent')

      setIsCallActive(true)
    } catch (error: any) {
      console.error('Error:', error)
      if (error.name === 'NotAllowedError') {
        setError('Please allow camera and microphone access')
      } else {
        setError('Unable to access camera/microphone')
      }
    }
  }

  const handleOfferInternal = async (offer: RTCSessionDescriptionInit) => {
    try {
      console.log('Processing offer...')
      
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }, 
          audio: true 
        })
        localStreamRef.current = stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.onloadedmetadata = () => {
            console.log('Local video loaded')
            setLocalVideoReady(true)
          }
          localVideoRef.current.play()
        }
        setIsVideoEnabled(true)
        setIsAudioEnabled(true)
      }

      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      console.log('Remote description set')
      
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('webrtc-answer', { sessionId, answer: pc.localDescription })
      console.log('Answer sent')

      setIsCallActive(true)
    } catch (error) {
      console.error('Error handling offer:', error)
      setError('Failed to connect to peer')
    }
  }

  const handleAnswerInternal = async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
    console.log('Remote description set from answer')
  }

  const handleIceCandidateInternal = async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) return
    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
  }

  const endCall = () => {
    cleanupCall()
    socket.emit('end-call', { sessionId })
  }

  return (
    <div className="bg-gray-800">
      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-900/50 border-b border-red-500">
          <p className="text-red-400 text-sm text-center">{error}</p>
        </div>
      )}

      {!isCallActive ? (
        <div className="p-6 text-center">
          <button
            onClick={startCall}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full font-semibold transition"
          >
            Start Call
          </button>
        </div>
      ) : (
        <>
          {/* 2 VIDEO IMAGES - SIDE BY SIDE */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-900">
            {/* PEER VIDEO (LEFT) */}
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                {remoteStreamActive ? 'Peer' : 'Waiting...'}
              </div>
              {!remoteStreamActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-80">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-1"></div>
                    <p className="text-white text-xs">Connecting to peer...</p>
                  </div>
                </div>
              )}
            </div>

            {/* YOUR VIDEO (RIGHT) */}
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
              {!localVideoReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-80">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-1"></div>
                    <p className="text-white text-xs">Starting camera...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CONTROLS */}
          <div className="flex justify-center gap-4 p-3 bg-gray-800 border-t border-gray-700">
            <button
              onClick={toggleAudio}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                isAudioEnabled 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-red-600 hover:bg-red-700'
              } text-white`}
            >
              {isAudioEnabled ? 'Mic On' : 'Mic Off'}
            </button>
            <button
              onClick={toggleVideo}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                isVideoEnabled 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-red-600 hover:bg-red-700'
              } text-white`}
            >
              {isVideoEnabled ? 'Camera On' : 'Camera Off'}
            </button>
            <button
              onClick={endCall}
              className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition"
            >
              End Call
            </button>
          </div>
        </>
      )}
    </div>
  )
}