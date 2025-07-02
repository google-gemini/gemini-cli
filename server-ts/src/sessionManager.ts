import { 
  Config, 
  ToolRegistry, 
  executeToolCall, 
  ToolCallRequestInfo,
  ApprovalMode,
  FileDiscoveryService,
  AuthType
} from '@google/gemini-cli-core';
import { randomUUID } from 'crypto';
import { Content, Part, FunctionCall, GenerateContentResponse } from '@google/genai';
import { ConfigParameters } from './types.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface GeminiSession {
  config: Config;
  chat: any; // Will be the actual chat object from gemini-cli-core
  toolRegistry: ToolRegistry;
  abortController: AbortController;
}

export class SessionManager {
  private sessions: Map<string, GeminiSession> = new Map();

  async createSession(sessionId: string, configParams: ConfigParameters): Promise<void> {
    try {
      // Create configuration object with all required parameters (similar to loadCliConfig in the CLI)
      const config = new Config({
        sessionId: randomUUID(),
        embeddingModel: 'gemini-embedding-001',
        sandbox: configParams.sandbox || false,
        targetDir: process.cwd(),
        debugMode: configParams.debug || false,
        question: '',
        fullContext: configParams.allFiles || false,
        coreTools: undefined,
        excludeTools: [],
        toolDiscoveryCommand: undefined,
        toolCallCommand: undefined,
        mcpServerCommand: undefined,
        mcpServers: {},
        userMemory: '',
        geminiMdFileCount: 0,
        approvalMode: configParams.yolo ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
        showMemoryUsage: configParams.showMemoryUsage || false,
        accessibility: undefined,
        telemetry: {
          enabled: configParams.telemetry || false,
          target: configParams.telemetryTarget as any,
          otlpEndpoint: undefined,
          logPrompts: false,
        },
        usageStatisticsEnabled: true,
        fileFiltering: {
          respectGitIgnore: true,
          enableRecursiveFileSearch: true,
        },
        checkpointing: configParams.checkpointing || false,
        proxy: process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy,
        cwd: process.cwd(),
        fileDiscoveryService: new FileDiscoveryService(process.cwd()),
        bugCommand: undefined,
        model: configParams.model || 'gemini-2.5-pro',
        extensionContextFilePaths: [],
      });

      // Initialize authentication - check for API key first
      const authType = process.env.GEMINI_API_KEY ? AuthType.USE_GEMINI : AuthType.LOGIN_WITH_GOOGLE;
      await config.refreshAuth(authType);

      // Get Gemini client and create chat
      const geminiClient = config.getGeminiClient();
      const chat = await geminiClient.getChat();
      
      // Get tool registry
      const toolRegistry = await config.getToolRegistry();
      
      // Create abort controller for this session
      const abortController = new AbortController();

      // Store session
      this.sessions.set(sessionId, {
        config,
        chat,
        toolRegistry,
        abortController
      });

      console.log(`Created session ${sessionId} with model ${configParams.model || 'gemini-2.5-pro'}`);
    } catch (error) {
      console.error(`Failed to create session ${sessionId}:`, error);
      throw error;
    }
  }

  getSession(sessionId: string): SessionHandler | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    
    return new SessionHandler(session);
  }

  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Cancel any ongoing operations
      session.abortController.abort();
      this.sessions.delete(sessionId);
      console.log(`Deleted session ${sessionId}`);
      return true;
    }
    return false;
  }

  getAllSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

class SessionHandler {
  constructor(private session: GeminiSession) {}

  async sendMessage(input: string, onChunk: (chunk: string) => void): Promise<void> {
    const { chat, toolRegistry, abortController, config } = this.session;
    
    let currentMessages: Content[] = [{ role: 'user', parts: [{ text: input }] }];

    try {
      while (true) {
        const functionCalls: FunctionCall[] = [];

        // Send message and get streaming response
        const responseStream = await chat.sendMessageStream({
          message: currentMessages[0]?.parts || [],
          config: {
            abortSignal: abortController.signal,
            tools: [
              { functionDeclarations: toolRegistry.getFunctionDeclarations() },
            ],
          },
        });

        // Process streaming response
        for await (const resp of responseStream) {
          if (abortController.signal.aborted) {
            throw new Error('Operation cancelled');
          }

          const textPart = this.getResponseText(resp);
          if (textPart) {
            onChunk(textPart);
          }

          if (resp.functionCalls) {
            functionCalls.push(...resp.functionCalls);
          }
        }

        // Handle tool calls if any
        if (functionCalls.length > 0) {
          const toolResponseParts: Part[] = [];

          for (const fc of functionCalls) {
            const callId = fc.id ?? `${fc.name}-${Date.now()}`;
            const requestInfo: ToolCallRequestInfo = {
              callId,
              name: fc.name as string,
              args: (fc.args ?? {}) as Record<string, unknown>,
              isClientInitiated: false,
            };

            const toolResponse = await executeToolCall(
              config,
              requestInfo,
              toolRegistry,
              abortController.signal,
            );

            if (toolResponse.error) {
              const isToolNotFound = toolResponse.error.message.includes(
                'not found in registry',
              );
              const errorMsg = `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`;
              onChunk(`\n[Tool Error] ${errorMsg}\n`);
              
              if (!isToolNotFound) {
                throw new Error(errorMsg);
              }
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
          }
          
          currentMessages = [{ role: 'user', parts: toolResponseParts }];
        } else {
          // No more tool calls, conversation is complete
          break;
        }
      }
    } catch (error) {
      console.error('Error in sendMessage:', error);
      throw error;
    }
  }

  private getResponseText(response: GenerateContentResponse): string | null {
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (
        candidate.content &&
        candidate.content.parts &&
        candidate.content.parts.length > 0
      ) {
        // Filter out thought parts in headless mode
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

  getHistoryLength(): number {
    try {
      const history = this.session.chat.getHistory();
      return history.length;
    } catch {
      return 0;
    }
  }
}