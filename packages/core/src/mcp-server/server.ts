/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { restoreOriginalStdio } from '../utils/stdio.js';
import { resolveModel } from '../config/models.js';

/**
 * Session state for an active Gemini conversation
 */
interface GeminiSession {
  history: Content[];
  model: string;
}

/**
 * MCP Server that exposes Gemini CLI capabilities via the Model Context Protocol.
 *
 * This allows external MCP clients to use Gemini as a coding assistant,
 * similar to how Codex exposes its functionality via `codex mcp-server`.
 */
export class GeminiMcpServer {
  private server: McpServer;
  private sessions: Map<string, GeminiSession> = new Map();
  private config: Config;
  private contentGenerator: ContentGenerator;

  constructor(config: Config, contentGenerator: ContentGenerator) {
    this.config = config;
    this.contentGenerator = contentGenerator;

    this.server = new McpServer({
      name: 'gemini-cli',
      version: '1.0.0',
    });

    this.registerTools();
  }

  /**
   * Register the MCP tools that this server exposes
   */
  private registerTools(): void {
    // Tool: Start a new Gemini session and send a prompt
    this.server.tool(
      'gemini',
      'Send a prompt to Gemini and get a response. Optionally specify a sessionId to maintain conversation history.',
      {
        prompt: z.string().describe('The prompt to send to Gemini'),
        model: z.string().optional().describe('Model to use (optional, uses configured default if not specified)'),
        sessionId: z.string().optional().describe('Session ID for conversation continuity (optional, creates new session if not specified)'),
      },
      async ({ prompt, model, sessionId }) => {
        try {
          const effectiveSessionId = sessionId || this.generateSessionId();
          let session = this.sessions.get(effectiveSessionId);

          if (!session) {
            // Resolve model alias (e.g., "auto" -> "gemini-2.5-pro")
            const requestedModel = model || this.config.getModel();
            const resolvedModel = resolveModel(requestedModel, this.config.getPreviewFeatures());
            session = {
              history: [],
              model: resolvedModel,
            };
            this.sessions.set(effectiveSessionId, session);
          } else if (model) {
            // If model explicitly provided for existing session, update it
            session.model = resolveModel(model, this.config.getPreviewFeatures());
          }

          // Add user message to history
          session.history.push({
            role: 'user',
            parts: [{ text: prompt }],
          });

          const response = await this.contentGenerator.generateContent(
            {
              model: session.model,
              contents: session.history,
            },
            effectiveSessionId,
          );

          // Extract text from response
          const responseText = response.candidates?.[0]?.content?.parts
            ?.map((part) => ('text' in part ? part.text : ''))
            .join('') || '';

          // Add model response to history
          if (response.candidates?.[0]?.content) {
            session.history.push(response.candidates[0].content);
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: responseText,
              },
              {
                type: 'text' as const,
                text: `[Session ID: ${effectiveSessionId}]`,
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool: Continue an existing Gemini session
    this.server.tool(
      'gemini_reply',
      'Continue an existing Gemini session with a follow-up prompt.',
      {
        sessionId: z.string().describe('The session ID to continue'),
        prompt: z.string().describe('The follow-up prompt to send'),
      },
      async ({ sessionId, prompt }) => {
        try {
          const session = this.sessions.get(sessionId);
          if (!session) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Session not found: ${sessionId}. Use the 'gemini' tool to start a new session.`,
                },
              ],
              isError: true,
            };
          }

          // Add user message to history
          session.history.push({
            role: 'user',
            parts: [{ text: prompt }],
          });

          // Use the model stored with the session for consistency
          const response = await this.contentGenerator.generateContent(
            {
              model: session.model,
              contents: session.history,
            },
            sessionId,
          );

          // Extract text from response
          const responseText = response.candidates?.[0]?.content?.parts
            ?.map((part) => ('text' in part ? part.text : ''))
            .join('') || '';

          // Add model response to history
          if (response.candidates?.[0]?.content) {
            session.history.push(response.candidates[0].content);
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: responseText,
              },
              {
                type: 'text' as const,
                text: `[Session ID: ${sessionId}]`,
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return randomUUID();
  }

  /**
   * Start the MCP server using stdio transport
   * Returns a promise that resolves when the transport closes
   */
  async start(): Promise<void> {
    // Restore original stdout/stderr before starting MCP server
    // This is necessary because patchStdio() intercepts writes for the UI
    restoreOriginalStdio();

    const transport = new StdioServerTransport();

    // Create a promise that resolves when transport closes
    const closePromise = new Promise<void>((resolve) => {
      transport.onclose = () => {
        this.cleanup();
        resolve();
      };
    });

    await this.server.connect(transport);

    // Wait for the transport to close (when stdin closes or client disconnects)
    await closePromise;
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.sessions.clear();
  }
}

/**
 * Create and start the MCP server
 */
export async function startGeminiMcpServer(
  config: Config,
  contentGenerator: ContentGenerator,
): Promise<void> {
  const server = new GeminiMcpServer(config, contentGenerator);
  await server.start();
}
