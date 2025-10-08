/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ModelProviderConfig,
  UniversalMessage,
  UniversalStreamEvent,
  ConnectionStatus,
  ToolCall,
  CompressionInfo,
  ModelProviderType
} from '../providers/types.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import type { BaseModelProvider } from '../providers/BaseModelProvider.js';
import type { ToolCallRequestInfo, ChatCompressionInfo } from '../core/turn.js';
import { ModelProviderFactory } from '../providers/ModelProviderFactory.js';
import { ProviderConfigManager } from '../providers/ProviderConfigManager.js';
import { RoleManager } from '../roles/RoleManager.js';
import { WorkspaceManager } from '../utils/WorkspaceManager.js';
import { executeToolCall } from '../core/nonInteractiveToolExecutor.js';
import { CoreToolScheduler } from '../core/coreToolScheduler.js';
import type { 
  ToolCallConfirmationDetails, 
  ToolConfirmationOutcome  
} from '../tools/tools.js';
import { CompressionStatus } from '../core/turn.js';
import type { ToolCallResponseInfo } from '../core/turn.js';
import { SessionManager } from '../sessions/SessionManager.js';
import { getCompressionPrompt } from '../core/prompts.js';
import { checkNextSpeaker } from './nextSpeakerChecker.js';
import { getErrorMessage } from '../utils/errors.js';
// import { findIndexAfterFraction } from '../core/client.js';

// Compression constants (same as Gemini client)
const COMPRESSION_TOKEN_THRESHOLD = 0.7; // Compress when token usage reaches 70% of limit
const COMPRESSION_PRESERVE_THRESHOLD = 0.3; // Keep last 30% of conversation

// Global reference to current active provider config (for subagents to inherit)
let globalActiveProviderConfig: ModelProviderConfig | null = null;

/**
 * Get the current active provider config (for subagents to inherit from main session)
 */
export function getGlobalActiveProviderConfig(): ModelProviderConfig | null {
  return globalActiveProviderConfig;
}

export class MultiModelSystem {
  private configManager: ProviderConfigManager;
  private workspaceManager: WorkspaceManager;
  private currentProvider: ModelProviderConfig | null = null;
  private config: Config;
  private initializedProviders: Map<string, BaseModelProvider> = new Map();
  private utilityProviders: Map<string, BaseModelProvider> = new Map();
  private toolConfirmationHandler?: (details: ToolCallConfirmationDetails) => Promise<ToolConfirmationOutcome>;
  private activeToolScheduler?: CoreToolScheduler;
  // Static mapping of model names to their tool call formats
  private static readonly MODEL_FORMATS: Record<string, 'openai' | 'harmony' | 'gemini' | 'qwen'> = {
    // Harmony format models (gpt-oss family)
    'openai/gpt-oss-20b': 'harmony',
    'gpt-oss-20b': 'harmony',
    'gpt-oss-20b@f16': 'harmony',
    
    // OpenAI Chat Completions format models
    'gpt-4o': 'openai',
    'gpt-4.1': 'openai',
    'gpt-4': 'openai',
    'gpt-3.5-turbo': 'openai',
    
    // Gemini format models (Google)
    'gemini-1.5-pro': 'gemini',
    'gemini-1.5-flash': 'gemini',
    'gemini-2.0-flash': 'gemini',
    'gemini-2.5-pro': 'gemini',
    'gemini-2.5-flash': 'gemini',
    
    // Qwen models (Alibaba)
    'qwen/qwen3-coder-30b': 'qwen',
    'qwen/qwq-32b': 'qwen',
    'qwen/qwen3-30b-a3b-2507': 'qwen',
    'qwen/qwen3-4b-thinking-2507': 'qwen',
    'qwen/qwen3-4b-2507': 'qwen',
  };

  /**
   * Get the tool call format for the current model
   */
  private getModelFormat(): 'openai' | 'harmony' | 'gemini' | 'qwen' {
    if (!this.currentProvider) {
      return 'openai'; // Default to OpenAI format
    }
    
    const modelName = this.currentProvider.model.toLowerCase();
    
    // Check exact match first
    if (MultiModelSystem.MODEL_FORMATS[modelName]) {
      return MultiModelSystem.MODEL_FORMATS[modelName];
    }
    
    // Check partial matches for flexibility
    for (const [key, format] of Object.entries(MultiModelSystem.MODEL_FORMATS)) {
      if (modelName.includes(key.toLowerCase()) || key.toLowerCase().includes(modelName)) {
        console.log(`[MultiModelSystem] Model ${modelName} matched pattern ${key}, using ${format} format`);
        return format;
      }
    }
    
    // Default to OpenAI format for unknown models
    console.log(`[MultiModelSystem] Unknown model ${modelName}, defaulting to OpenAI format`);
    return 'openai';
  }

  /**
   * Create tool response message in appropriate format based on model type
   */
  private createToolResponseMessage(
    content: string, 
    toolCallId: string, 
    toolName: string
  ): UniversalMessage {
    const format = this.getModelFormat();
    
    if (format === 'harmony') {
      // Harmony format for gpt-oss and similar models
      const harmonyContent = `<|start|>${toolName} to=assistant
<|channel|>commentary
<|message|>
{
  "tool_call_id": "${toolCallId}",
  "result": ${JSON.stringify(content)}
}
<|end|>`;
      
      return {
        role: 'user', // In Harmony format, tool responses go as user messages
        content: harmonyContent,
        timestamp: new Date()
      };
    } else if (format === 'qwen') {
      // Qwen format - uses XML-like structure with tool_response tags
      const qwenContent = `<tool_response>\n${content}\n</tool_response>`;
      
      return {
        role: 'user', // Qwen format uses user role for tool responses like Harmony
        content: qwenContent,
        tool_call_id: toolCallId,
        name: toolName,
        timestamp: new Date()
      };
    } else if (format === 'gemini') {
      // Gemini format with functionResponse structure
      // For Gemini, we'll encode the functionResponse into the content as JSON
      // The GeminiProvider will parse this and convert to proper functionResponse
      const functionResponseData = {
        id: toolCallId,
        name: toolName,
        response: { output: content }
      };
      
      return {
        role: 'tool',
        content: JSON.stringify({ __gemini_function_response: functionResponseData }),
        tool_call_id: toolCallId,
        name: toolName,
        timestamp: new Date()
      };
    } else {
      // Standard OpenAI format for other models
      return {
        role: 'tool',
        content,
        tool_call_id: toolCallId,
        name: toolName,
        timestamp: new Date()
      };
    }
  }
  // private readonly DEFAULT_MAX_TURNS = 10;

  constructor(config: Config) {
    this.config = config;
    this.configManager = new ProviderConfigManager(config);
    this.workspaceManager = WorkspaceManager.getInstance(config);
    
    this.currentProvider = this.configManager.getDefaultProviderConfig() || null;
  }

  /**
   * Set the tool confirmation handler
   */
  setToolConfirmationHandler(handler: (details: ToolCallConfirmationDetails) => Promise<ToolConfirmationOutcome>): void {
    this.toolConfirmationHandler = handler;
  }

