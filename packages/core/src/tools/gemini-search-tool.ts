/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { getErrorMessage } from '../utils/errors.js';
import type { Config } from '../config/config.js';
import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';

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
  confidenceScores?: number[];
}

/**
 * Parameters for the GeminiSearchTool.
 */
export interface GeminiSearchToolParams {
  /**
   * The search query.
   */
  query: string;
  /**
   * Optional: Maximum number of search results to include
   */
  maxResults?: number;
}

/**
 * Extends ToolResult to include sources for web search.
 */
export interface GeminiSearchToolResult extends ToolResult {
  sources?: GroundingChunkItem[];
  groundingSupports?: GroundingSupportItem[];
  searchQuery?: string;
}

class GeminiSearchToolInvocation extends BaseToolInvocation<
  GeminiSearchToolParams,
  GeminiSearchToolResult
> {
  constructor(
    private readonly config: Config,
    params: GeminiSearchToolParams,
  ) {
    super(params);
  }

  override getDescription(): string {
    return `🔍 Searching the web using Gemini with Google Search for: "${this.params.query}"`;
  }

  async execute(signal: AbortSignal): Promise<GeminiSearchToolResult> {
    try {
      // Check if current provider is Gemini
      const { ModelProviderFactory } = await import('../providers/ModelProviderFactory.js');
      const { ModelProviderType } = await import('../providers/types.js');

      const currentProviderType = ModelProviderFactory.getCurrentProviderType();
      if (currentProviderType !== ModelProviderType.GEMINI) {
        return {
          llmContent: `❌ **Provider Error:** Gemini search tool is only available when using Gemini provider. Current provider: ${currentProviderType || 'unknown'}. Please switch to Gemini provider first.`,
          returnDisplay: 'Switch to Gemini provider required.',
          error: {
            message: `Gemini search requires Gemini provider, but current provider is: ${currentProviderType || 'unknown'}`,
            type: ToolErrorType.TOOL_NOT_AVAILABLE,
          },
        };
      }

      // Get existing Gemini authentication credentials
      const { AuthManager } = await import('../auth/AuthManager.js');
      const authManager = AuthManager.getInstance();
      authManager.setConfig(this.config);

      const credentials = await authManager.getAccessCredentials('gemini');

      if (!credentials?.accessToken && !credentials?.apiKey) {
        return {
          llmContent: `❌ **Authentication Error:** No Gemini credentials available. Please authenticate with Gemini first.`,
          returnDisplay: 'Gemini authentication required.',
          error: {
            message: 'No Gemini credentials available',
            type: ToolErrorType.TOOL_NOT_AVAILABLE,
          },
        };
      }

      // Perform search using the authenticated credentials
      const searchResult = await this.performGeminiSearch(credentials, signal);
      return searchResult;

    } catch (error: unknown) {
      const errorMessage = `Error during Gemini web search for query "${
        this.params.query
      }": ${getErrorMessage(error)}`;
      console.error('[GeminiSearchTool]', errorMessage, error);

      return {
        llmContent: `❌ **Search Error:** ${errorMessage}`,
        returnDisplay: `Error performing web search.`,
        error: {
          message: errorMessage,
          type: ToolErrorType.WEB_SEARCH_FAILED,
        },
      };
    }
  }

  /**
   * Perform the actual Gemini search reusing existing authentication
   */
  private async performGeminiSearch(
    credentials: { accessToken?: string; apiKey?: string },
    signal: AbortSignal
  ): Promise<GeminiSearchToolResult> {

    let response: GenerateContentResponse;

    try {
      if (credentials.accessToken) {
        // OAuth: Use CodeAssistServer approach (same as GeminiProvider)
        response = await this.performOAuthSearch(credentials.accessToken, signal);
      } else if (credentials.apiKey) {
        // API Key: Use GoogleGenAI SDK (simpler approach)
        response = await this.performApiKeySearch(credentials.apiKey, signal);
      } else {
        throw new Error('No valid authentication credentials');
      }
    } catch (error) {
      console.error('[GeminiSearchTool] Search failed:', error);
      throw error;
    }

    // Extract and process the response
    return this.processSearchResponse(response);
  }

  /**
   * Perform search using OAuth (CodeAssistServer approach)
   */
  private async performOAuthSearch(accessToken: string, signal: AbortSignal): Promise<GenerateContentResponse> {
    // For OAuth, we need to use the CodeAssistServer approach similar to GeminiProvider
    // First, get the OAuth client
    const { getOauthClient } = await import('../code_assist/oauth2.js');
    const { AuthType } = await import('../core/contentGenerator.js');
    const oauthClient = await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, this.config);

    // Setup user data
    const { setupUser } = await import('../code_assist/setup.js');
    const userData = await setupUser(oauthClient);

    // Create CodeAssistServer
    const { CodeAssistServer } = await import('../code_assist/server.js');
    const codeAssistServer = new CodeAssistServer(
      oauthClient,
      userData.projectId,
      { headers: { 'User-Agent': 'GeminiSearchTool/1.0.0' } },
      `search_${Date.now()}`,
      userData.userTier
    );

    // Make the search request using user's selected model
    const selectedModel = this.config.getModel();
    const request = {
      model: selectedModel,
      contents: [
        {
          role: 'user',
          parts: [{ text: this.params.query }]
        }
      ],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
        maxOutputTokens: 4096,
        abortSignal: signal
      }
    };

    return await codeAssistServer.generateContent(request, `search_${Date.now()}`);
  }

  /**
   * Perform search using API Key (GoogleGenAI SDK approach)
   */
  private async performApiKeySearch(apiKey: string, signal: AbortSignal): Promise<GenerateContentResponse> {
    // Use GoogleGenAI SDK for API key authentication with user's selected model (same as GeminiProvider)
    const selectedModel = this.config.getModel();
    const googleAI = new GoogleGenAI({ apiKey });

    // Use the same approach as GeminiProvider: googleAI.models.generateContent
    const request = {
      model: selectedModel,
      contents: [
        {
          role: 'user',
          parts: [{ text: this.params.query }]
        }
      ],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
        maxOutputTokens: 4096,
        abortSignal: signal
      }
    };

    return await googleAI.models.generateContent(request);
  }

  /**
   * Process the search response and extract results
   */
  private processSearchResponse(response: GenerateContentResponse): GeminiSearchToolResult {
    // Extract response text
    let responseText = '';
    const candidate = response.candidates?.[0];

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          responseText += part.text;
        }
      }
    }

    // Extract grounding metadata
    const groundingMetadata = candidate?.groundingMetadata;
    const sources = groundingMetadata?.groundingChunks as GroundingChunkItem[] | undefined;
    const groundingSupports = groundingMetadata?.groundingSupports as GroundingSupportItem[] | undefined;

    if (!responseText || !responseText.trim()) {
      return {
        llmContent: `❓ **No Results:** No search results found for query: "${this.params.query}"`,
        returnDisplay: 'No information found.',
        searchQuery: this.params.query,
      };
    }

    let modifiedResponseText = responseText;
    const sourceListFormatted: string[] = [];

    // Process sources and add citations
    if (sources && sources.length > 0) {
      // Limit sources if maxResults is specified
      const limitedSources = this.params.maxResults
        ? sources.slice(0, this.params.maxResults)
        : sources;

      limitedSources.forEach((source: GroundingChunkItem, index: number) => {
        const title = source.web?.title || 'Untitled';
        const uri = source.web?.uri || 'No URI';
        sourceListFormatted.push(`[${index + 1}] ${title}\n    ${uri}`);
      });

      // Add inline citations based on grounding supports
      if (groundingSupports && groundingSupports.length > 0) {
        modifiedResponseText = this.addInlineCitations(responseText, groundingSupports);
      }

      // Add sources list at the end with better formatting
      if (sourceListFormatted.length > 0) {
        modifiedResponseText += '\n\n---\n\n**📚 Sources:**\n' + sourceListFormatted.join('\n\n');
      }
    }

    return {
      llmContent: `🔍 **Web Search Results for "${this.params.query}"**\n\n${modifiedResponseText}`,
      returnDisplay: `✅ Search completed for "${this.params.query}" with ${sources?.length || 0} sources found.`,
      sources,
      groundingSupports,
      searchQuery: this.params.query,
    };
  }

  /**
   * Add inline citations to text based on grounding supports
   */
  private addInlineCitations(text: string, groundingSupports: GroundingSupportItem[]): string {
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

    // Sort insertions by index in descending order to avoid shifting subsequent indices
    insertions.sort((a, b) => b.index - a.index);

    // Use TextEncoder/TextDecoder since segment indices are UTF-8 byte positions
    const encoder = new TextEncoder();
    const responseBytes = encoder.encode(text);
    const parts: Uint8Array[] = [];
    let lastIndex = responseBytes.length;

    for (const ins of insertions) {
      const pos = Math.min(ins.index, lastIndex);
      parts.unshift(responseBytes.subarray(pos, lastIndex));
      parts.unshift(encoder.encode(ins.marker));
      lastIndex = pos;
    }
    parts.unshift(responseBytes.subarray(0, lastIndex));

    // Concatenate all parts into a single buffer
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const finalBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      finalBytes.set(part, offset);
      offset += part.length;
    }

    return new TextDecoder().decode(finalBytes);
  }
}

