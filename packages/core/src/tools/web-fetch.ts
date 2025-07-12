/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SchemaValidator } from '../utils/schemaValidator.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { Type } from '@google/genai';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { fetchWithTimeout, isPrivateIp } from '../utils/fetch.js';
import { convert } from 'html-to-text';

const URL_FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 100000;
const GEMINI_API_TIMEOUT_MS = 30000; // 30 second timeout for Gemini API calls

// Helper function to extract URLs from a string
function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

// Interfaces for grounding metadata (similar to web-search.ts)
interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}

interface GroundingChunkItem {
  web?: GroundingChunkWeb;
}

interface GroundingSupportSegment {
  startIndex: number;
  endIndex: number;
  text?: string;
}

interface GroundingSupportItem {
  segment?: GroundingSupportSegment;
  groundingChunkIndices?: number[];
}

/**
 * Parameters for the WebFetch tool
 */
export interface WebFetchToolParams {
  /**
   * The prompt containing URL(s) (up to 20) and instructions for processing their content.
   */
  prompt: string;
}

/**
 * Implementation of the WebFetch tool logic
 */
export class WebFetchTool extends BaseTool<WebFetchToolParams, ToolResult> {
  static readonly Name: string = 'web_fetch';

  constructor(private readonly config: Config) {
    super(
      WebFetchTool.Name,
      'WebFetch',
      "Processes content from URL(s), including local and private network addresses (e.g., localhost), embedded in a prompt. Include up to 20 URLs and instructions (e.g., summarize, extract specific data) directly in the 'prompt' parameter.",
      {
        properties: {
          prompt: {
            description:
              'A comprehensive prompt that includes the URL(s) (up to 20) to fetch and specific instructions on how to process their content (e.g., "Summarize https://example.com/article and extract key points from https://another.com/data"). Must contain as least one URL starting with http:// or https://.',
            type: Type.STRING,
          },
        },
        required: ['prompt'],
        type: Type.OBJECT,
      },
    );
  }

