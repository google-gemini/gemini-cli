#!/usr/bin/env node

/**
 * Hypha Service for Gemini Agent
 * 
 * This service wraps the Gemini CLI agent to provide remote programmatic access
 * through Hypha RPC. It registers a service with a `chat` function that processes
 * queries and yields intermediate outputs.
 */

// Fix for Node.js environment - ImageData is not available
if (typeof globalThis.ImageData === 'undefined') {
  class MockImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = MockImageData;
}

import hyphaRpc from 'hypha-rpc';
const { hyphaWebsocketClient } = hyphaRpc;
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import Gemini CLI configuration functions
import { loadSettings, SettingScope } from './packages/cli/dist/src/config/settings.js';
import { loadCliConfig } from './packages/cli/dist/src/config/config.js';
import { loadExtensions } from './packages/cli/dist/src/config/extension.js';

// Import Gemini core functionality
import { 
  sessionId,
  AuthType,
  executeToolCall
} from './packages/core/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const HYPHA_SERVER_URL = 'https://hypha.aicell.io';
const WORKSPACE = 'ws-user-github|478667';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2FtdW4uYWkvIiwic3ViIjoic3BhcmtseS1waHJhc2UtNzA2ODE3ODYiLCJhdWQiOiJodHRwczovL2FtdW4tYWkuZXUuYXV0aDAuY29tL2FwaS92Mi8iLCJpYXQiOjE3NTE1MTgwNDYsImV4cCI6MTc4NzUxODA0Niwic2NvcGUiOiJ3czp3cy11c2VyLWdpdGh1Ynw0Nzg2Njcjcncgd2lkOndzLXVzZXItZ2l0aHVifDQ3ODY2NyIsImd0eSI6ImNsaWVudC1jcmVkZW50aWFscyIsImh0dHBzOi8vYW11bi5haS9yb2xlcyI6WyJhZG1pbiJdLCJodHRwczovL2FtdW4uYWkvZW1haWwiOiJvZXdheTAwN0BnbWFpbC5jb20ifQ.rwAm1tkBGuNOuvV2OJ-6VtUVuTgMCqUNnxdJkI-q4Tw';
const SERVICE_ID = 'gemini-agent';

class GeminiHyphaService {
  constructor() {
    this.server = null;
    this.geminiConfig = null;
  }

  async initialize() {
    console.log('Initializing Gemini configuration...');
    
    // Initialize Gemini configuration
    await this.initializeGeminiConfig();
    
    console.log('Connecting to Hypha server...');
    
    // Connect to Hypha server
    this.server = await hyphaWebsocketClient.connectToServer({
      server_url: HYPHA_SERVER_URL,
      workspace: WORKSPACE,
      token: TOKEN
    });

    console.log(`Connected to workspace: ${this.server.config.workspace}`);

    // Register the service
    const service = await this.server.registerService({
      id: SERVICE_ID,
      name: 'Gemini Agent Service',
      description: 'Remote access to Gemini CLI agent with streaming responses',
      config: {
        visibility: 'public',
        require_context: false
      },
      chat: this.chat.bind(this)
    });

    console.log(`Service registered with ID: ${service.id}`);
    console.log(`Service URL: ${HYPHA_SERVER_URL}/${this.server.config.workspace}/services/${SERVICE_ID}/chat`);
    
    return service;
  }

  async initializeGeminiConfig() {
    try {
      // Set environment variable for Gemini API key
      process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBCchC4FVd9Bh8THZBFOhMYgHmt2-3TYMA';
      
      const workspaceRoot = process.cwd();
      const settings = loadSettings(workspaceRoot);
      
      // Set default auth type to use Gemini API key
      if (!settings.merged.selectedAuthType && process.env.GEMINI_API_KEY) {
        settings.setValue(SettingScope.User, 'selectedAuthType', AuthType.USE_GEMINI);
      }

      const extensions = loadExtensions(workspaceRoot);
      this.geminiConfig = await loadCliConfig(settings.merged, extensions, sessionId);

      // Initialize services
      this.geminiConfig.getFileService();
      
      // Authenticate if needed
      if (settings.merged.selectedAuthType) {
        await this.geminiConfig.refreshAuth(settings.merged.selectedAuthType);
      } else {
        await this.geminiConfig.refreshAuth(AuthType.USE_GEMINI);
      }
      
      console.log('Gemini configuration initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Gemini configuration:', error);
      throw error;
    }
  }

