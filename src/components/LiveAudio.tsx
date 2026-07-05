import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Volume2, Square, X } from 'lucide-react';

export default function LiveAudio({ onClose }: { onClose: () => void }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  // Helper for base64 conversion
  const pcmToBase64 = (pcmData: Float32Array) => {
    const buffer = new ArrayBuffer(pcmData.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < pcmData.length; i++) {
      let s = Math.max(-1, Math.min(1, pcmData[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const playAudioChunk = (base64Audio: string) => {
    try {
      const audioCtx = outputAudioCtxRef.current;
      if (!audioCtx) return;

      const binaryStr = atob(base64Audio);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = audioCtx.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 0x8000;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      
      const currentTime = audioCtx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      setIsSpeaking(true);
      
      source.onended = () => {
        if (audioCtx.currentTime >= nextStartTimeRef.current) {
          setIsSpeaking(false);
        }
      };
    } catch (e) {
      console.error("Playback error", e);
    }
  };

  const startConnection = async () => {
    try {
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputCtx;
      
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      source.connect(processor);
      processor.connect(inputCtx.destination);
      
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/live`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setIsConnected(true);
        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN && !isMuted) {
            const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: base64 }));
          }
        };
      };
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          playAudioChunk(msg.audio);
        }
        if (msg.interrupted) {
          if (outputAudioCtxRef.current) {
             // Stop playback logic is a bit complex, simplest is just reset the time tracker
             nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
             setIsSpeaking(false);
          }
        }
      };
      
      ws.onclose = () => {
        setIsConnected(false);
        cleanup();
      };
      
    } catch (err) {
      console.error("Failed to start Live API", err);
      cleanup();
    }
  };

  const cleanup = () => {
    if (processorRef.current && inputAudioCtxRef.current) {
      processorRef.current.disconnect();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close();
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close();
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsConnected(false);
  };

  useEffect(() => {
    startConnection();
    return () => cleanup();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-sm overflow-hidden flex flex-col relative"
      >
        <div className="absolute top-4 right-4">
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-sm text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 flex flex-col items-center">
          <h2 className="font-mono text-xl uppercase font-bold text-white mb-2">Live Transmission</h2>
          <p className="text-xs font-mono text-zinc-500 mb-8 text-center uppercase tracking-widest">
            {isConnected ? "Secure Channel Open" : "Establishing Link..."}
          </p>

          <div className="relative mb-10 mt-6">
            <div className={`absolute inset-0 rounded-full border border-red-500/30 ${isSpeaking ? 'animate-ping' : ''}`} />
            <div className={`w-24 h-24 rounded-full flex items-center justify-center border-2 shadow-2xl transition-all duration-300 ${isSpeaking ? 'border-red-500 bg-red-950/20 shadow-red-900/50' : 'border-zinc-800 bg-zinc-900 shadow-zinc-900/50'}`}>
               {isSpeaking ? (
                 <Volume2 className="w-10 h-10 text-red-500" />
               ) : (
                 <div className="w-4 h-4 bg-zinc-700 rounded-full animate-pulse" />
               )}
            </div>
          </div>

          <div className="flex gap-4 w-full">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              disabled={!isConnected}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-sm font-mono text-xs uppercase tracking-wider font-bold transition-colors ${
                isMuted 
                  ? "bg-amber-950 text-amber-500 border border-amber-900/50 hover:bg-amber-900" 
                  : "bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800"
              }`}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isMuted ? "Mic Muted" : "Mute Mic"}
            </button>
            <button 
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-950/50 hover:bg-red-900 text-red-500 border border-red-900/50 rounded-sm font-mono text-xs uppercase tracking-wider font-bold transition-colors"
            >
              <Square className="w-4 h-4" />
              End Link
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