  /**
   * Helper method to execute a Gemini API call with timeout handling
   */
  private async executeWithTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    errorContext: string,
  ): Promise<T> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
    }, GEMINI_API_TIMEOUT_MS);

    // Combine the original signal with the timeout signal
    let combinedSignal: AbortSignal;
    let cleanup: (() => void) | undefined;

    if (signal.aborted) {
      combinedSignal = signal;
    } else if ('any' in AbortSignal && typeof AbortSignal.any === 'function') {
      // Use AbortSignal.any if available (Node.js 20.3.0+)
      combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
    } else {
      // Fallback for Node.js 20.0.0 - 20.2.x
      const combinedController = new AbortController();

      const abortHandler = () => {
        combinedController.abort();
      };

      signal.addEventListener('abort', abortHandler, { once: true });
      timeoutController.signal.addEventListener('abort', abortHandler, {
        once: true,
      });

      cleanup = () => {
        signal.removeEventListener('abort', abortHandler);
        timeoutController.signal.removeEventListener('abort', abortHandler);
      };

      combinedSignal = combinedController.signal;
    }

    try {
      const result = await operation(combinedSignal);
      clearTimeout(timeoutId);
      cleanup?.();
      return result;
    } catch (innerError: unknown) {
      clearTimeout(timeoutId);
      cleanup?.();
      // Check if it was a timeout error (not user cancellation)
      if (
        isNodeError(innerError) &&
        innerError.name === 'AbortError' &&
        timeoutController.signal.aborted
      ) {
        const timeoutMessage = `Request timed out after ${GEMINI_API_TIMEOUT_MS}ms ${errorContext}`;
        console.warn(timeoutMessage);
        const timeoutError = new Error(timeoutMessage);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw innerError;
    }
  }

  private async executeFallback(
    params: WebFetchToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const urls = extractUrls(params.prompt);
    if (urls.length === 0) {
      return {
        llmContent: 'Error: No URL found in the prompt for fallback.',
        returnDisplay: 'Error: No URL found in the prompt for fallback.',
      };
    }
    // For now, we only support one URL for fallback
    let url = urls[0];

    // Convert GitHub blob URL to raw URL
    if (url.includes('github.com') && url.includes('/blob/')) {
      url = url
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/');
    }

    try {
      const response = await fetchWithTimeout(url, URL_FETCH_TIMEOUT_MS);
      if (!response.ok) {
        throw new Error(
          `Request failed with status code ${response.status} ${response.statusText}`,
        );
      }
      const html = await response.text();
      const textContent = convert(html, {
        wordwrap: false,
        selectors: [
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' },
        ],
      }).substring(0, MAX_CONTENT_LENGTH);

      const geminiClient = this.config.getGeminiClient();
      const fallbackPrompt = `The user requested the following: "${params.prompt}".

I was unable to access the URL directly. Instead, I have fetched the raw content of the page. Please use the following content to answer the user's request. Do not attempt to access the URL again.

---
${textContent}
---`;

      try {
        const result = await this.executeWithTimeout(
          (combinedSignal) =>
            geminiClient.generateContent(
              [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
              {},
              combinedSignal,
            ),
          signal,
          `while processing URL: ${url}`,
        );

        const resultText = getResponseText(result) || '';
        return {
          llmContent: resultText,
          returnDisplay: `Content for ${url} processed using fallback fetch.`,
        };
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          return {
            llmContent: `Error: ${error.message}`,
            returnDisplay: `Error: ${error.message}`,
          };
        }
        throw error;
      }
    } catch (e) {
      const error = e as Error;
      const errorMessage = `Error during fallback fetch for ${url}: ${error.message}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  validateParams(params: WebFetchToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    if (!params.prompt || params.prompt.trim() === '') {
      return "The 'prompt' parameter cannot be empty and must contain URL(s) and instructions.";
    }
    if (
      !params.prompt.includes('http://') &&
      !params.prompt.includes('https://')
    ) {
      return "The 'prompt' must contain at least one valid URL (starting with http:// or https://).";
    }
    return null;
  }

  getDescription(params: WebFetchToolParams): string {
    const displayPrompt =
      params.prompt.length > 100
        ? params.prompt.substring(0, 97) + '...'
        : params.prompt;
    return `Processing URLs and instructions from prompt: "${displayPrompt}"`;
  }

  async shouldConfirmExecute(
    params: WebFetchToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateParams(params);
    if (validationError) {
      return false;
    }

    // Perform GitHub URL conversion here to differentiate between user-provided
    // URL and the actual URL to be fetched.
    const urls = extractUrls(params.prompt).map((url) => {
      if (url.includes('github.com') && url.includes('/blob/')) {
        return url
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      }
      return url;
    });

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: `Confirm Web Fetch`,
      prompt: params.prompt,
      urls,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: WebFetchToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    const userPrompt = params.prompt;
    const urls = extractUrls(userPrompt);
    const url = urls[0];
    const isPrivate = isPrivateIp(url);

    if (isPrivate) {
      return this.executeFallback(params, signal);
    }

    const geminiClient = this.config.getGeminiClient();

    try {
      const response = await this.executeWithTimeout(
        (combinedSignal) =>
          geminiClient.generateContent(
            [{ role: 'user', parts: [{ text: userPrompt }] }],
            { tools: [{ urlContext: {} }] },
            combinedSignal,
          ),
        signal,
        `for URL: ${url}`,
      );

      console.debug(
        `[WebFetchTool] Full response for prompt "${userPrompt.substring(
          0,
          50,
        )}...":`,
        JSON.stringify(response, null, 2),
      );

      let responseText = getResponseText(response) || '';
      const urlContextMeta = response.candidates?.[0]?.urlContextMetadata;
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources = groundingMetadata?.groundingChunks as
        | GroundingChunkItem[]
        | undefined;
      const groundingSupports = groundingMetadata?.groundingSupports as
        | GroundingSupportItem[]
        | undefined;

      // Error Handling
      let processingError = false;

      if (
        urlContextMeta?.urlMetadata &&
        urlContextMeta.urlMetadata.length > 0
      ) {
        const allStatuses = urlContextMeta.urlMetadata.map(
          (m) => m.urlRetrievalStatus,
        );
        if (allStatuses.every((s) => s !== 'URL_RETRIEVAL_STATUS_SUCCESS')) {
          processingError = true;
        }
      } else if (!responseText.trim() && !sources?.length) {
        // No URL metadata and no content/sources
        processingError = true;
      }

      if (
        !processingError &&
        !responseText.trim() &&
        (!sources || sources.length === 0)
      ) {
        // Successfully retrieved some URL (or no specific error from urlContextMeta), but no usable text or grounding data.
        processingError = true;
      }

      if (processingError) {
        return this.executeFallback(params, signal);
      }

      const sourceListFormatted: string[] = [];
      if (sources && sources.length > 0) {
        sources.forEach((source: GroundingChunkItem, index: number) => {
          const title = source.web?.title || 'Untitled';
          const uri = source.web?.uri || 'Unknown URI'; // Fallback if URI is missing
          sourceListFormatted.push(`[${index + 1}] ${title} (${uri})`);
        });

        if (groundingSupports && groundingSupports.length > 0) {
          const insertions: Array<{ index: number; marker: string }> = [];
          groundingSupports.forEach((support: GroundingSupportItem) => {
            if (support.segment && support.groundingChunkIndices) {
              const citationMarker = support.groundingChunkIndices
                .map((chunkIndex: number) => `[${chunkIndex + 1}]`)
                .join('');
              insertions.push({
                index: support.segment.endIndex,
                marker: citationMarker,
              });
            }
          });

          insertions.sort((a, b) => b.index - a.index);
          const responseChars = responseText.split('');
          insertions.forEach((insertion) => {
            responseChars.splice(insertion.index, 0, insertion.marker);
          });
          responseText = responseChars.join('');
        }

        if (sourceListFormatted.length > 0) {
          responseText += `

Sources:
${sourceListFormatted.join('\n')}`;
        }
      }

      const llmContent = responseText;

      console.debug(
        `[WebFetchTool] Formatted tool response for prompt "${userPrompt}:\n\n":`,
        llmContent,
      );

      return {
        llmContent,
        returnDisplay: `Content processed from prompt.`,
      };
    } catch (error: unknown) {
      // Check if it was a timeout error
      if (error instanceof Error && error.name === 'TimeoutError') {
        // Fall back to direct fetch on timeout
        return this.executeFallback(params, signal);
      }

      const errorMessage = `Error processing web content for prompt "${userPrompt.substring(
        0,
        50,
      )}...": ${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }
}
