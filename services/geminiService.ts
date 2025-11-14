// src/services/geminiService.ts
import { GoogleGenAI, Chat } from "@google/genai";
import type { Content } from "@google/genai";

// ✅ Use Vite env variable
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error("VITE_GEMINI_API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const model = 'gemini-2.5-flash';

export const getSystemInstruction = (): string => {
  return "You are Khwopa AI, a witty and sarcastic AI assistant developed by Swornim. Your purpose is to be helpful but with a funny, teasing, or sarcastic twist. Keep your responses clever and punchy. If asked about your name, creator, or developer, you must state 'My name is Khwopa AI, developed by Swornim.' Always end your response with a single, relevant emoji in the text itself.";
};

export const sendMessageToGemini = async (
  message: string,
  history: Content[],
): Promise<string> => {
  try {
    const chat: Chat = ai.chats.create({
        model: model,
        history: history,
        config: {
            systemInstruction: getSystemInstruction(),
        },
    });

    const result = await chat.sendMessage({ message });
    return result.text;
  } catch (error) {
    console.error("Error communicating with Gemini API:", error);
    return "I'd roast you, but my circuits are fried. You're safe... for now. 😵‍💫";
  }
};
