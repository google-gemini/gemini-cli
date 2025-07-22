/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useCallback, useRef } from 'react';
import { DEFAULT_GEMINI_FLASH_MODEL, GeminiClient  } from '@google/gemini-cli-core';
import { Content, GenerateContentConfig } from '@google/genai';

// Import getResponseText from core package utils
interface ResponsePart {
  text?: string;
}

interface ResponseCandidate {
  content?: {
    parts?: ResponsePart[];
  };
}

interface ApiResponse {
  candidates?: ResponseCandidate[];
}

const getResponseText = (response: ApiResponse): string | undefined => {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    return undefined;
  }
  const textSegments = parts
    .map((part: ResponsePart) => part.text)
    .filter((text): text is string => typeof text === 'string');

  if (textSegments.length === 0) {
    return undefined;
  }
  return textSegments.join('');
};


/**
 * A custom hook that provides AI-powered prompt completion suggestions
 * using a debounced effect to avoid excessive API calls.
 *
 * @param geminiClient The Gemini client instance for making API calls
 * @param inputText The current input text to generate suggestions for
 * @param delay The delay in milliseconds before triggering the API call
 * @param onSuggestionsUpdate Callback function to handle the generated suggestions
 * @param enabled Whether the suggestion generation is enabled
 */
export const usePromptCompletion = (
  geminiClient: GeminiClient | null,
  inputText: string,
  delay: number,
  onSuggestionsUpdate: (suggestions: string[]) => void,
  enabled: boolean = true,
) => {
  const abortControllerRef = useRef<AbortController | null>(null);

  const generateSuggestions = useCallback(async (text: string) => {
    // This is the only place that should clear suggestions.
    if (text.trim().length === 0) {
      onSuggestionsUpdate([]);
      return;
    }

    // If not enabled, or client not ready, do nothing. Don't clear.
    if (!geminiClient || !enabled) {
      return;
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const contents: Content[] = [
        {
          role: 'user',
          parts: [
            {
              text: `Act as an intelligent prompt co-pilot. Your goal is to take the user’s initial thought and seamlessly continue it, building it out into 1-2 fully-formed, insightful prompts that unlock greater potential.\nUser’s initial thought: \n'''\n${text}\n'''\n\nYour task is to continue their sentence. Start your response with the user’s exact text (${text}) and then add the necessary detail, context, and creative direction to transform it from a fragment into a complete, high-impact prompt.\n\nFormatting:\nPlain text only.\nOne complete prompt suggestion per line.\nMatch the user’s language.`,
            },
          ],
        },
      ];

      const generationConfig: GenerateContentConfig = {
        temperature: 1,
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

      if (response && !signal.aborted) {
        const responseText = getResponseText(response);
        if (responseText) {
          const suggestions = responseText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .slice(0, 3);

          if (suggestions.length > 0) {
            onSuggestionsUpdate(suggestions);
          }
          // If suggestions are empty, do nothing to prevent clearing existing ones.
        }
      }
    } catch (error) {
      // Do not clear suggestions on error, just log it.
      if (!(error instanceof Error && error.message === 'The user aborted a request.')) {
        console.error('Error generating suggestions:', error);
      }
    }
  }, [geminiClient, enabled, onSuggestionsUpdate]);


  // Debounced effect to generate suggestions
  useEffect(() => {
    // Abort any pending request.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const handler = setTimeout(() => {
      generateSuggestions(inputText).catch((error) => {
        if (!(error instanceof Error && error.message === 'The user aborted a request.')) {
          console.error('Failed to generate suggestions:', error);
        }
      });
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [inputText, delay, generateSuggestions]);

  // Cleanup function to abort any ongoing request on unmount
  useEffect(() => () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);
};
