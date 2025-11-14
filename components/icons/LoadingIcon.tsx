import React from 'react';

// FIX: Changed component props from SVGProps to HTMLAttributes to match the div element being rendered.
// This resolves the type errors. The incoming className is merged with the component's base classes,
// and remaining props are spread on the container div.
export const LoadingIcon: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={`flex space-x-1 ${className || ''}`} {...rest}>
    <div className="w-2 h-2 bg-purple-300 rounded-full animate-pulse [animation-delay:0s]"></div>
    <div className="w-2 h-2 bg-purple-300 rounded-full animate-pulse [animation-delay:0.1s]"></div>
    <div className="w-2 h-2 bg-purple-300 rounded-full animate-pulse [animation-delay:0.2s]"></div>
  </div>
);
