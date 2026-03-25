import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { Socket } from 'socket.io-client';

interface UseWebRTCProps {
  socket: Socket | null;
  sessionId: string;
  userId: string;
}

export const useWebRTC = ({ socket, sessionId, userId }: UseWebRTCProps) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  
  const peerRef = useRef<Peer.Instance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  // Start call
  const startCall = async () => {
    try {
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(true);
      setIsAudioEnabled(true);

      // Create peer connection
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: stream
      });

      peer.on('signal', (data) => {
        socket?.emit('webrtc-offer', {
          sessionId,
          signal: data
        });
      });

      peer.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
      });

      peerRef.current = peer;
      setIsCallActive(true);
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Please allow camera and microphone access');
    }
  };

  // End call
  const endCall = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    setLocalStream(null);
    setRemoteStream(null);
    setIsCallActive(false);
    
    socket?.emit('end-call', { sessionId });
  };

  // Handle incoming offer
  const handleOffer = async (signal: any, fromUserId: string) => {
    if (fromUserId === userId) return;

    try {
      // Get user media if not already
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoEnabled(true);
        setIsAudioEnabled(true);
      }

      // Create peer connection
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: localStreamRef.current
      });

      peer.on('signal', (data) => {
        socket?.emit('webrtc-answer', {
          sessionId,
          signal: data
        });
      });

      peer.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
      });

      peer.signal(signal);
      peerRef.current = peer;
      setIsCallActive(true);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  // Handle answer
  const handleAnswer = (signal: any) => {
    if (peerRef.current) {
      peerRef.current.signal(signal);
    }
  };

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return;

    const onOffer = ({ signal, fromUserId }: any) => {
      handleOffer(signal, fromUserId);
    };

    const onAnswer = ({ signal }: any) => {
      handleAnswer(signal);
    };

    const onIceCandidate = ({ candidate }: any) => {
      if (peerRef.current) {
        peerRef.current.signal(candidate);
      }
    };

    const onCallEnded = () => {
      endCall();
    };

    socket.on('webrtc-offer', onOffer);
    socket.on('webrtc-answer', onAnswer);
    socket.on('webrtc-ice-candidate', onIceCandidate);
    socket.on('call-ended', onCallEnded);
    socket.on('peer-ended-call', onCallEnded);

    return () => {
      socket.off('webrtc-offer', onOffer);
      socket.off('webrtc-answer', onAnswer);
      socket.off('webrtc-ice-candidate', onIceCandidate);
      socket.off('call-ended', onCallEnded);
      socket.off('peer-ended-call', onCallEnded);
    };
  }, [socket, sessionId, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, []);

  return {
    localStream,
    remoteStream,
    isCallActive,
    isVideoEnabled,
    isAudioEnabled,
    startCall,
    endCall,
    toggleVideo,
    toggleAudio
  };
};