  /**
   * Chat function that processes queries using the Gemini CLI
   * This is an async generator that yields intermediate outputs
   * 
   * @param {string} query - The user query to process
   * @returns {AsyncGenerator} - Generator yielding intermediate responses
   */
  async *chat(query) {
    console.log(`Processing query: ${query}`);
    
    try {
      yield {
        type: 'status',
        content: 'Initializing Gemini client...',
        timestamp: new Date().toISOString()
      };

      // Get the Gemini client
      const geminiClient = this.geminiConfig.getGeminiClient();
      const toolRegistry = await this.geminiConfig.getToolRegistry();
      const chat = await geminiClient.getChat();

      yield {
        type: 'status',
        content: 'Processing query with Gemini...',
        timestamp: new Date().toISOString()
      };

      let currentMessages = [{ role: 'user', parts: [{ text: query }] }];
      let fullResponse = '';

      while (true) {
        const functionCalls = [];

        const responseStream = await chat.sendMessageStream({
          message: currentMessages[0]?.parts || [],
          config: {
            tools: [
              { functionDeclarations: toolRegistry.getFunctionDeclarations() },
            ],
          },
        });

        // Process streaming response
        for await (const resp of responseStream) {
          const textPart = this.getResponseText(resp);
          if (textPart) {
            fullResponse += textPart;
            yield {
              type: 'text',
              content: textPart,
              timestamp: new Date().toISOString()
            };
          }
          
          if (resp.functionCalls) {
            functionCalls.push(...resp.functionCalls);
          }
        }

        // Handle function calls if any
        if (functionCalls.length > 0) {
          yield {
            type: 'status',
            content: `Executing ${functionCalls.length} tool call(s)...`,
            timestamp: new Date().toISOString()
          };

          const toolResponseParts = [];

          for (const fc of functionCalls) {
            const callId = fc.id ?? `${fc.name}-${Date.now()}`;
            const requestInfo = {
              callId,
              name: fc.name,
              args: fc.args ?? {},
              isClientInitiated: false,
            };

            try {
              const toolResponse = await executeToolCall(
                this.geminiConfig,
                requestInfo,
                toolRegistry,
                new AbortController().signal
              );

              if (toolResponse.error) {
                yield {
                  type: 'error',
                  content: `Tool execution error: ${toolResponse.error.message}`,
                  timestamp: new Date().toISOString()
                };
              }

              if (toolResponse.responseParts) {
                const parts = Array.isArray(toolResponse.responseParts)
                  ? toolResponse.responseParts
                  : [toolResponse.responseParts];
                for (const part of parts) {
                  if (typeof part === 'string') {
                    toolResponseParts.push({ text: part });
                  } else if (part) {
                    toolResponseParts.push(part);
                  }
                }
              }
            } catch (error) {
              yield {
                type: 'error',
                content: `Tool execution failed: ${error.message}`,
                timestamp: new Date().toISOString()
              };
            }
          }

          currentMessages = [{ role: 'user', parts: toolResponseParts }];
        } else {
          // No more function calls, we're done
          break;
        }
      }

      // Yield final response
      yield {
        type: 'final',
        content: fullResponse || 'Query processed successfully',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error processing query:', error);
      yield {
        type: 'error',
        content: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Extract text response from Gemini response
   */
  getResponseText(response) {
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (
        candidate.content &&
        candidate.content.parts &&
        candidate.content.parts.length > 0
      ) {
        // Skip thought parts in headless mode
        const thoughtPart = candidate.content.parts[0];
        if (thoughtPart?.thought) {
          return null;
        }
        return candidate.content.parts
          .filter((part) => part.text)
          .map((part) => part.text)
          .join('');
      }
    }
    return null;
  }

  async serve() {
    console.log('Service is running. Press Ctrl+C to stop.');
    
    // Keep the service running
    process.on('SIGINT', () => {
      console.log('\nShutting down service...');
      process.exit(0);
    });

    // Keep alive
    await new Promise(() => {});
  }
}

// Main execution
async function main() {
  const service = new GeminiHyphaService();
  
  try {
    await service.initialize();
    await service.serve();
  } catch (error) {
    console.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Run the service if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { GeminiHyphaService };