  /**
   * Initialize the MultiModelSystem
   */
  async initialize(): Promise<void> {
    // Initialize AuthManager with default API key preferences for providers that only support API keys
    const { AuthManager } = await import('../auth/AuthManager.js');
    const authManager = AuthManager.getInstance();
    authManager.setConfig(this.config);
    authManager.initializeDefaultApiKeyAuth();

    // Initialize the default provider if one is configured
    if (this.currentProvider) {
      await this.getOrCreateProvider(this.currentProvider);
      console.log(`[MultiModelSystem] Initialized default provider: ${this.currentProvider.type}-${this.currentProvider.model}`);
    }
  }
  
  /**
   * Send messages and handle tool calls automatically (non-streaming)
   * This method will execute tools and continue the conversation until no more tool calls
   */
  async sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal,
    roleId?: string,
    maxTurns: number = 20
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    if (!this.currentProvider) {
      throw new Error('No provider configured');
    }

    const sessionManager = SessionManager.getInstance();
    const provider = await this.getOrCreateProvider(this.currentProvider);

    // Add messages to history
    messages.forEach(msg => {
      sessionManager.addHistory({
        ...msg,
        timestamp: msg.timestamp || new Date()
      });
    });

    let turnCount = 0;
    let finalContent = '';
    const allToolCalls: ToolCall[] = [];

    while (turnCount < maxTurns) {
      turnCount++;

      if (signal.aborted) {
        throw new Error('Operation aborted');
      }

      // Get current history and enhance with role/context
      const currentHistory = sessionManager.getHistory();
      // const limitedMessages = this.limitContextSize(currentHistory);
      const enhancedMessages = await this.enhanceMessagesWithRole([...currentHistory], roleId);

      // Send to provider
      const response = await provider.sendMessage(enhancedMessages, signal);

      const assistantContent = response.content || '';
      const toolCalls = response.toolCalls || [];

      // Add assistant response to history
      const assistantMessage: UniversalMessage = {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date()
      };

      if (toolCalls.length > 0) {
        assistantMessage.toolCalls = toolCalls;
      }

      sessionManager.addHistory(assistantMessage);
      finalContent += assistantContent;
      allToolCalls.push(...toolCalls);

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        break;
      }

      // Execute tool calls
      const toolResults: string[] = [];
      for (const toolCall of toolCalls) {
        const requestInfo: ToolCallRequestInfo = {
          callId: toolCall.id || `call_${Date.now()}`,
          name: toolCall.name,
          args: toolCall.arguments || {},
          isClientInitiated: false,
          prompt_id: `multimodel_${Date.now()}`
        };

        try {
          const toolResponse = await executeToolCall(this.config, requestInfo, signal);
          const result = toolResponse.resultDisplay || 'Tool executed successfully';
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          toolResults.push(`Tool ${toolCall.name}: ${resultStr}`);
        } catch (error) {
          toolResults.push(`Tool ${toolCall.name} error: ${getErrorMessage(error)}`);
        }
      }

