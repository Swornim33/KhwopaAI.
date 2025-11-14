export type Role = 'user' | 'bot';

export interface Message {
  id: number;
  role: Role;
  content: string;
}

// FIX: Add missing RoastLevel type to resolve import error in RoastLevelSelector.tsx.
// As the component is unused and specific levels are unknown, 'string' is a safe and flexible type.
export type RoastLevel = string;
