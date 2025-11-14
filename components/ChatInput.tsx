import React, { useState, useEffect } from 'react';
import { SendIcon } from './icons/SendIcon';
import { MicrophoneIcon } from './icons/MicrophoneIcon';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  transcript: string;
  speechRecognitionSupported: boolean;
  isLiveMode: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading,
  isListening,
  startListening,
  stopListening,
  transcript,
  speechRecognitionSupported,
  isLiveMode,
}) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };
  
  const getPlaceholder = () => {
      if (isLiveMode) return 'Live voice chat is active...';
      if (isListening) return 'Listening...';
      return 'Unleash your foolishness...';
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center space-x-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={getPlaceholder()}
          className="w-full bg-gray-800 border border-gray-600 rounded-full py-3 px-5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300 disabled:opacity-50"
          disabled={isLoading || isListening || isLiveMode}
        />
        {speechRecognitionSupported && (
            <button
            type="button"
            onClick={handleMicClick}
            disabled={isLoading || isLiveMode}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors duration-200 disabled:opacity-50 ${
                isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            >
            <MicrophoneIcon className="w-5 h-5" />
            </button>
        )}
      </div>
      <button
        type="submit"
        disabled={isLoading || !inputValue.trim() || isLiveMode}
        className="bg-purple-600 text-white p-3 rounded-full hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
      >
        <SendIcon className="w-6 h-6" />
      </button>
    </form>
  );
};
