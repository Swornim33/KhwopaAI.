import React from 'react';
import type { Message } from '../types';
import { KhwopaAILogo } from './icons/KhwopaAILogo';
import { UserIcon } from './icons/UserIcon';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';

interface ChatMessageProps {
  message: Message;
  isSpeaking: boolean;
  onToggleSpeech: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isSpeaking, onToggleSpeech }) => {
  const isBot = message.role === 'bot';

  return (
    <div
      className={`flex items-start gap-3 animate-fade-in-up ${isBot ? 'justify-start' : 'justify-end'}`}
    >
      {isBot && <KhwopaAILogo className="w-8 h-8 flex-shrink-0 mt-1" />}
      
      <div className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}>
        <div
          className={`relative rounded-lg p-3 max-w-md md:max-w-lg shadow-md ${
            isBot ? 'bg-gray-700 rounded-tl-none' : 'bg-blue-600 rounded-tr-none'
          }`}
        >
          <p className="text-white whitespace-pre-wrap">{message.content}</p>
        </div>
        {isBot && message.content && (
            <button
                onClick={onToggleSpeech}
                className="mt-2 text-gray-400 hover:text-white transition-colors duration-200 flex items-center space-x-1"
            >
                {isSpeaking ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                <span className="text-xs">{isSpeaking ? 'Pause' : 'Play'}</span>
            </button>
        )}
      </div>

      {!isBot && <UserIcon className="w-8 h-8 flex-shrink-0 text-blue-400 mt-1" />}
    </div>
  );
};