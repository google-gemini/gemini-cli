/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolErrorType } from './tool-error.js';
import { getErrorMessage } from '../utils/errors.js';
import type { Config } from '../config/config.js';
import { ApprovalMode, DEFAULT_GEMINI_FLASH_MODEL } from '../config/config.js';
import { getResponseText } from '../utils/partUtils.js';
import { fetchWithTimeout, isPrivateIp } from '../utils/fetch.js';
import { convert } from 'html-to-text';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import {
  logWebFetchFallbackAttempt,
  WebFetchFallbackAttemptEvent,
} from '../telemetry/index.js';
import { WEB_FETCH_TOOL_NAME } from './tool-names.js';

const URL_FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 100000;

/**
 * Parses a prompt to extract valid URLs and identify malformed ones.
 */
export function parsePrompt(text: string): {
  validUrls: string[];
  errors: string[];
} {
  const tokens = text.split(/\s+/);
  const validUrls: string[] = [];
  const errors: string[] = [];

  for (const token of tokens) {
    if (!token) continue;

    // Heuristic to check if the url appears to contain URL-like chars.
    if (token.includes('://')) {
      try {
        // Validate with new URL()
        const url = new URL(token);

        // Allowlist protocols
        if (['http:', 'https:'].includes(url.protocol)) {
          validUrls.push(url.href);
        } else {
          errors.push(
            `Unsupported protocol in URL: "${token}". Only http and https are supported.`,
          );
        }
      } catch (_) {
        // new URL() threw, so it's malformed according to WHATWG standard
        errors.push(`Malformed URL detected: "${token}".`);
      }
    }
  }

  return { validUrls, errors };
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

class WebFetchToolInvocation extends BaseToolInvocation<
  WebFetchToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: WebFetchToolParams,
    messageBus?: MessageBus,
  ) {
    super(params, messageBus);
  }

  private async executeFallback(signal: AbortSignal): Promise<ToolResult> {
    const { validUrls: urls } = parsePrompt(this.params.prompt);
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

      const rawContent = await response.text();
      const contentType = response.headers.get('content-type') || '';
      let textContent: string;

      // Only use html-to-text if content type is HTML, or if no content type is provided (assume HTML)
      if (
        contentType.toLowerCase().includes('text/html') ||
        contentType === ''
      ) {
        textContent = convert(rawContent, {
          wordwrap: false,
          selectors: [
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' },
          ],
        });
      } else {
        // For other content types (text/plain, application/json, etc.), use raw text
        textContent = rawContent;
      }

      textContent = textContent.substring(0, MAX_CONTENT_LENGTH);

      const geminiClient = this.config.getGeminiClient();
      const fallbackPrompt = `The user requested the following: "${this.params.prompt}".

I was unable to access the URL directly. Instead, I have fetched the raw content of the page. Please use the following content to answer the request. Do not attempt to access the URL again.

---
${textContent}
---
`;
      const result = await geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
        {},
        signal,
        DEFAULT_GEMINI_FLASH_MODEL,
      );
      const resultText = getResponseText(result) || '';
      return {
        llmContent: resultText,
        returnDisplay: `Content for ${url} processed using fallback fetch.`,
      };
    } catch (e) {
      const error = e as Error;
      const errorMessage = `Error during fallback fetch for ${url}: ${error.message}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.WEB_FETCH_FALLBACK_FAILED,
        },
      };
    }
  }

  getDescription(): string {
    const displayPrompt =
      this.params.prompt.length > 100
        ? this.params.prompt.substring(0, 97) + '...'
        : this.params.prompt;
    return `Processing URLs and instructions from prompt: "${displayPrompt}"`;
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // Try message bus confirmation first if available
    if (this.messageBus) {
      const decision = await this.getMessageBusDecision(abortSignal);
      if (decision === 'ALLOW') {
        return false; // No confirmation needed
      }
      if (decision === 'DENY') {
        throw new Error('Tool execution denied by policy.');
      }
      // if 'ASK_USER', fall through to legacy logic
    }

    // Legacy confirmation flow (no message bus OR policy decision was ASK_USER)
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    // Perform GitHub URL conversion here to differentiate between user-provided
    // URL and the actual URL to be fetched.
    const { validUrls } = parsePrompt(this.params.prompt);
    const urls = validUrls.map((url) => {
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
      prompt: this.params.prompt,
      urls,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const userPrompt = this.params.prompt;
    const { validUrls: urls } = parsePrompt(userPrompt);
    const url = urls[0];
    const isPrivate = isPrivateIp(url);

    if (isPrivate) {
      logWebFetchFallbackAttempt(
        this.config,
        new WebFetchFallbackAttemptEvent('private_ip'),
      );
      return this.executeFallback(signal);
    }

    const geminiClient = this.config.getGeminiClient();

    try {
      const response = await geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: userPrompt }] }],
        { tools: [{ urlContext: {} }] },
        signal, // Pass signal
        DEFAULT_GEMINI_FLASH_MODEL,
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
        logWebFetchFallbackAttempt(
          this.config,
          new WebFetchFallbackAttemptEvent('primary_failed'),
        );
        return this.executeFallback(signal);
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
      const errorMessage = `Error processing web content for prompt "${userPrompt.substring(
        0,
        50,
      )}...": ${getErrorMessage(error)}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.WEB_FETCH_PROCESSING_ERROR,
        },
      };
    }
  }
}

/**
 * Implementation of the WebFetch tool logic
 */
export class WebFetchTool extends BaseDeclarativeTool<
  WebFetchToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      WEB_FETCH_TOOL_NAME,
      'WebFetch',
      "Processes content from URL(s), including local and private network addresses (e.g., localhost), embedded in a prompt. Include up to 20 URLs and instructions (e.g., summarize, extract specific data) directly in the 'prompt' parameter.",
      Kind.Fetch,
      {
        properties: {
          prompt: {
            description:
              'A comprehensive prompt that includes the URL(s) (up to 20) to fetch and specific instructions on how to process their content (e.g., "Summarize https://example.com/article and extract key points from https://another.com/data"). All URLs to be fetched must be valid and complete, starting with "http://" or "https://", and be fully-formed with a valid hostname (e.g., a domain name like "example.com" or an IP address). For example, "https://example.com" is valid, but "example.com" is not.',
            type: 'string',
          },
        },
        required: ['prompt'],
        type: 'object',
      },
      true, // isOutputMarkdown
      false, // canUpdateOutput
      messageBus,
    );
    const proxy = config.getProxy();
    if (proxy) {
      setGlobalDispatcher(new ProxyAgent(proxy as string));
    }
  }

  protected override validateToolParamValues(
    params: WebFetchToolParams,
  ): string | null {
    if (!params.prompt || params.prompt.trim() === '') {
      return "The 'prompt' parameter cannot be empty and must contain URL(s) and instructions.";
    }

    const { validUrls, errors } = parsePrompt(params.prompt);

    if (errors.length > 0) {
      return `Error(s) in prompt URLs:\n- ${errors.join('\n- ')}`;
    }

    if (validUrls.length === 0) {
      return "The 'prompt' must contain at least one valid URL (starting with http:// or https://).";
    }

    return null;
  }

  protected createInvocation(
    params: WebFetchToolParams,
    messageBus?: MessageBus,
  ): ToolInvocation<WebFetchToolParams, ToolResult> {
    return new WebFetchToolInvocation(this.config, params, messageBus);
  }
}
