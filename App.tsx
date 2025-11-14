import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { KhwopaAILogo } from './components/icons/KhwopaAILogo';
import { LoadingIcon } from './components/icons/LoadingIcon';
import { PhoneIcon } from './components/icons/PhoneIcon';
import { PhoneOffIcon } from './components/icons/PhoneOffIcon';
import { FemaleIcon } from './components/icons/FemaleIcon';
import { MaleIcon } from './components/icons/MaleIcon';
import { sendMessageToGemini } from './services/geminiService';
import { useSpeech } from './hooks/useSpeech';
import { useLiveConversation } from './hooks/useLiveConversation';
import type { Message } from './types';

type VoiceGender = 'female' | 'male';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('female');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    speak,
    cancelSpeech,
    isSpeaking,
    startListening,
    stopListening,
    isListening,
    transcript,
    speechRecognitionSupported,
  } = useSpeech();

  const handleTurnComplete = useCallback((userText: string, botText: string) => {
    if (userText) {
      const userMessage: Message = { role: 'user', content: userText, id: Date.now() };
      setMessages(prev => [...prev, userMessage]);
    }
    if (botText) {
      const botMessage: Message = { role: 'bot', content: botText, id: Date.now() + 1 };
      setMessages(prev => [...prev, botMessage]);
    }
  }, []);
  
  const handleLiveError = useCallback((error: Error) => {
    console.error("Live conversation error handler received:", error.message);
    if (error.message === 'API_KEY_NOT_SELECTED') {
      setIsApiKeyModalOpen(true);
    } else {
      alert(`An error occurred during the live session: ${error.message}`);
    }
  }, []);

  const { startSession, endSession, isSessionActive } = useLiveConversation({ 
    onTurnComplete: handleTurnComplete,
    onError: handleLiveError,
    gender: voiceGender
  });

  useEffect(() => {
    try {
      const initialMessage: Message = {
            role: 'bot',
            content: "Namaste! My name is Khwopa AI. Any help needed?",
            id: Date.now(),
      };
      const storedMessages = localStorage.getItem('roast-chat-history');
      if (storedMessages) {
        const parsedMessages = JSON.parse(storedMessages);
        if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
            setMessages(parsedMessages);
        } else {
            setMessages([initialMessage]);
        }
      } else {
        setMessages([initialMessage]);
      }
    } catch (error) {
      console.error("Failed to load messages from localStorage", error);
       setMessages([
          {
            role: 'bot',
            content: "Namaste! My name is Khwopa AI. Any help needed?",
            id: Date.now(),
          },
        ]);
    }
  }, []);

  // Removed useEffect that auto-played initial message to prevent "not-allowed" speech synthesis error.
  // The user can press the play button on the message to hear it.

  useEffect(() => {
    try {
        if(messages.length > 0) {
            localStorage.setItem('roast-chat-history', JSON.stringify(messages));
        }
    } catch (error) {
      console.error("Failed to save messages to localStorage", error);
    }
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    cancelSpeech();

    const newUserMessage: Message = {
      role: 'user',
      content: text,
      id: Date.now(),
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const history = messages.map(({ role, content }) => ({
        role: role === 'bot' ? 'model' : 'user',
        parts: [{ text: content }] 
      }));
      const botResponseText = await sendMessageToGemini(text, history);
      
      const newBotMessage: Message = {
        role: 'bot',
        content: botResponseText,
        id: Date.now() + 1,
      };
      
      setMessages((prev) => [...prev, newBotMessage]);
      speak(botResponseText, voiceGender);
    } catch (error) {
      console.error('Error getting response from Gemini:', error);
      const errorMessage: Message = {
        role: 'bot',
        content: "My circuits must be overheating. I can't think of a good roast right now. You got lucky. 🤕",
        id: Date.now() + 1,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, speak, cancelSpeech, voiceGender]);
  
  // Helper function to encapsulate the session start attempt and error handling.
  // This avoids unreliable pre-checks and relies on the actual API call's result.
  const tryStartLiveSession = async () => {
    try {
      await startSession();
    } catch (error: any) {
      handleLiveError(error);
    }
  };

  const toggleLiveMode = () => {
    if (isSessionActive) {
      endSession();
    } else {
      cancelSpeech();
      tryStartLiveSession();
    }
  };

  const handleSelectKeyAndRetry = async () => {
    // The promise from openSelectKey resolves when the user closes the dialog.
    await window.aistudio.openSelectKey();
    setIsApiKeyModalOpen(false);
    
    // After selection, we assume success and immediately retry starting the session.
    // This avoids the race condition associated with hasSelectedApiKey().
    tryStartLiveSession();
  };


  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-800 text-white font-sans">
      <div className="flex-shrink-0 p-4 bg-black/30 backdrop-blur-sm shadow-lg flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <KhwopaAILogo className="w-10 h-10" />
          <div>
            <h1 className="text-xl font-bold">Khwopa AI</h1>
            <p className="text-sm text-gray-400">Your witty AI companion.</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
            <div className="flex items-center bg-gray-800/50 rounded-full p-1 space-x-1">
                <button
                    onClick={() => setVoiceGender('female')}
                    className={`p-1.5 rounded-full transition-colors duration-300 ${voiceGender === 'female' ? 'bg-pink-600' : 'hover:bg-gray-700'}`}
                    title="Female Voice"
                >
                    <FemaleIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={() => setVoiceGender('male')}
                    className={`p-1.5 rounded-full transition-colors duration-300 ${voiceGender === 'male' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                    title="Male Voice"
                >
                    <MaleIcon className="w-5 h-5" />
                </button>
            </div>
             <div className="w-px h-6 bg-gray-600/70" />
            <button
                onClick={toggleLiveMode}
                className={`p-2 rounded-full transition-colors duration-300 ${isSessionActive ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-green-500 hover:bg-green-600'}`}
                title={isSessionActive ? 'End Live Chat' : 'Start Live Chat'}
            >
                {isSessionActive ? <PhoneOffIcon className="w-5 h-5" /> : <PhoneIcon className="w-5 h-5" />}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isSpeaking={isSpeaking}
            onToggleSpeech={() => (isSpeaking ? cancelSpeech() : speak(msg.content, voiceGender))}
          />
        ))}
        {isLoading && (
          <div className="flex justify-start items-center space-x-3 animate-fade-in-up">
            <KhwopaAILogo className="w-8 h-8 flex-shrink-0" />
            <div className="bg-gray-700 rounded-lg p-3 max-w-md">
              <LoadingIcon className="w-6 h-6" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-black/30 backdrop-blur-sm">
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          isListening={isListening}
          startListening={startListening}
          stopListening={stopListening}
          transcript={transcript}
          speechRecognitionSupported={speechRecognitionSupported}
          isLiveMode={isSessionActive}
        />
      </div>

      {isApiKeyModalOpen && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-sm w-full text-center shadow-2xl animate-fade-in-up">
            <h2 className="text-2xl font-bold text-white mb-4">API Key Required</h2>
            <p className="text-gray-300 mb-6">
              The live voice conversation feature requires a valid API key. Please select one to continue.
            </p>
            <p className="text-xs text-gray-400 mb-6">
              For more information on billing, please visit{' '}
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                ai.google.dev/gemini-api/docs/billing
              </a>.
            </p>
            <div className="flex justify-center space-x-4">
               <button
                onClick={() => setIsApiKeyModalOpen(false)}
                className="px-6 py-2 rounded-full text-white bg-gray-600 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSelectKeyAndRetry}
                className="px-6 py-2 rounded-full font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors"
              >
                Select API Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;