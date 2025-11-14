import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import type { LiveServerMessage, Blob } from "@google/genai";
import { getSystemInstruction } from '../services/geminiService';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const API_KEY_ERROR_REGEX = /API key|credential|permission|not valid|not found|authentication|401|403|Requested entity was not found/i;

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
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
  for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
  return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
}

interface UseLiveConversationProps {
  onTurnComplete: (userText: string, botText: string) => void;
  onError: (error: Error) => void;
  gender: 'male' | 'female';
}

export const useLiveConversation = ({ onTurnComplete, onError, gender }: UseLiveConversationProps) => {
  const [isSessionActive, setIsSessionActive] = useState(false);
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
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
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
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setIsSessionActive(false);
  }, []);

  const endSession = useCallback(() => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(s => s.close()).catch(() => {});
      sessionPromiseRef.current = null;
    }
    cleanup();
  }, [cleanup]);

  const startSession = useCallback(async () => {
    if (isSessionActive) return;
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      onError(new Error('API_KEY_NOT_SELECTED'));
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });

      // --- Retry logic for overloaded model ---
      const MAX_RETRIES = 3;
      let retries = 0;
      let session: any;
      while (retries < MAX_RETRIES) {
        try {
          session = await ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
              responseModalities: [Modality.AUDIO],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: getSystemInstruction(),
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: gender === 'female' ? 'Kore' : 'Zephyr' } } },
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
                  session.sendRealtimeInput({ media: pcmBlob });
                };
                source.connect(scriptProcessor);
                scriptProcessor.connect(inputAudioContextRef.current!.destination);
              },
              onmessage: async (msg: LiveServerMessage) => {
                if (msg.serverContent?.inputTranscription) userInputRef.current += msg.serverContent.inputTranscription.text;
                if (msg.serverContent?.outputTranscription) botOutputRef.current += msg.serverContent.outputTranscription.text;
                if (msg.serverContent?.turnComplete) {
                  onTurnComplete(userInputRef.current, botOutputRef.current);
                  userInputRef.current = '';
                  botOutputRef.current = '';
                }

                const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
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

                if (msg.serverContent?.interrupted) {
                  sourcesRef.current.forEach(s => s.stop());
                  sourcesRef.current.clear();
                  nextStartTimeRef.current = 0;
                }
              },
              onerror: (e: ErrorEvent) => {
                console.error('Live session error:', e.message);
                if (API_KEY_ERROR_REGEX.test(e.message)) onError(new Error('API_KEY_NOT_SELECTED'));
                else onError(new Error('Network error'));
                endSession();
              },
              onclose: () => endSession(),
            },
          });
          break; // connected successfully
        } catch (err: any) {
          if (err?.status === 503) {
            retries++;
            await new Promise(r => setTimeout(r, 1000));
          } else throw err;
        }
      }
      if (!session) throw new Error('Failed to start live session');
      sessionPromiseRef.current = Promise.resolve(session);
    } catch (err: any) {
      cleanup();
      const msg = err.message || JSON.stringify(err);
      if (API_KEY_ERROR_REGEX.test(msg)) throw new Error('API_KEY_NOT_SELECTED');
      if (msg.includes('permission denied')) throw new Error('Microphone permission denied.');
      throw new Error('Network error');
    }
  }, [isSessionActive, onTurnComplete, cleanup, endSession, onError, gender]);

  useEffect(() => endSession, [endSession]);

  return { startSession, endSession, isSessionActive };
};
