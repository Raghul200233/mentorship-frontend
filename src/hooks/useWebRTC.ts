import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { getSocket } from '@/utils/socket';

export const useWebRTC = (sessionId: string, userId: string) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const socket = getSocket();

  useEffect(() => {
    const startVideo = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        setStream(mediaStream);
      } catch (error) {
        console.error('Error accessing media devices:', error);
      }
    };

    startVideo();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!stream) return;

    const PeerClass = Peer as any;
    const peer = new PeerClass({
      initiator: true,
      stream: stream,
      trickle: false
    });

    peer.on('signal', (signal: any) => {
      socket.emit('webrtc-signal', { sessionId, signal });
    });

    peer.on('stream', (remoteStream: MediaStream) => {
      setRemoteStream(remoteStream);
    });

    peerRef.current = peer;

    socket.on('webrtc-signal', ({ signal }: { signal: any }) => {
      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    });

    return () => {
      peer.destroy();
      socket.off('webrtc-signal');
    };
  }, [stream, sessionId, socket]);

  return { stream, remoteStream };
};