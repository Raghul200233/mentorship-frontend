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
  }

  useEffect(() => {
    if (!socket) return

    const handleOffer = async (data: { offer: RTCSessionDescriptionInit; fromUserId: string }) => {
      if (data.fromUserId === userId) return
      console.log('📞 Received offer from:', data.fromUserId)
      await handleOfferInternal(data.offer)
    }

    const handleAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      console.log('📞 Received answer')
      await handleAnswerInternal(data.answer)
    }

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      await handleIceCandidateInternal(data.candidate)
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
        console.log('📡 Sending ICE candidate')
        socket.emit('webrtc-ice-candidate', { sessionId, candidate: event.candidate })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'connected') {
        console.log('✅ ICE connected!')
        setRemoteStreamActive(true)
      }
    }

    pc.ontrack = (event) => {
      console.log('📺 Received remote track:', event.streams[0].getTracks().length)
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
      console.log('🎥 Starting call...')
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      })
      
      localStreamRef.current = stream
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        console.log('Local video attached')
      }
      
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)

      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('webrtc-offer', { sessionId, offer: pc.localDescription })
      console.log('📞 Offer sent')

      setIsCallActive(true)
    } catch (error) {
      console.error('Error starting call:', error)
      alert('Please allow camera and microphone access')
    }
  }

  const handleOfferInternal = async (offer: RTCSessionDescriptionInit) => {
    try {
      console.log('Processing offer...')
      
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
      console.log('Remote description set')
      
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('webrtc-answer', { sessionId, answer: pc.localDescription })
      console.log('Answer sent')

      setIsCallActive(true)
    } catch (error) {
      console.error('Error handling offer:', error)
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
                {remoteStreamActive ? 'Peer' : 'Waiting for peer...'}
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
                You {!isVideoEnabled && '(Camera Off)'}
              </div>
            </div>
          </div>

          {/* Controls */}
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