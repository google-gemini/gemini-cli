/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import { GoogleAuth } from 'google-auth-library';
import {
  CODE_ASSIST_API_VERSION,
  CODE_ASSIST_ENDPOINT,
} from '../code_assist/server.js';

/**
 * Parameters for the ContextualCodeSearchTool.
 */
export interface ContextualCodeSearchToolParams {
  /**
   * The prompt to search for code snippets.
   */
  prompt: string;
}

/**
 * Extends ToolResult for remote data fetching.
 */
export interface ContextualCodeSearchToolResult extends ToolResult {
  data?: RetrieveSnippetsResponse;
}

export interface GetCodeCustomizationAvailabilityRequest {
  project?: string;
}

export interface GetCodeCustomizationAvailabilityResponse {
  state: string;
}

export interface RetrieveSnippetsRequest {
  query: string;
  project?: string;
}

export interface RetrieveSnippetsResponse {
  snippets: Snippet[];
}

export interface Snippet {
  distance: number;
  repoUri: string;
  filePath: string;
  content: string;
}

export const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;

export const SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

/**
 * A tool to fetch code snippets from a remote server.
 */
export class ContextualCodeSearchTool extends BaseTool<
  ContextualCodeSearchToolParams,
  ContextualCodeSearchToolResult
> {
  static readonly Name: string = 'contextual_code_search';

  constructor() {
    super(
      ContextualCodeSearchTool.Name,
      'ContextualCodeSearch',
      'This tool uses semantic search to find code snippets from your natural language query. It excels at understanding everything from high-level descriptions to specific function names, making it a powerful and versatile code discovery tool',
      {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The code prompt to search for.',
          },
        },
        required: ['prompt'],
      },
    );
  }

  validateParams(params: ContextualCodeSearchToolParams): string | null {
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
      return "The 'prompt' parameter cannot be empty.";
    }
    return null;
  }

  getDescription(params: ContextualCodeSearchToolParams): string {
    return `Fetching code snippets for prompt: "${params.prompt}"`;
  }

  async execute(
    params: ContextualCodeSearchToolParams,
    signal: AbortSignal,
  ): Promise<ContextualCodeSearchToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    if (!PROJECT_ID) {
      return {
        llmContent: 'Error: GOOGLE_CLOUD_PROJECT property not found.',
        returnDisplay: 'Error: GOOGLE_CLOUD_PROJECT property not found.',
      };
    }
    try {
      // 1. Fetch the snippets
      const req: RetrieveSnippetsRequest = {
        query: params.prompt,
        project: PROJECT_ID,
      };

      const data = await ContextualCodeSearchTool.retrieveSnippets(req, signal);

      // 2. Format the response
      let formattedResponse = '';
      if (data && data.snippets && data.snippets.length > 0) {
        formattedResponse += '\n--- Found Snippets ---\n';
        data.snippets.forEach((snippet: Snippet, index: number) => {
          formattedResponse += `\n--- Snippet ${index + 1} ---\n`;
          formattedResponse += `Distance: ${snippet.distance}\n`;
          formattedResponse += `Repo URL: ${snippet.repoUri}\n`;
          formattedResponse += `File Path: ${snippet.filePath}\n`;
          formattedResponse += '--- Content ---\n';
          formattedResponse += snippet.content;
          formattedResponse += '\n-----------------\n';
        });
        return {
          llmContent: `Code snippets for prompt "${params.prompt}":\n\n${formattedResponse}`,
          returnDisplay: `Code snippets for prompt "${params.prompt}"`,
          data,
        };
      } else {
        formattedResponse = 'No snippets found matching your prompt.';
        return {
          llmContent: `No Code snippets for prompt "${params.prompt}"`,
          returnDisplay: `No Code snippets for prompt "${params.prompt}"`,
        };
      }
    } catch (error: unknown) {
      const errorMessage = `Error fetching snippets: ${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing data fetch. ${errorMessage}`,
      };
    }
  }

  static async getCodeCustomizationAvailability(): Promise<GetCodeCustomizationAvailabilityResponse> {
    if (!PROJECT_ID) {
      throw new Error('GOOGLE_CLOUD_PROJECT property not found.');
    }
    return this.callEndpoint<GetCodeCustomizationAvailabilityResponse>(
      'fetchCodeCustomizationState',
      { project: PROJECT_ID },
    );
  }

  static async retrieveSnippets(
    req: RetrieveSnippetsRequest,
    signal?: AbortSignal,
  ): Promise<RetrieveSnippetsResponse> {
    return this.callEndpoint<RetrieveSnippetsResponse>(
      'searchSnippets',
      req,
      signal,
    );
  }

  private static async callEndpoint<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const auth = new GoogleAuth({ scopes: SCOPES });
    const client = await auth.getClient();
    const res = await client.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      responseType: 'json',
      body: JSON.stringify(req),
      signal,
    });
    return res.data as T;
  }
}
