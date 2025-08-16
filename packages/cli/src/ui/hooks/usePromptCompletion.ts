/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Config,
  DEFAULT_GEMINI_FLASH_MODEL,
  getResponseText,
} from '@google/gemini-cli-core';
import { Content, GenerateContentConfig } from '@google/genai';
import { TextBuffer } from '../components/shared/text-buffer.js';

export const PROMPT_COMPLETION_MIN_LENGTH = 5;
export const PROMPT_COMPLETION_DEBOUNCE_MS = 500;

export interface PromptCompletion {
  text: string;
  isLoading: boolean;
  isActive: boolean;
  accept: () => void;
  clear: () => void;
  markSelected: (selectedText: string) => void;
}

export interface UsePromptCompletionOptions {
  buffer: TextBuffer;
  config?: Config;
  enabled: boolean;
}

const useDebounce = (callback: () => void, delay: number, deps: React.DependencyList) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(callback, delay);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, deps);
};

export function usePromptCompletion({
  buffer,
  config,
  enabled,
}: UsePromptCompletionOptions): PromptCompletion {
  const [ghostText, setGhostText] = useState<string>('');
  const [isLoadingGhostText, setIsLoadingGhostText] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [justSelectedSuggestion, setJustSelectedSuggestion] = useState<boolean>(false);
  const lastSelectedTextRef = useRef<string>('');
  const lastRequestedTextRef = useRef<string>('');

  const isPromptCompletionEnabled = enabled && (config?.getEnablePromptCompletion() ?? false);

  const clearGhostText = useCallback(() => {
    setGhostText('');
    setIsLoadingGhostText(false);
  }, []);

  const acceptGhostText = useCallback(() => {
    if (ghostText && ghostText.length > buffer.text.length) {
      buffer.setText(ghostText);
      setGhostText('');
      setJustSelectedSuggestion(true);
      lastSelectedTextRef.current = ghostText;
    }
  }, [ghostText, buffer]);

  const markSuggestionSelected = useCallback((selectedText: string) => {
    setJustSelectedSuggestion(true);
    lastSelectedTextRef.current = selectedText;
  }, []);

  const generatePromptSuggestions = useCallback(async () => {
    const trimmedText = buffer.text.trim();
    const geminiClient = config?.getGeminiClient();
    
    if (trimmedText === lastRequestedTextRef.current) {
      return;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (
      trimmedText.length < PROMPT_COMPLETION_MIN_LENGTH ||
      !geminiClient ||
      trimmedText.startsWith('/') ||
      trimmedText.includes('@') ||
      !isPromptCompletionEnabled
    ) {
      clearGhostText();
      lastRequestedTextRef.current = '';
      return;
    }

    lastRequestedTextRef.current = trimmedText;
    setIsLoadingGhostText(true);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const contents: Content[] = [
        {
          role: 'user',
          parts: [
            {
              text: `You are a professional prompt engineering assistant. Complete the user's partial prompt with expert precision and clarity.\n\nUser's input: "${trimmedText}"\n\nContinue this prompt by adding specific, actionable details that align with the user's intent. Focus on:\n- Clear, precise language\n- Structured requirements\n- Professional terminology\n- Measurable outcomes\n\nStart your response with the exact user text ("${trimmedText}") followed by your completion. Provide practical, implementation-focused suggestions rather than creative interpretations.\n\nFormat: Plain text only. Single completion. Match the user's language.`,
            },
          ],
        },
      ];
      
      const generationConfig: GenerateContentConfig = {
        temperature: 0.3,
        maxOutputTokens: 16000,
        thinkingConfig: {
          thinkingBudget: 0,
        }
      };

      const response = await geminiClient.generateContent(
        contents,
        generationConfig,
        signal,
        DEFAULT_GEMINI_FLASH_MODEL,
      );

      if (signal.aborted) {
        return;
      }

      if (response) {
        const responseText = getResponseText(response);
        
        if (responseText) {
          const suggestionText = responseText.trim();

          if (suggestionText.length > 0 && suggestionText.startsWith(trimmedText)) {
            setGhostText(suggestionText);
          } else {
            clearGhostText();
          }
        }
      }
    } catch (error) {
      if (!(signal.aborted || (error instanceof Error && error.name === 'AbortError'))) {
        console.error('prompt completion error:', error);
        // Clear the last requested text to allow retry only on real errors
        lastRequestedTextRef.current = '';
      } else {
      }
      clearGhostText();
    } finally {
      if (!signal.aborted) {
        setIsLoadingGhostText(false);
      }
    }
  }, [buffer.text, config, clearGhostText, isPromptCompletionEnabled]);

  const isCursorAtEnd = useCallback(() => {
    const [cursorRow, cursorCol] = buffer.cursor;
    const totalLines = buffer.lines.length;
    if (cursorRow !== totalLines - 1) {
      return false;
    }
    
    const lastLine = buffer.lines[cursorRow] || '';
    return cursorCol === lastLine.length;
  }, [buffer.cursor, buffer.lines]);

  const handlePromptCompletion = useCallback(() => {
    if (!isCursorAtEnd()) {
      clearGhostText();
      return;
    }
    
    const trimmedText = buffer.text.trim();
    
    if (justSelectedSuggestion && trimmedText === lastSelectedTextRef.current) {
      return;
    }
    
    if (trimmedText !== lastSelectedTextRef.current) {
      setJustSelectedSuggestion(false);
      lastSelectedTextRef.current = '';
    }
    
    generatePromptSuggestions();
  }, [generatePromptSuggestions, justSelectedSuggestion, isCursorAtEnd, clearGhostText]);
  
  useDebounce(handlePromptCompletion, PROMPT_COMPLETION_DEBOUNCE_MS, [buffer.text, buffer.cursor]);

  // Ghost text validation - clear if it doesn't match current text or cursor not at end
  useEffect(() => {
    const currentText = buffer.text.trim();
    
    if (ghostText && !isCursorAtEnd()) {
      clearGhostText();
      return;
    }
    
    if (ghostText && currentText.length > 0 && !ghostText.startsWith(currentText)) {
      clearGhostText();
    }
  }, [buffer.text, buffer.cursor, ghostText, clearGhostText, isCursorAtEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const isActive = useMemo(() => {
    if (!isPromptCompletionEnabled) return false;
    
    if (!isCursorAtEnd()) return false;
    
    const trimmedText = buffer.text.trim();
    return (
      trimmedText.length >= PROMPT_COMPLETION_MIN_LENGTH && 
      !trimmedText.startsWith('/') && 
      !trimmedText.includes('@')
    );
  }, [buffer.text, isPromptCompletionEnabled, isCursorAtEnd]);

  return {
    text: ghostText,
    isLoading: isLoadingGhostText,
    isActive,
    accept: acceptGhostText,
    clear: clearGhostText,
    markSelected: markSuggestionSelected,
  };
}
