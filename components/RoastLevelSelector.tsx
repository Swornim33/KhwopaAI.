
import React from 'react';
import type { RoastLevel } from '../types';

interface RoastLevelSelectorProps {
  levels: readonly RoastLevel[];
  selectedLevel: RoastLevel;
  onSelectLevel: (level: RoastLevel) => void;
}

export const RoastLevelSelector: React.FC<RoastLevelSelectorProps> = ({
  levels,
  selectedLevel,
  onSelectLevel,
}) => {
  return (
    <div className="bg-gray-800 rounded-full p-1 flex items-center space-x-1">
      {levels.map((level) => (
        <button
          key={level}
          onClick={() => onSelectLevel(level)}
          className={`px-3 py-1 text-sm font-medium rounded-full transition-colors duration-300 ${
            selectedLevel === level
              ? 'bg-purple-600 text-white'
              : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  );
};
