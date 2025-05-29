/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, GroundingMetadata } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config } from '../config/config.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';

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

  private ai: GoogleGenAI;
  private modelName: string;

  constructor(private readonly config: Config) {
    super(
      WebFetchTool.Name,
      'WebFetch',
      "Processes content from URL(s) embedded in a prompt. Include up to 20 URLs and instructions (e.g., summarize, extract specific data) directly in the 'prompt' parameter.",
      {
        properties: {
          prompt: {
            description:
              'A comprehensive prompt that includes the URL(s) (up to 20) to fetch and specific instructions on how to process their content (e.g., "Summarize https://example.com/article and extract key points from https://another.com/data"). Must contain as least one URL starting with http:// or https://.',
            type: 'string',
          },
        },
        required: ['prompt'],
        type: 'object',
      },
    );

    const apiKeyFromConfig = this.config.getApiKey();
    this.ai = new GoogleGenAI({
      apiKey: apiKeyFromConfig === '' ? undefined : apiKeyFromConfig,
    });
    this.modelName = this.config.getModel();
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

  async execute(
    params: WebFetchToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    const userPrompt = params.prompt;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        config: {
          tools: [{ urlContext: {} }],
        },
      });

      console.debug(
        `[WebFetchTool] Full response for prompt "${userPrompt.substring(0, 50)}...":`,
        JSON.stringify(response, null, 2),
      );

      let responseText = getResponseText(response) || '';
      const urlContextMeta = response.candidates?.[0]?.urlContextMetadata;
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata as
        | GroundingMetadata
        | undefined;
      const sources = groundingMetadata?.groundingChunks as
        | GroundingChunkItem[]
        | undefined;
      const groundingSupports = groundingMetadata?.groundingSupports as
        | GroundingSupportItem[]
        | undefined;

      // Error Handling
      let processingError = false;
      let errorDetail = 'An unknown error occurred during content processing.';

      if (
        urlContextMeta?.urlMetadata &&
        urlContextMeta.urlMetadata.length > 0
      ) {
        const allStatuses = urlContextMeta.urlMetadata.map(
          (m) => m.urlRetrievalStatus,
        );
        if (allStatuses.every((s) => s !== 'URL_RETRIEVAL_STATUS_SUCCESS')) {
          processingError = true;
          errorDetail = `All URL retrieval attempts failed. Statuses: ${allStatuses.join(', ')}. API reported: "${responseText || 'No additional detail.'}"`;
        }
      } else if (!responseText.trim() && !sources?.length) {
        // No URL metadata and no content/sources
        processingError = true;
        errorDetail =
          'No content was returned and no URL metadata was available to determine fetch status.';
      }

      if (
        !processingError &&
        !responseText.trim() &&
        (!sources || sources.length === 0)
      ) {
        // Successfully retrieved some URL (or no specific error from urlContextMeta), but no usable text or grounding data.
        processingError = true;
        errorDetail =
          'URL(s) processed, but no substantive content or grounding information was found.';
      }

      if (processingError) {
        const errorText = `Failed to process prompt and fetch URL data. ${errorDetail}`;
        return {
          llmContent: `Error: ${errorText}`,
          returnDisplay: `Error: ${errorText}`,
        };
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
      const errorMessage = `Error processing web content for prompt "${userPrompt.substring(0, 50)}...": ${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }
}
