import { create } from 'zustand';
import type { ChatMessage } from '@/types';

interface ChatState {
  isLoading: boolean;
  isStreaming: boolean;
  isThinking: boolean; // New state for when waiting for LLM response
  error: string | null;
  streamingMessage: string;
  
  // Actions
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setThinking: (thinking: boolean) => void;
  setError: (error: string | null) => void;
  setStreamingMessage: (message: string) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  isLoading: false,
  isStreaming: false,
  isThinking: false,
  error: null,
  streamingMessage: '',

  setLoading: (loading: boolean) => set({ isLoading: loading }),
  
  setStreaming: (streaming: boolean) => set({ isStreaming: streaming }),
  
  setThinking: (thinking: boolean) => set({ isThinking: thinking }),
  
  setError: (error: string | null) => set({ error }),
  
  setStreamingMessage: (message: string) => {
    set({ streamingMessage: message });
  },

  addMessage: (_sessionId: string, _message: ChatMessage) => {
    // This will be handled by appStore for persistence
    // But we can use this for optimistic updates
  },

  updateMessage: (_sessionId: string, _messageId: string, _updates: Partial<ChatMessage>) => {
    // This will also be handled by appStore
  },
}));