      // Add tool results as user message
      const toolResultMessage: UniversalMessage = {
        role: 'user',
        content: `Tool results:\n${toolResults.join('\n')}`,
        timestamp: new Date()
      };
      sessionManager.addHistory(toolResultMessage);
    }

    return { content: finalContent, toolCalls: allToolCalls };
  }

  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal,
    roleId?: string,
    continuationDepth: number = 0
  ): AsyncGenerator<UniversalStreamEvent> {
    if (!this.currentProvider) {
      throw new Error('No provider configured');
    }

    // GUI should send ONLY new user messages (like GeminiClient pattern)
    console.log('[MultiModelSystem] Received new user messages:', messages);

    // Add all received messages to history (they should all be new user messages)
    const sessionManager = SessionManager.getInstance();
    messages.forEach(msg => {
      console.log('[MultiModelSystem] Adding to history:', msg);
      // For user messages, use the timestamp from frontend if available, otherwise use current time
      const msgToAdd = {
        ...msg,
        timestamp: msg.timestamp || new Date()
      };
      sessionManager.addHistory(msgToAdd);

      // Auto-update title if this is the first user message in the session
      // Skip auto-title for continuation prompts
      if (!(msg.role === 'user' && msg.content === 'Please continue.' && continuationDepth > 0)) {
        sessionManager.handleAutoTitleGeneration(msg);
      }
    });

    const provider = await this.getOrCreateProvider(this.currentProvider!);

    // Add intelligent duplicate detection and safety limits
    let turnCount = 0;
    const MAX_TURNS = 100; // Hard safety limit to prevent any infinite loops
    const MAX_DUPLICATE_CALLS = this.config.getMaxSessionTurns() >= 0 ? this.config.getMaxSessionTurns() : 20;
    
    // Track tool call history for duplicate detection
    const toolCallHistory: Array<{ name: string; args: Record<string, unknown>; timestamp: number }> = [];
    let duplicateCount = 0;

    while (true) {
      turnCount++;
      
      // Hard safety limit check (100 turns)
      if (turnCount > MAX_TURNS) {
        console.error(`[MultiModelSystem] Reached absolute maximum turns (${MAX_TURNS}), stopping to prevent infinite loop.`);
        
        const limitMessage = `\n\n⚠️ **Absolute Turn Limit Reached**\n\n` +
          `I've reached the absolute maximum of ${MAX_TURNS} turns to prevent system overload. ` +
          `This is a hard safety measure.\n\n` +
          `**What happened:** I made ${MAX_TURNS} turns in this conversation.\n\n` +
          `**How to continue:** Please start a new conversation or ask me to compress the chat history.\n\n` +
          `**Current status:** I'm stopping here for system stability.`;
        
        yield {
          type: 'content_delta',
          content: limitMessage
        };
        
        const limitNotificationMessage: UniversalMessage = {
          role: 'assistant',
          content: limitMessage,
          timestamp: new Date()
        };
        sessionManager.addHistory(limitNotificationMessage);
        
        yield {
          type: 'done'
        };
        
        return;
      }
      
      // Check duplicate tool calls limit
      if (duplicateCount > MAX_DUPLICATE_CALLS) {
        console.error(`[MultiModelSystem] Reached maximum duplicate tool calls (${duplicateCount}), stopping to prevent infinite loop.`);
        
        const limitMessage = `\n\n⚠️ **Duplicate Tool Call Limit Reached**\n\n` +
          `I've detected ${duplicateCount} duplicate tool calls, which suggests I might be stuck in a loop. ` +
          `This is a safety measure to ensure system stability.\n\n` +
          `**What happened:** I kept making the same tool calls with identical parameters.\n\n` +
          `**How to continue:** Please provide more specific instructions or ask me to try a different approach.\n\n` +
          `**Current status:** I'm pausing here and waiting for your guidance to proceed differently.`;
        
        yield {
          type: 'content_delta',
          content: limitMessage
        };
        
        // Add the limit notification to session history so user can see it
        const limitNotificationMessage: UniversalMessage = {
          role: 'assistant',
          content: limitMessage,
          timestamp: new Date()
        };
        sessionManager.addHistory(limitNotificationMessage);
        
        yield {
          type: 'done'
        };
        
        return;
      }

      // Check for abort signal
      if (signal.aborted) {
        console.error('[MultiModelSystem] Operation cancelled.');
        return;
      }
      
      // NEW: Get fresh history from SessionManager and apply context limiting each time
      const fullHistory = sessionManager.getHistory();

      // Quick check: skip compression if we don't have enough turns
      const MIN_TURNS_BEFORE_COMPRESSION_CHECK = 10; // Don't even check compression until 10 turns
      const userTurnsCount = fullHistory.filter(m => m.role === 'user').length;

      // Check if we need to compress before processing (like Gemini client does)
      const compressionResult = userTurnsCount >= MIN_TURNS_BEFORE_COMPRESSION_CHECK
        ? await this.tryCompressChat(provider, sessionManager, fullHistory)
        : {
            originalTokenCount: 0,
            newTokenCount: 0,
            compressionStatus: CompressionStatus.NOOP
          };
      if (compressionResult.compressionStatus === CompressionStatus.COMPRESSED) {
        
        // Yield compression event to notify frontend
        const compressionInfo: CompressionInfo = {
          originalTokenCount: compressionResult.originalTokenCount,
          newTokenCount: compressionResult.newTokenCount,
          compressionRatio: compressionResult.newTokenCount / compressionResult.originalTokenCount
        };
        
        yield {
          type: 'compression',
          compressionInfo
        };
      }
      
      // Get the updated history after potential compression
      const currentHistory = sessionManager.getHistory();
      // const limitedMessages = this.limitContextSize(currentHistory);
      
      // Enhance messages with system prompt, role and workspace context
      const enhancedMessages = await this.enhanceMessagesWithRole([...currentHistory], roleId);
      
      const responseStream = provider.sendMessageStream(enhancedMessages, signal);
      const toolCallRequests: ToolCallRequestInfo[] = [];
      const assistantToolCalls: ToolCall[] = [];  // Collect tool calls for history
      let assistantContent = '';

      // Collect tool call requests and pass through other events
      for await (const event of responseStream) {
        if (signal.aborted) {
          console.error('[MultiModelSystem] Operation cancelled.');
          return;
        }

        if (event.type === 'content_delta' && event.content) {
          // Collect assistant content for history
          assistantContent += event.content;
          yield event;
        } else if (event.type === 'tool_call' && event.toolCall) {
          // Convert UniversalStreamEvent tool call to ToolCallRequestInfo
          const toolCallRequest: ToolCallRequestInfo = {
            callId: event.toolCall.id,
            name: event.toolCall.name,
            args: event.toolCall.arguments,
            isClientInitiated: false,
            prompt_id: `multimodel_${Date.now()}`
          };
          
          // Also collect for assistant history
          assistantToolCalls.push({
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: event.toolCall.arguments
          });
          
          toolCallRequests.push(toolCallRequest);
          console.log(`[MultiModelSystem] Collected tool call: ${event.toolCall.name}`);
          
          // Immediately yield the tool call event to frontend for real-time display
          yield {
            type: 'tool_call',
            toolCall: event.toolCall
          };
        } else if (event.type === 'compression') {
          // Pass through compression events from provider
          console.log(`[MultiModelSystem] Provider compression event:`, event.compressionInfo);
          yield event;
        } else if (event.type === 'done') {
          // Note: Assistant message is now saved AFTER the stream completes, not here
          // This prevents duplicate saves and ensures tool calls are included
          yield event;
        } else if (event.type === 'error') {
          // Log error
          const errorMessage = event.error?.message || 'Unknown error';
          console.error(`[MultiModelSystem] Provider error: ${errorMessage}`);
          if (event.error?.stack) {
            console.error(`[MultiModelSystem] Error stack: ${event.error.stack}`);
          }

          // Save accumulated assistant content WITHOUT tool calls (since they can't be executed)
          if (assistantContent.trim()) {
            const assistantMessage: UniversalMessage = {
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date()
            };
            // Don't include tool calls since we can't execute them due to error
            SessionManager.getInstance().addHistory(assistantMessage);
            console.log(`[MultiModelSystem] Saved assistant response before error (${assistantContent.length} chars, discarded ${assistantToolCalls.length} tool calls)`);
          }

          // Clear tool call requests since we can't execute them after error
          if (toolCallRequests.length > 0) {
            console.warn(`[MultiModelSystem] Discarding ${toolCallRequests.length} tool call request(s) due to error`);
            toolCallRequests.length = 0;
          }

          yield event;
          return; // Don't continue with tool execution after error
        } else {
          // Pass through any other unknown event types
          console.warn(`[MultiModelSystem] Unknown event type: ${event.type}`);
          yield event;
        }
      }

      // Check if we have tool calls to execute (like nonInteractiveCli.ts)
      if (toolCallRequests.length > 0) {
        // Collect tool responses to save together with assistant message
        const executedToolResponses: UniversalMessage[] = [];
        // Check for duplicate tool calls before execution
        for (const requestInfo of toolCallRequests) {
          const callSignature = {
            name: requestInfo.name,
            args: requestInfo.args,
            timestamp: Date.now()
          };
          
          // Check if this exact call (same name and args) was made recently
          const isDuplicate = toolCallHistory.some(prevCall => 
            prevCall.name === callSignature.name &&
            JSON.stringify(prevCall.args) === JSON.stringify(callSignature.args) &&
            (callSignature.timestamp - prevCall.timestamp) < 60000 // Within last minute
          );
          
          if (isDuplicate) {
            duplicateCount++;
            console.warn(`[MultiModelSystem] Detected duplicate tool call: ${requestInfo.name} (duplicate count: ${duplicateCount})`);
          } else {
            // Reset duplicate count for different calls
            if (duplicateCount > 0) {
              console.log(`[MultiModelSystem] Tool call changed, resetting duplicate count from ${duplicateCount} to 0`);
              duplicateCount = 0;
            }
          }
          
          // Add to history (keep only last 50 calls to prevent memory issues)
          toolCallHistory.push(callSignature);
          if (toolCallHistory.length > 50) {
            toolCallHistory.shift();
          }
        }
        
        // Execute all tool calls in parallel using a single CoreToolScheduler
        const yieldedToolCallIds = new Set<string>();

        // Use CoreToolScheduler with confirmation support if handler is available
        if (this.toolConfirmationHandler) {
          await new Promise<void>((resolve, reject) => {
            const scheduler = new CoreToolScheduler({
              config: this.config,
              getPreferredEditor: () => undefined,
              onEditorClose: () => {},

              // This is called every time any tool's status changes
              onToolCallsUpdate: async (toolCallsUpdate) => {
                for (const toolCall of toolCallsUpdate) {
                  // Handle confirmation requests
                  if (toolCall.status === 'awaiting_approval') {
                    if ('confirmationDetails' in toolCall && this.toolConfirmationHandler) {
                      const outcome = await this.toolConfirmationHandler(toolCall.confirmationDetails);
                      await toolCall.confirmationDetails.onConfirm(outcome);
                    }
                  }

                  // Collect completed tool responses
                  if ((toolCall.status === 'success' || toolCall.status === 'error' || toolCall.status === 'cancelled')
                      && !yieldedToolCallIds.has(toolCall.request.callId)) {

                    yieldedToolCallIds.add(toolCall.request.callId);

                    // Extract tool response content
                    let toolResponseContent: string;

                    if (toolCall.status === 'success' && 'response' in toolCall) {
                      const response = toolCall.response;

                      if (response.responseParts && response.responseParts.length > 0) {
                        const responsePart = response.responseParts[0];

                        if ('text' in responsePart) {
                          toolResponseContent = responsePart.text || '';
                        } else if ('functionResponse' in responsePart && responsePart.functionResponse) {
                          const funcResponse = responsePart.functionResponse.response;
                          if (funcResponse && typeof funcResponse === 'object') {
                            if ('output' in funcResponse && funcResponse['output']) {
                              toolResponseContent = funcResponse['output'] as string;
                            } else {
                              toolResponseContent = JSON.stringify(funcResponse, null, 2);
                            }
                          } else {
                            toolResponseContent = JSON.stringify(funcResponse, null, 2);
                          }
                        } else if ('inlineData' in responsePart && responsePart.inlineData?.data) {
                          toolResponseContent = `[Tool returned file data: ${responsePart.inlineData.mimeType}]`;
                        } else {
                          toolResponseContent = '[Tool response data]';
                        }
                      } else {
                        toolResponseContent = 'Tool executed successfully';
                      }
                    } else if (toolCall.status === 'error' && 'response' in toolCall) {
                      const errorMsg = toolCall.response.error?.message || 'Tool execution failed';
                      toolResponseContent = `Tool execution failed: ${errorMsg}`;
                    } else if (toolCall.status === 'cancelled' && 'response' in toolCall) {
                      const cancelMsg = toolCall.response.error?.message || 'Tool execution cancelled';
                      toolResponseContent = `Tool cancelled: ${cancelMsg}`;
                    } else {
                      toolResponseContent = 'Unknown tool status';
                    }

                    // Create tool response message
                    const toolResponseMessage = this.createToolResponseMessage(
                      toolResponseContent,
                      toolCall.request.callId,
                      toolCall.request.name
                    );

                    executedToolResponses.push(toolResponseMessage);

                    console.log(`[MultiModelSystem] Collected tool response for ${toolCall.request.name} (status: ${toolCall.status})`);
                  }
                }
              },

              // All tools completed
              onAllToolCallsComplete: async (completedToolCalls) => {
                this.activeToolScheduler = undefined;
                console.log(`[MultiModelSystem] All ${completedToolCalls.length} tool calls completed`);
                resolve();
              }
            });

            // Save reference to active scheduler for approval mode changes
            this.activeToolScheduler = scheduler;

            // Check for abort
            if (signal.aborted) {
              console.warn(`[MultiModelSystem] Aborted before tool execution.`);
              resolve();
              return;
            }

            // Schedule all tools at once - they will execute in parallel
            scheduler.schedule(toolCallRequests, signal)
              .catch((error) => {
                console.error(`[MultiModelSystem] Scheduler error:`, error);
                reject(error);
              });
          });

          // Now yield all collected results
          for (const toolResponseMessage of executedToolResponses) {
            const toolCallId = toolResponseMessage.tool_call_id || '';
            const toolName = toolResponseMessage.name || '';
            const content = typeof toolResponseMessage.content === 'string'
              ? toolResponseMessage.content
              : JSON.stringify(toolResponseMessage.content);

            yield {
              type: 'tool_response',
              content,
              toolCallId,
              toolName,
              toolSuccess: !content.includes('failed') && !content.includes('cancelled'),
              toolResponseData: undefined
            };
          }
        } else {
          // Fallback: parallel execution without confirmation using Promise.allSettled
          const executionPromises = toolCallRequests.map(async (requestInfo) => {
            try {
              const toolResponse = await executeToolCall(this.config, requestInfo, signal);
              return { requestInfo, toolResponse, success: !toolResponse.error };
            } catch (error) {
              return {
                requestInfo,
                toolResponse: {
                  callId: requestInfo.callId,
                  responseParts: [],
                  error: error instanceof Error ? error : new Error(String(error)),
                  errorType: undefined,
                  resultDisplay: undefined,
                  structuredData: undefined
                } as ToolCallResponseInfo,
                success: false
              };
            }
          });

          const results = await Promise.allSettled(executionPromises);

          // Process results as they become available
          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              const { requestInfo, toolResponse, success } = result.value;

              let toolResponseContent: string;

              if (toolResponse.error) {
                toolResponseContent = `Tool execution failed: ${toolResponse.error.message || toolResponse.error}`;
              } else if (toolResponse.responseParts && toolResponse.responseParts.length > 0) {
                const responsePart = toolResponse.responseParts[0];

                if ('text' in responsePart) {
                  toolResponseContent = responsePart.text || '';
                } else if ('functionResponse' in responsePart && responsePart.functionResponse) {
                  const response = responsePart.functionResponse.response;
                  if (response && typeof response === 'object') {
                    if ('output' in response && response['output']) {
                      toolResponseContent = response['output'] as string;
                    } else {
                      toolResponseContent = JSON.stringify(response, null, 2);
                    }
                  } else {
                    toolResponseContent = JSON.stringify(response, null, 2);
                  }
                } else if ('inlineData' in responsePart && responsePart.inlineData?.data) {
                  toolResponseContent = `[Tool returned file data: ${responsePart.inlineData.mimeType}]`;
                } else {
                  toolResponseContent = '[Tool response data]';
                }
              } else {
                toolResponseContent = 'Tool executed successfully';
              }

              const toolResponseMessage = this.createToolResponseMessage(
                toolResponseContent,
                requestInfo.callId,
                requestInfo.name
              );

              executedToolResponses.push(toolResponseMessage);

              yield {
                type: 'tool_response',
                content: toolResponseContent,
                toolCallId: requestInfo.callId,
                toolName: requestInfo.name,
                toolSuccess: success,
                toolResponseData: toolResponse.structuredData
              };
            }
          }
        }

        // All tool calls completed - save assistant message with executed tool calls and responses together
        this.saveAssistantWithToolCalls(assistantContent, assistantToolCalls, executedToolResponses);
        console.log(`[MultiModelSystem] Tool execution completed for ${toolCallRequests.length} tools. Continuing conversation...`);
        
        // Continue the conversation loop to let LLM process tool responses naturally
        continue;
      }
      else {
        // No tool calls - save assistant message immediately if there's content
        if (assistantContent.trim()) {
          const assistantMessage: UniversalMessage = {
            role: 'assistant',
            content: assistantContent,
            timestamp: new Date()
          };
          SessionManager.getInstance().addHistory(assistantMessage);
          console.log(`[MultiModelSystem] Saved assistant response without tool calls (${assistantContent.length} chars)`);
        }

        // Check if model should continue

        // Check if we should skip next speaker check
        const skipNextSpeakerCheck = this.config.getSkipNextSpeakerCheck ? this.config.getSkipNextSpeakerCheck() : false;

        // Limit continuation depth to prevent infinite recursion
        const MAX_CONTINUATION_DEPTH = 10;

        if (!skipNextSpeakerCheck && assistantContent.trim() && continuationDepth < MAX_CONTINUATION_DEPTH) {
          try {
            // Perform next speaker check
            const allMessages = SessionManager.getInstance().getHistory();
            const nextSpeakerResult = await checkNextSpeaker(
              [...allMessages], // Create a mutable copy
              this.currentProvider?.type || 'gemini',
              async (checkMessages, checkModel) => {
                // Use dedicated utility provider for the check
                const providerType = this.currentProvider?.type || 'gemini';
                const utilityModel = checkModel || 'gemini-2.5-flash'; // Default to Flash for checks

                // Get or create a dedicated utility provider
                const utilityProvider = await this.getOrCreateUtilityProvider(providerType as ModelProviderType, utilityModel);

                // Send check message using utility provider
                const response = await utilityProvider.sendMessage(
                  checkMessages,
                  signal
                );
                return response.content;
              }
            );

            console.log('[MultiModelSystem] Next speaker check result:', nextSpeakerResult);

            if (nextSpeakerResult && nextSpeakerResult.next_speaker === 'model') {
              // Model should continue, send "Please continue." message
              console.log('[MultiModelSystem] Model should continue, sending continuation prompt (depth:', continuationDepth, ')');

              const continueMessage: UniversalMessage = {
                role: 'user',
                content: 'Please continue.'
              };

              // DO NOT add to session history to avoid polluting the conversation
              // SessionManager.getInstance().addHistory(continueMessage);

              // Recursively call to continue conversation (increment depth)
              // Pass the continue message directly without adding to permanent history
              yield* this.sendMessageStream([continueMessage], signal, roleId, continuationDepth + 1);
              return;
            }
          } catch (error) {
            console.warn('[MultiModelSystem] Next speaker check failed:', error);
            // If check fails, default to waiting for user input
          }
        } else if (continuationDepth >= MAX_CONTINUATION_DEPTH) {
          console.warn(`[MultiModelSystem] Reached max continuation depth (${MAX_CONTINUATION_DEPTH}), stopping continuation`);
        }

        // Generate title if appropriate
        if (assistantContent.trim()) {
          const currentSessionId = SessionManager.getInstance().getCurrentSessionId();
          if (currentSessionId) {
            this.generateIntelligentTitle(currentSessionId).catch(error => {
              console.error('[MultiModelSystem] Failed to generate title:', error);
            });
          }
        }

        return;
      }
    }
  }

  /**
   * Generate intelligent title using current provider (no new provider creation)
   */
  private async generateIntelligentTitle(sessionId: string): Promise<void> {
    if (!this.currentProvider) {
      return;
    }

    try {
      const sessionManager = SessionManager.getInstance();

      // Get display messages for the session (exclude tool messages)
      const displayMessages = sessionManager.getDisplayMessages(sessionId).filter(msg =>
        msg.role !== 'tool' &&
        !msg.content.startsWith('Tool response:') &&
        !msg.content.startsWith('Tool execution completed successfully')
      );

      // Only generate when user has exactly 3 messages (after 3rd message is sent)
      const userMessages = displayMessages.filter(msg => msg.role === 'user');
      if (userMessages.length !== 3) {
        return;
      }

      // Create a conversation summary prompt
      const conversationText = displayMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const titlePrompt = `Based on this conversation, generate a short, descriptive title (max 40 characters). Only respond with the title, no explanation:

${conversationText}

Title:`;

      // Use current provider instance to generate title
      const provider = await this.getOrCreateProvider(this.currentProvider);

      const titleResponse = await provider.sendMessage(
        [{ role: 'user', content: titlePrompt }],
        new AbortController().signal
      );

      const generatedTitle = titleResponse.content.trim().replace(/^["']|["']$/g, ''); // Remove quotes if any

      // Validate and clean the generated title
      if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= 50) {
        console.log(`[MultiModelSystem] Generated title for session ${sessionId}: ${generatedTitle}`);
        sessionManager.updateSessionTitle(sessionId, generatedTitle);
      }
    } catch (error) {
      console.error('[MultiModelSystem] Title generation failed:', error);
    }
  }

  async getConnectionStatus(): Promise<ConnectionStatus[]> {
    const configs = this.configManager.getAllProviderConfigs();
    const statuses: ConnectionStatus[] = [];
    
    for (const config of configs) {
      try {
        const provider = await this.getOrCreateProvider(config);
        const status = await provider.getConnectionStatus();
        statuses.push({
          ...status,
          error: status.error || `Provider: ${config.type}`
        });
      } catch (error) {
        statuses.push({
          status: 'error',
          lastChecked: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return statuses;
  }

  async getAvailableModels(providerType?: ModelProviderType): Promise<Record<string, string[]>> {
    const configs = providerType 
      ? [this.configManager.getProviderConfig(providerType)].filter(Boolean)
      : this.configManager.getAllProviderConfigs();
    
    const modelsByProvider: Record<string, string[]> = {};
    
    // Import provider classes for static method access
    const { OpenAIProvider } = await import('../providers/OpenAIProvider.js');
    const { GeminiProvider } = await import('../providers/GeminiProvider.js');
    const { LMStudioProvider } = await import('../providers/LMStudioProvider.js');
    
    for (const config of configs) {
      try {
        let models: string[] = [];
        
        // Route to static provider methods with authentication
        switch (config!.type) {
          case 'openai':
            models = await OpenAIProvider.getAvailableModels();
            break;
          case 'gemini':
            models = await GeminiProvider.getAvailableModels();
            break;
          case 'lm_studio':
            models = await LMStudioProvider.getAvailableModels(config!.baseUrl);
            break;
          default:
            throw new Error(`Unknown provider type: ${config!.type}`);
        }
        
        modelsByProvider[config!.type] = models;
      } catch (error) {
        // Set empty array for failed providers, but continue with others
        modelsByProvider[config!.type] = [];
        console.error(`Failed to fetch models for provider ${config!.type}:`, error);
      }
    }
    
    return modelsByProvider;
  }

  getCurrentProvider(): ModelProviderConfig | null {
    return this.currentProvider;
  }

  getAllProviders(): ModelProviderConfig[] {
    return this.configManager.getAllProviderConfigs();
  }

  getSupportedProviders(): ModelProviderType[] {
    return ModelProviderFactory.getSupportedProviders();
  }

  /**
   * Get the current config instance
   */
  getConfig(): Config {
    return this.config;
  }

  getApprovalMode(): 'default' | 'autoEdit' | 'yolo' {
    const mode = this.config.getApprovalMode();
    // Map ApprovalMode enum to string literals
    switch (mode) {
      case ApprovalMode.DEFAULT:
        return 'default';
      case ApprovalMode.AUTO_EDIT:  
        return 'autoEdit';
      case ApprovalMode.YOLO:
        return 'yolo';
      default:
        return 'default';
    }
  }

  setApprovalMode(mode: 'default' | 'autoEdit' | 'yolo'): void {
    // Map string literals to ApprovalMode enum
    let approvalModeValue: ApprovalMode;
    switch (mode) {
      case 'default':
        approvalModeValue = ApprovalMode.DEFAULT;
        break;
      case 'autoEdit':
        approvalModeValue = ApprovalMode.AUTO_EDIT;
        break;
      case 'yolo':
        approvalModeValue = ApprovalMode.YOLO;
        break;
      default:
        approvalModeValue = ApprovalMode.DEFAULT;
        break;
    }

    const previousMode = this.config.getApprovalMode();
    this.config.setApprovalMode(approvalModeValue);

    // If we have an active tool scheduler and approval mode changed to more permissive,
    // re-evaluate pending tools that might now be auto-approved
    if (this.activeToolScheduler && approvalModeValue !== previousMode) {
      const signal = new AbortController().signal;
      this.activeToolScheduler.reevaluateAllPendingTools(signal).catch((error) => {
        console.error('Error reevaluating pending tools after approval mode change:', error);
      });
    }
  }

  private getProviderKey(config: ModelProviderConfig): string {
    return `${config.type}-${config.model}-${config.baseUrl || 'default'}`;
  }

  private async getOrCreateProvider(config: ModelProviderConfig): Promise<BaseModelProvider> {
    const key = this.getProviderKey(config);

    if (this.initializedProviders.has(key)) {
      const cachedProvider = this.initializedProviders.get(key)!;
      // Update config in case it changed
      cachedProvider.updateConfig(config);
      return cachedProvider;
    }

    // Create new provider and initialize it
    const provider = ModelProviderFactory.create(config, this.config);
    await provider.initialize();

    // Cache the initialized provider
    this.initializedProviders.set(key, provider);
    console.log(`[MultiModelSystem] Created and initialized provider: ${config.type}-${config.model}`);

    return provider;
  }

  private async getOrCreateUtilityProvider(providerType: ModelProviderType, utilityModel: string): Promise<BaseModelProvider> {
    const key = `${providerType}-${utilityModel}-utility`;

    if (this.utilityProviders.has(key)) {
      return this.utilityProviders.get(key)!;
    }

    // Create utility provider config with same auth settings
    const utilityConfig: ModelProviderConfig = {
      type: providerType,
      model: utilityModel,
      // Use same auth settings as current provider if available
      baseUrl: this.currentProvider?.baseUrl,
      apiKey: this.currentProvider?.apiKey
    };

    // Create new provider and initialize it
    const provider = ModelProviderFactory.create(utilityConfig, this.config);
    await provider.initialize();

    // Update provider with optimized settings for utility tasks
    // Note: These settings may vary by provider implementation
    provider.updateConfig({
      ...utilityConfig,
      additionalConfig: {
        temperature: 0,  // Deterministic responses
        maxOutputTokens: 500,  // Small response expected
        systemPrompt: ''  // No system prompt needed
      }
    });

    // Cache the utility provider
    this.utilityProviders.set(key, provider);
    console.log(`[MultiModelSystem] Created utility provider: ${providerType}-${utilityModel}`);

    return provider;
  }

  async switchProvider(config: ModelProviderConfig): Promise<void> {
    if (!config.type) {
      throw new Error('Provider type is required');
    }

    if (!config.model) {
      throw new Error('Model is required');
    }


    // Ensure the provider is initialized before switching
    await this.getOrCreateProvider(config);

    this.configManager.setProviderConfig(config);
    this.currentProvider = config;

    // Update global active provider config for subagents to inherit
    globalActiveProviderConfig = config;

    // Set tools for the new provider
    await this.setProviderTools();
  }

  async switchRole(roleId: string): Promise<boolean> {
    const success = await RoleManager.getInstance().setCurrentRole(roleId);

    // Set tools for the current provider based on the new role
    if (success) {
      await this.setProviderTools();
    }
    
    return success;
  }

  private async setProviderTools(): Promise<void> {
    if (!this.currentProvider) {
      return;
    }
    
    try {
      const provider = await this.getOrCreateProvider(this.currentProvider);
      provider.setTools();
      console.log(`[MultiModelSystem] Tools set for provider: ${this.currentProvider.type}`);
    } catch (error) {
      console.error(`[MultiModelSystem] Failed to set tools for provider: ${this.currentProvider.type}`, error);
    }
  }


  /**
   * Compress conversation history when token usage approaches provider limits or turn count exceeds threshold
   */
  private async tryCompressChat(
    provider: BaseModelProvider,
    sessionManager: SessionManager,
    currentHistory: readonly UniversalMessage[],
    force: boolean = false
  ): Promise<ChatCompressionInfo> {
    const historyArray = [...currentHistory];

    console.log(`[MultiModelSystem] tryCompressChat called: force=${force}, history.length=${historyArray.length}`);

    // Don't do anything if the history is empty
    if (historyArray.length === 0) {
      console.log(`[MultiModelSystem] Compression skipped: empty history`);
      return {
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.NOOP,
      };
    }

    // Count conversation turns (user messages)
    const conversationMessages = historyArray.filter(m => m.role !== 'system');
    const userTurns = conversationMessages.filter(m => m.role === 'user').length;
    const TURN_COMPRESSION_THRESHOLD = 25; // Compress after 25 user turns

    console.log(`[MultiModelSystem] Turn count check: ${userTurns} user turns vs ${TURN_COMPRESSION_THRESHOLD} threshold`);

    // Get provider capabilities to determine max tokens
    const capabilities = provider.getCapabilityInfo();
    const tokenLimit = capabilities?.maxTokens || 10000;

    // Fast pre-check: Estimate character count to avoid unnecessary token counting API calls
    // Only call expensive token counting if we might actually need compression
    if (!force) {
      // Rough estimation: 1 token ≈ 4 characters for English text
      const CHARS_PER_TOKEN = 4;
      const totalChars = historyArray.reduce((sum, msg) => sum + msg.content.length, 0);

      const estimatedTokens = totalChars / CHARS_PER_TOKEN;
      const tokenThreshold = COMPRESSION_TOKEN_THRESHOLD;
      const thresholdTokens = tokenThreshold * tokenLimit;

      // Early exit: If estimated tokens are well below threshold AND turns are low, skip compression
      // Use 0.9 factor to be conservative (only skip if clearly unnecessary)
      if (estimatedTokens < thresholdTokens * 0.9 && userTurns < TURN_COMPRESSION_THRESHOLD) {
        console.log(`[MultiModelSystem] Compression skipped: estimated ${estimatedTokens.toFixed(0)} tokens (${totalChars} chars) < ${(thresholdTokens * 0.9).toFixed(0)} threshold, ${userTurns} turns < ${TURN_COMPRESSION_THRESHOLD}`);
        return {
          originalTokenCount: Math.round(estimatedTokens),
          newTokenCount: Math.round(estimatedTokens),
          compressionStatus: CompressionStatus.NOOP,
        };
      }

      console.log(`[MultiModelSystem] Estimated ${estimatedTokens.toFixed(0)} tokens (${totalChars} chars), may need compression, doing precise token count...`);
    }

    // Calculate precise token count using provider's countTokens method
    // Only called when compression might be needed
    let originalTokenCount = 0;
    try {
      if (provider.countTokens) {
        const tokenResult = await provider.countTokens(historyArray);
        originalTokenCount = tokenResult.totalTokens;
      } else {
        console.warn(`[MultiModelSystem] Provider does not support token counting, skipping compression`);
        return {
          originalTokenCount: 0,
          newTokenCount: 0,
          compressionStatus: CompressionStatus.NOOP,
        };
      }
    } catch (error) {
      console.warn(`[MultiModelSystem] Token counting failed:`, error);
      return {
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      };
    }

    if (originalTokenCount === 0) {
      console.warn(`[MultiModelSystem] Could not determine token count for compression.`);
      return {
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      };
    }

    // Check both token limit and turn count for compression triggers
    let compressionNeeded = false;
    let compressionReason = '';

    if (!force) {
      const tokenThreshold = COMPRESSION_TOKEN_THRESHOLD;
      const thresholdTokens = tokenThreshold * tokenLimit;
      // console.log(`[MultiModelSystem] Compression check: ${originalTokenCount} tokens vs ${thresholdTokens} threshold (${tokenThreshold} * ${tokenLimit})`);
      
      // Check token threshold
      if (originalTokenCount >= thresholdTokens) {
        compressionNeeded = true;
        compressionReason = `token limit (${originalTokenCount} >= ${thresholdTokens})`;
      }
      
      // Check turn threshold
      if (userTurns >= TURN_COMPRESSION_THRESHOLD) {
        compressionNeeded = true;
        if (compressionReason) {
          compressionReason += ` and turn limit (${userTurns} >= ${TURN_COMPRESSION_THRESHOLD})`;
        } else {
          compressionReason = `turn limit (${userTurns} >= ${TURN_COMPRESSION_THRESHOLD})`;
        }
      }
      
      if (!compressionNeeded) {
        // console.log(`[MultiModelSystem] No compression needed: ${originalTokenCount} < ${thresholdTokens} tokens and ${userTurns} < ${TURN_COMPRESSION_THRESHOLD} turns`);
        return {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          compressionStatus: CompressionStatus.NOOP,
        };
      }
      
      console.log(`[MultiModelSystem] Compression triggered by ${compressionReason}`);
    } else {
      compressionReason = 'forced compression';
    }

    console.log(`[MultiModelSystem] Starting compression. Original tokens: ${originalTokenCount}, limit: ${tokenLimit}`);

    // Find split point - compress early messages, keep recent ones
    let compressBeforeIndex = this.findIndexAfterFraction(
      historyArray,
      1 - COMPRESSION_PRESERVE_THRESHOLD,
    );

    // Ensure we don't split in the middle of tool call/response pairs
    const pendingToolCalls: string[] = [];

    // Scan backwards from the split point to find any incomplete tool calls
    for (let i = compressBeforeIndex - 1; i >= 0; i--) {
      const msg = historyArray[i];

      if (msg.role === 'tool' && msg.tool_call_id) {
        // Found a tool response, add to pending list
        pendingToolCalls.push(msg.tool_call_id);
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Found tool calls, remove matched ones from pending
        for (const toolCall of msg.toolCalls) {
          const idx = pendingToolCalls.indexOf(toolCall.id);
          if (idx !== -1) {
            pendingToolCalls.splice(idx, 1);
          }
        }
      }
    }

    // If we have unmatched tool responses before the split, move split point earlier
    // to include the complete tool call/response sequence
    if (pendingToolCalls.length > 0) {
      console.log(`[MultiModelSystem] Found ${pendingToolCalls.length} incomplete tool calls at split point, adjusting...`);

      // Find the assistant message that initiated these tool calls
      for (let i = compressBeforeIndex - 1; i >= 0; i--) {
        const msg = historyArray[i];
        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
          const hasMatchingCall = msg.toolCalls.some(tc => pendingToolCalls.includes(tc.id));
          if (hasMatchingCall) {
            // Move split point to before this assistant message
            compressBeforeIndex = i;
            console.log(`[MultiModelSystem] Moved split point to index ${i} to preserve tool call integrity`);
            break;
          }
        }
      }
    }

    // Find the first user message after the index to maintain conversation flow
    while (
      compressBeforeIndex < historyArray.length &&
      historyArray[compressBeforeIndex]?.role === 'assistant'
    ) {
      compressBeforeIndex++;
    }

    const historyToCompress = historyArray.slice(0, compressBeforeIndex);
    const historyToKeep = historyArray.slice(compressBeforeIndex);

    if (historyToCompress.length === 0) {
      console.log(`[MultiModelSystem] No history to compress`);
      return {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      };
    }

    console.log(`[MultiModelSystem] Compressing ${historyToCompress.length} messages, keeping ${historyToKeep.length} messages`);

    try {
      // Create compression request - filter system messages from history to compress
      const filteredHistoryToCompress = historyToCompress.filter(msg => msg.role !== 'system');
      
      const compressionMessages: UniversalMessage[] = [
        {
          role: 'system',
          content: getCompressionPrompt(),
        },
        ...filteredHistoryToCompress,
        {
          role: 'user',
          content: 'First, reason in your scratchpad. Then, generate the <state_snapshot>.',
        }
      ];

      // Get compression summary using provider directly (avoid recursion and tools)
      const response = await provider.sendCompressionMessage(compressionMessages, new AbortController().signal);

      // Extract only the state_snapshot part from the response
      const stateSnapshotMatch = response.content.match(/<state_snapshot>([\s\S]*?)<\/state_snapshot>/);
      const summary = stateSnapshotMatch
        ? `<state_snapshot>${stateSnapshotMatch[1]}</state_snapshot>`
        : response.content; // fallback to full content if no state_snapshot found

      // Create new compressed history - DO NOT preserve old system messages
      // Let enhanceMessagesWithRole generate fresh system messages with current role/tools
      const keptMessages = historyToKeep.filter(msg => msg.role !== 'system');
      
      const newHistory: UniversalMessage[] = [
        {
          role: 'user',
          content: summary,
        },
        {
          role: 'assistant',
          content: 'Got it. Thanks for the additional context!',
        },
        ...keptMessages
      ];
      
      // Fix function call/response balance to prevent 400 errors
      const balancedHistory = this.fixFunctionCallResponseBalance(newHistory);

      // Update SessionManager with compressed and balanced history
      sessionManager.setHistory(balancedHistory);
      console.log(`[MultiModelSystem] Updated SessionManager with compressed history (${balancedHistory.length} messages, balanced function calls)`);

      // Calculate new token count
      let newTokenCount = 0;
      try {
        const tokenResult = await provider.countTokens(balancedHistory);
        newTokenCount = tokenResult.totalTokens;
      } catch (error) {
        console.warn('[MultiModelSystem] Could not determine compressed history token count:', error);
        // Revert to original history
        sessionManager.setHistory(historyArray);
        return {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          compressionStatus: CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
        };
      }

      if (newTokenCount === 0) {
        console.warn('[MultiModelSystem] Could not determine compressed history token count.');
        // Revert to original history
        sessionManager.setHistory(historyArray);
        return {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          compressionStatus: CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
        };
      }

      // Check if compression actually reduced token count
      if (newTokenCount > originalTokenCount) {
        console.warn(`[MultiModelSystem] Compression failed - tokens increased from ${originalTokenCount} to ${newTokenCount}`);
        // Revert to original history
        sessionManager.setHistory(historyArray);
        return {
          originalTokenCount,
          newTokenCount,
          compressionStatus: CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        };
      }

      console.log(`[MultiModelSystem] Compression successful. Tokens: ${originalTokenCount} -> ${newTokenCount}`);
      return {
        originalTokenCount,
        newTokenCount,
        compressionStatus: CompressionStatus.COMPRESSED,
      };

    } catch (error) {
      console.error('[MultiModelSystem] Compression failed:', error);
      return {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      };
    }
  }

  /**
   * Save assistant message together with executed tool calls and their responses
   * This ensures tool calls and responses are always paired correctly
   */
  private saveAssistantWithToolCalls(
    assistantContent: string,
    allToolCalls: ToolCall[],
    executedToolResponses: UniversalMessage[]
  ): void {
    const sessionManager = SessionManager.getInstance();

    // Build set of executed tool call IDs from responses
    const executedToolCallIds = new Set(
      executedToolResponses
        .map(r => r.tool_call_id)
        .filter((id): id is string => id !== undefined)
    );

    // Only keep tool calls that have corresponding responses
    const executedToolCalls = allToolCalls.filter(tc =>
      executedToolCallIds.has(tc.id)
    );

    console.log(`[MultiModelSystem] Saving assistant message: ${allToolCalls.length} total tool calls, ${executedToolCalls.length} executed, ${executedToolResponses.length} responses`);

    // Save assistant message with only executed tool calls
    const assistantMessage: UniversalMessage = {
      role: 'assistant',
      content: assistantContent,
      timestamp: new Date()
    };

    if (executedToolCalls.length > 0) {
      assistantMessage.toolCalls = executedToolCalls;
    }

    sessionManager.addHistory(assistantMessage);

    // Save all tool responses
    executedToolResponses.forEach(response => {
      sessionManager.addHistory(response);
    });

    console.log(`[MultiModelSystem] Saved assistant message with ${executedToolCalls.length} tool calls and ${executedToolResponses.length} responses`);
  }

  /**
   * Fix function call/response balance to prevent Gemini API 400 errors
   */
  private fixFunctionCallResponseBalance(history: UniversalMessage[]): UniversalMessage[] {
    const balancedHistory: UniversalMessage[] = [];
    let pendingToolCalls: ToolCall[] = [];
    
    for (const message of history) {
      if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
        // Assistant message with tool calls
        balancedHistory.push(message);
        pendingToolCalls.push(...message.toolCalls);
      } else if (message.role === 'tool' && message.tool_call_id) {
        // Tool response - check if it matches any pending tool call
        const matchingCallIndex = pendingToolCalls.findIndex(call => call.id === message.tool_call_id);
        if (matchingCallIndex !== -1) {
          // Found matching tool call, add response and remove from pending
          balancedHistory.push(message);
          pendingToolCalls.splice(matchingCallIndex, 1);
        } else {
          // Orphaned tool response, skip it to maintain balance
          console.warn(`[MultiModelSystem] Skipping orphaned tool response: ${message.tool_call_id}`);
        }
      } else {
        // Regular message (user, assistant without tool calls, system)
        // If we have pending tool calls, this breaks the chain - remove them
        if (pendingToolCalls.length > 0) {
          console.warn(`[MultiModelSystem] Removing ${pendingToolCalls.length} unmatched tool calls before non-tool message`);
          pendingToolCalls = [];
        }
        balancedHistory.push(message);
      }
    }
    
    // If we end with pending tool calls, remove the assistant message that created them
    if (pendingToolCalls.length > 0) {
      console.warn(`[MultiModelSystem] Removing final assistant message with ${pendingToolCalls.length} unmatched tool calls`);
      // Find and remove the last assistant message with tool calls
      for (let i = balancedHistory.length - 1; i >= 0; i--) {
        const msg = balancedHistory[i];
        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
          balancedHistory.splice(i, 1);
          break;
        }
      }
    }
    
    console.log(`[MultiModelSystem] Function call balance fixed: ${history.length} -> ${balancedHistory.length} messages`);
    return balancedHistory;
  }

  /**
   * Returns the index of the message after the fraction of the total characters in the history.
   */
   private findIndexAfterFraction(
    history: UniversalMessage[],
    fraction: number,
  ): number {
    if (fraction <= 0 || fraction >= 1) {
      throw new Error('Fraction must be between 0 and 1');
    }

    const messageLengths = history.map(
      (message) => JSON.stringify(message).length,
    );

    const totalCharacters = messageLengths.reduce(
      (sum, length) => sum + length,
      0,
    );
    const targetCharacters = totalCharacters * fraction;

    let charactersSoFar = 0;
    for (let i = 0; i < messageLengths.length; i++) {
      charactersSoFar += messageLengths[i];
      if (charactersSoFar >= targetCharacters) {
        return i;
      }
    }
    return messageLengths.length;
  }

  private async enhanceMessagesWithRole(
    messages: UniversalMessage[],
    roleId?: string
  ): Promise<UniversalMessage[]> {
    // First limit context size to keep recent turns only
    // const limitedMessages = this.limitContextSize(messages);
    const limitedMessages = messages; // Disable context limiting for now
    
    const systemMessages = limitedMessages.filter(m => m.role === 'system');
    const otherMessages = limitedMessages.filter(m => m.role !== 'system');
    
    const userMemory = systemMessages.find(m => m.content.includes('# User Memory'))?.content;
    const additionalInstructions = systemMessages.find(m => 
      m.content.includes('# Additional Instructions')
    )?.content;
    
    // Get current workspace context
    const workspaceContext = await this.workspaceManager.getEnvironmentContext();
    const workspaceContextText = workspaceContext.map(part => 
      typeof part === 'object' && 'text' in part ? part.text : ''
    ).join('\n');
    
    // Combine role prompt with workspace context
    const roleSystemPrompt = RoleManager.getInstance().getRoleAwareSystemPrompt(
      userMemory,
      roleId,
      additionalInstructions
    );
    
    const enhancedSystemMessage: UniversalMessage = {
      role: 'system',
      content: `${roleSystemPrompt}\n\n${workspaceContextText}`
    };
    
    return [enhancedSystemMessage, ...otherMessages];
  }

  /**
   * Cleanup all cached providers
   */
  cleanup(): void {
    console.log('[MultiModelSystem] Cleaning up providers...');

    // Clear main providers cache
    this.initializedProviders.clear();

    // Clear utility providers cache
    this.utilityProviders.clear();

    console.log('[MultiModelSystem] All providers cleaned up');
  }

  /**
   * Gets the first-level contents of a directory (files and subdirectories).
   * @param directoryPath The absolute path to the directory
   * @returns Promise resolving to an array of directory items
   */
  async getDirectoryContents(directoryPath: string): Promise<Array<{
    name: string;
    path: string;
    type: 'file' | 'folder';
    size?: number;
    modified?: Date;
  }>> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    try {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });
      const items = [];

      for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry.name);

        try {
          if (entry.isDirectory()) {
            items.push({
              name: entry.name,
              path: fullPath,
              type: 'folder' as const
            });
          } else if (entry.isFile()) {
            // Get file stats for additional info
            const stats = await fs.stat(fullPath);
            items.push({
              name: entry.name,
              path: fullPath,
              type: 'file' as const,
              size: stats.size,
              modified: stats.mtime
            });
          }
        } catch (error) {
          // Skip files/folders we can't access
          console.warn(`Cannot access ${fullPath}:`, error);
        }
      }

      // Sort: folders first, then files, alphabetically within each group
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return items;
    } catch (error) {
      console.error(`Failed to read directory ${directoryPath}:`, error);
      return [];
    }
  }
}