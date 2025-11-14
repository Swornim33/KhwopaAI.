import { useState, useRef, useCallback, useEffect } from 'react';
// FIX: Removed non-exported 'LiveSession' type from import.
import { GoogleGenAI, Modality } from "@google/genai";
import type { LiveServerMessage, Blob } from "@google/genai";
import { getSystemInstruction } from '../services/geminiService';

// FIX: Add global type declaration for 'webkitAudioContext' to handle vendor-prefixed API and resolve type errors.
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

// Regex to detect various forms of API key/authentication errors.
const API_KEY_ERROR_REGEX = /API key|credential|permission|not valid|not found|authentication|401|403|Requested entity was not found/i;

// --- Helper Functions for Audio Encoding/Decoding ---

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// --- Custom Hook ---

interface UseLiveConversationProps {
  onTurnComplete: (userText: string, botText: string) => void;
  onError: (error: Error) => void;
  gender: 'male' | 'female';
}

export const useLiveConversation = ({ onTurnComplete, onError, gender }: UseLiveConversationProps) => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  // FIX: Updated ref type to use Promise<any> since LiveSession is not an exported type.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  const userInputRef = useRef('');
  const botOutputRef = useRef('');

  const cleanup = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
     if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    setIsSessionActive(false);
  }, []);

  const endSession = useCallback(() => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close()).catch(e => console.warn("Error closing session:", e));
      sessionPromiseRef.current = null;
    }
    cleanup();
  }, [cleanup]);

  const startSession = useCallback(async () => {
    if (isSessionActive) return;
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: getSystemInstruction(),
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: gender === 'female' ? 'Kore' : 'Zephyr' }
              },
          },
        },
        callbacks: {
          onopen: () => {
            setIsSessionActive(true);
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle transcriptions
            if (message.serverContent?.inputTranscription) {
                userInputRef.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
                botOutputRef.current += message.serverContent.outputTranscription.text;
            }
            if (message.serverContent?.turnComplete) {
                onTurnComplete(userInputRef.current, botOutputRef.current);
                userInputRef.current = '';
                botOutputRef.current = '';
            }

            // Handle audio playback
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const outputCtx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

             if (message.serverContent?.interrupted) {
                for (const source of sourcesRef.current.values()) {
                    source.stop();
                    sourcesRef.current.delete(source);
                }
                nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Live session error:', e.message);
            if (API_KEY_ERROR_REGEX.test(e.message)) {
                onError(new Error('API_KEY_NOT_SELECTED'));
            } else {
                onError(new Error('Network error'));
            }
            endSession();
          },
          onclose: () => {
            endSession();
          },
        },
      });
      // The promise resolves when the connection is open
      await sessionPromiseRef.current;

    } catch (err: any) {
      console.error('Failed to start live session:', err);
      cleanup();
      
      const errorMessage = err.message || JSON.stringify(err);
      
      if (API_KEY_ERROR_REGEX.test(errorMessage)) {
        throw new Error('API_KEY_NOT_SELECTED');
      }
      if (errorMessage.includes('permission denied')) {
        throw new Error('Microphone permission denied.');
      }
      
      throw new Error('Network error');
    }
  }, [isSessionActive, onTurnComplete, cleanup, endSession, onError, gender]);

  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

  return { startSession, endSession, isSessionActive };
};