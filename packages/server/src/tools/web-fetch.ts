/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SchemaValidator } from '../utils/schemaValidator.js';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Parameters for the WebFetch tool
 */
export interface WebFetchToolParams {
  /**
   * The URL to fetch content from.
   */
  url: string;
}

/**
 * Implementation of the WebFetch tool logic
 */
export class WebFetchTool extends BaseTool<WebFetchToolParams, ToolResult> {
  static readonly Name: string = 'web_fetch';

  constructor() {
    super(
      WebFetchTool.Name,
      'WebFetch',
      'Fetches text content from a given URL. Handles potential network errors and non-success HTTP status codes.',
      {
        properties: {
          url: {
            description:
              "The URL to fetch. Must be an absolute URL (e.g., 'https://example.com/file.txt').",
            type: 'string',
          },
        },
        required: ['url'],
        type: 'object',
      },
    );
  }

  validateParams(params: WebFetchToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }
    try {
      const parsedUrl = new URL(params.url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return `Invalid URL protocol: "${parsedUrl.protocol}". Only 'http:' and 'https:' are supported.`;
      }
    } catch {
      return `Invalid URL format: "${params.url}". Please provide a valid absolute URL (e.g., 'https://example.com').`;
    }
    return null;
  }

  getDescription(params: WebFetchToolParams): string {
    const displayUrl =
      params.url.length > 80 ? params.url.substring(0, 77) + '...' : params.url;
    return `Fetching content from ${displayUrl}`;
  }

  async execute(params: WebFetchToolParams): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const url = params.url;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GeminiCode-ServerLogic/1.0',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorText = `Failed to fetch data from ${url}. Status: ${response.status} ${response.statusText}`;
        return {
          llmContent: `Error: ${errorText}`,
          returnDisplay: `Error: ${errorText}`,
        };
      }

      // Basic check for text-based content types
      const contentType = response.headers.get('content-type') || '';
      if (
        !contentType.includes('text/') &&
        !contentType.includes('json') &&
        !contentType.includes('xml')
      ) {
        const errorText = `Unsupported content type: ${contentType} from ${url}`;
        return {
          llmContent: `Error: ${errorText}`,
          returnDisplay: `Error: ${errorText}`,
        };
      }

      const data = await response.text();
      const MAX_LLM_CONTENT_LENGTH = 200000; // Truncate large responses
      const truncatedData =
        data.length > MAX_LLM_CONTENT_LENGTH
          ? data.substring(0, MAX_LLM_CONTENT_LENGTH) +
            '\n... [Content truncated]'
          : data;

      const llmContent = data
        ? `Fetched data from ${url}:\n\n${truncatedData}`
        : `No text data fetched from ${url}. Status: ${response.status}`; // Adjusted message for clarity

      return {
        llmContent,
        returnDisplay: `Fetched content from ${url}`,
      };
    } catch (error: unknown) {
      const errorMessage = `Failed to fetch data from ${url}. Error: ${getErrorMessage(error)}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }
}