/**
 * A tool to perform web searches using Gemini API with Google Search integration.
 * This tool reuses existing Gemini authentication (OAuth or API Key) to perform searches.
 */
export class GeminiSearchTool extends BaseDeclarativeTool<
  GeminiSearchToolParams,
  GeminiSearchToolResult
> {
  static readonly Name: string = 'gemini_web_search';

  constructor(private readonly config: Config) {
    super(
      GeminiSearchTool.Name,
      'Gemini Web Search',
      'Performs a web search using Google Search via Gemini API. This tool reuses existing Gemini authentication to provide search results with proper citations and grounding metadata.',
      Kind.Search,
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find information on the web. Be specific and clear for better results.',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of search results to include in the response (optional, default: all)',
            minimum: 1,
            maximum: 20,
          },
        },
        required: ['query'],
      },
    );
  }

  /**
   * Check if this tool is available (requires Gemini provider and authentication)
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if current provider is Gemini
      const { ModelProviderFactory } = await import('../providers/ModelProviderFactory.js');
      const { ModelProviderType } = await import('../providers/types.js');

      const currentProviderType = ModelProviderFactory.getCurrentProviderType();
      if (currentProviderType !== ModelProviderType.GEMINI) {
        return false;
      }

      // Check if Gemini authentication is available
      const { AuthManager } = await import('../auth/AuthManager.js');
      const authManager = AuthManager.getInstance();
      authManager.setConfig(this.config);

      const credentials = await authManager.getAccessCredentials('gemini');
      return !!(credentials?.accessToken || credentials?.apiKey);
    } catch {
      return false;
    }
  }

  /**
   * Validates the parameters for the GeminiSearchTool.
   */
  protected override validateToolParamValues(
    params: GeminiSearchToolParams,
  ): string | null {
    if (!params.query || params.query.trim() === '') {
      return "The 'query' parameter cannot be empty.";
    }

    if (params.maxResults !== undefined && (params.maxResults < 1 || params.maxResults > 20)) {
      return "The 'maxResults' parameter must be between 1 and 20.";
    }

    return null;
  }

  protected createInvocation(
    params: GeminiSearchToolParams,
  ): ToolInvocation<GeminiSearchToolParams, GeminiSearchToolResult> {
    return new GeminiSearchToolInvocation(this.config, params);
  }
}