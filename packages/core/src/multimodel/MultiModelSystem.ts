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
// import { findIndexAfterFraction } from '../core/client.js';

// Compression constants (same as Gemini client)
const COMPRESSION_TOKEN_THRESHOLD = 0.7; // Compress when token usage reaches 70% of limit
const COMPRESSION_PRESERVE_THRESHOLD = 0.3; // Keep last 30% of conversation

export class MultiModelSystem {
  private configManager: ProviderConfigManager;
  private workspaceManager: WorkspaceManager;
  private currentProvider: ModelProviderConfig | null = null;
  private config: Config;
  private initializedProviders: Map<string, BaseModelProvider> = new Map();
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
        content: content,
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
  
  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal,
    roleId?: string
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
      sessionManager.handleAutoTitleGeneration(msg);
    });

    const provider = await this.getOrCreateProvider(this.currentProvider!);

    // Add intelligent duplicate detection and safety limits
    let turnCount = 0;
    const MAX_TURNS = 100; // Hard safety limit to prevent any infinite loops
    const MAX_DUPLICATE_CALLS = this.config.getMaxSessionTurns() >= 0 ? this.config.getMaxSessionTurns() : 20;
    
    // Track tool call history for duplicate detection
    const toolCallHistory: Array<{ name: string; args: any; timestamp: number }> = [];
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
      
      // Check if we need to compress before processing (like Gemini client does)
      const compressionResult = await this.tryCompressChat(provider, sessionManager, fullHistory);
      if (compressionResult.compressionStatus === CompressionStatus.COMPRESSED) {
        console.log(`[MultiModelSystem] Chat compressed: ${compressionResult.originalTokenCount} -> ${compressionResult.newTokenCount} tokens`);
        
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
      const limitedMessages = this.limitContextSize(currentHistory);
      console.log(`[MultiModelSystem] Turn ${turnCount}: Using ${limitedMessages.length}/${currentHistory.length} messages after context limiting`);
      
      // Debug: Print last few messages to see tool responses
      const lastFewMessages = limitedMessages.slice(-3);
      console.log('[MultiModelSystem] Last 3 messages in history:');
      lastFewMessages.forEach((msg, idx) => {
        console.log(`  [${idx}] ${msg.role}: ${msg.content?.substring(0, 100)}...${msg.toolCalls ? ` [${msg.toolCalls.length} tool calls]` : ''}`);
      });

      // Enhance messages with system prompt, role and workspace context
      const enhancedMessages = await this.enhanceMessagesWithRole(limitedMessages, roleId);
      
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
          // Save assistant response to history when stream completes
          if (assistantContent.trim() || assistantToolCalls.length > 0) {
            const assistantMessage: UniversalMessage = {
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date()
            };
            
            // Include tool calls if any were made
            if (assistantToolCalls.length > 0) {
              assistantMessage.toolCalls = assistantToolCalls;
            }
            
            SessionManager.getInstance().addHistory(assistantMessage);
            console.log(`[MultiModelSystem] Saved assistant response to history (${assistantContent.length} chars, ${assistantToolCalls.length} tool calls)`);
          }
          yield event;
        } else if (event.type === 'error') {
          // Log error and clean up collected data
          const errorMessage = event.error?.message || 'Unknown error';
          console.error(`[MultiModelSystem] Provider error: ${errorMessage}`);
          if (event.error?.stack) {
            console.error(`[MultiModelSystem] Error stack: ${event.error.stack}`);
          }
          
          // Clear collected data since stream failed
          if (toolCallRequests.length > 0) {
            console.warn(`[MultiModelSystem] Discarding ${toolCallRequests.length} tool call(s) due to error`);
            toolCallRequests.length = 0;
          }
          if (assistantToolCalls.length > 0) {
            console.warn(`[MultiModelSystem] Discarding ${assistantToolCalls.length} assistant tool call(s) due to error`);
            assistantToolCalls.length = 0;
          }
          if (assistantContent.trim()) {
            console.warn(`[MultiModelSystem] Discarding ${assistantContent.length} chars of assistant content due to error`);
            assistantContent = '';
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
        
        // Execute each tool call and create individual tool response messages
        for (const requestInfo of toolCallRequests) {
          try {
            let toolResponse;
            
            // Use CoreToolScheduler with confirmation support if handler is available
            if (this.toolConfirmationHandler) {
              toolResponse = await new Promise<ToolCallResponseInfo>((resolve, reject) => {
                const scheduler = new CoreToolScheduler({
                  config: this.config,
                  getPreferredEditor: () => undefined,
                  onEditorClose: () => {},
                  onAllToolCallsComplete: async (completedToolCalls) => {
                    // Clear reference when tool calls are complete
                    this.activeToolScheduler = undefined;
                    resolve(completedToolCalls[0].response);
                  },
                  // Pass the confirmation handler from GUI
                  onToolCallsUpdate: async (toolCallsUpdate) => {
                    if (toolCallsUpdate.some(tc => tc.status === 'awaiting_approval')) {
                      const waitingCall = toolCallsUpdate.find(tc => tc.status === 'awaiting_approval');
                      if (waitingCall && 'confirmationDetails' in waitingCall && this.toolConfirmationHandler) {
                        // Call our confirmation handler to get user's decision
                        const outcome = await this.toolConfirmationHandler(waitingCall.confirmationDetails);
                        // Call the scheduler's onConfirm method with the outcome
                        await waitingCall.confirmationDetails.onConfirm(outcome);
                        return;
                      }
                    }
                  }
                });

                // Save reference to active scheduler for approval mode changes
                this.activeToolScheduler = scheduler;

                scheduler.schedule(requestInfo, signal)
                .catch(reject);
              });
            } else {
              // Fallback to non-interactive execution
              toolResponse = await executeToolCall(this.config, requestInfo, signal);
            }
            
            if (toolResponse.error) {
              console.error(`[MultiModelSystem] Tool call failed:`, toolResponse.error);
              
              // Create error response message to inform LLM about the failure
              const errorMessage = `Tool execution failed: ${toolResponse.error.message || toolResponse.error}`;
              const toolErrorMessage = this.createToolResponseMessage(
                errorMessage,
                requestInfo.callId,
                requestInfo.name
              );
              
              SessionManager.getInstance().addHistory(toolErrorMessage);
              console.log(`[MultiModelSystem] Added tool error response for ${requestInfo.name} (ID: ${requestInfo.callId}) to session history`);
              
              // Yield error response to frontend for immediate display
              yield {
                type: 'tool_response',
                content: errorMessage,
                toolCallId: requestInfo.callId,
                toolName: requestInfo.name,
                toolSuccess: false  // Indicate failure
              };
              
              // Continue with other tool calls instead of terminating
              continue;
            }
            
            // Process each response part for this specific tool call
            if (toolResponse.responseParts && toolResponse.responseParts.length > 0) {
              for (const responsePart of toolResponse.responseParts) {
                let toolResponseContent: string;
                
                // Convert Part to content string
                if ('text' in responsePart) {
                  toolResponseContent = responsePart.text || '';
                } else if ('functionResponse' in responsePart && responsePart.functionResponse) {
                  // Extract the actual tool result from functionResponse
                  const response = responsePart.functionResponse.response;
                  if (response && typeof response === 'object') {
                    // Check for 'output' field first (standard format)
                    if ('output' in response && response['output']) {
                      toolResponseContent = response['output'] as string;
                    } else {
                      // For tools like xlwings that don't use 'output' field, use full JSON
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
                
                // Create tool response message with appropriate format based on detected model type
                const toolResponseMessage = this.createToolResponseMessage(
                  toolResponseContent,
                  requestInfo.callId,
                  requestInfo.name
                );
                
                SessionManager.getInstance().addHistory(toolResponseMessage);
                console.log(`[MultiModelSystem] Added tool response for ${requestInfo.name} (ID: ${requestInfo.callId}) to session history`);
                
                // Yield tool response to frontend for immediate display
                yield {
                  type: 'tool_response',
                  content: toolResponseContent,
                  toolCallId: requestInfo.callId,
                  toolName: requestInfo.name,
                  toolSuccess: true,  // Indicate success
                  toolResponseData: toolResponse.structuredData  // Include structured data
                };
              }
            }
            
          } catch (error) {
            console.error(`[MultiModelSystem] Tool execution error:`, error);
            
            // Create error response message to inform LLM about the execution failure
            const errorMessage = `Tool execution error: ${error instanceof Error ? error.message : 'Unknown tool execution error'}`;
            const toolErrorMessage = this.createToolResponseMessage(
              errorMessage,
              requestInfo.callId,
              requestInfo.name
            );
            
            SessionManager.getInstance().addHistory(toolErrorMessage);
            console.log(`[MultiModelSystem] Added tool execution error for ${requestInfo.name} (ID: ${requestInfo.callId}) to session history`);
            
            // Yield error response to frontend for immediate display
            yield {
              type: 'tool_response',
              content: errorMessage,
              toolCallId: requestInfo.callId,
              toolName: requestInfo.name
            };
            
            // Continue with other tool calls instead of terminating
            continue;
          }
        }
        
        // After all tools are executed, let the natural conversation flow continue
        console.log(`[MultiModelSystem] Tool execution completed for ${toolCallRequests.length} tools. Continuing conversation...`);
        
        // Continue the conversation loop to let LLM process tool responses naturally
        continue;
      } 
      else {
        // No tool calls, conversation is complete
        // Add assistant's response to history
        if (assistantContent.trim()) {
          // Try to generate intelligent title if conditions are met
          const currentSessionId = SessionManager.getInstance().getCurrentSessionId();
          if (currentSessionId) {
            SessionManager.getInstance().triggerIntelligentTitleGeneration(currentSessionId, this.currentProvider ? { type: this.currentProvider.type, model: this.currentProvider.model } : undefined);
          }
        }
        return;
      }
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


  private limitContextSize(messages: readonly UniversalMessage[]): UniversalMessage[] {
    return [...messages]; // Return mutable copy of all messages
    
    // Get max turns from config or use default
    const DEFAULT_MAX_TURNS = 20;
    const maxTurns = this.config.getMaxSessionTurns() >= 0 ? this.config.getMaxSessionTurns() : DEFAULT_MAX_TURNS;
    if (maxTurns <= 0) {
      return [...messages]; // No limit if set to 0 or negative, return mutable copy
    }

    // Always preserve system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    // Count turns from the end (each user message starts a new turn)
    const turns: UniversalMessage[][] = [];
    let currentTurn: UniversalMessage[] = [];
    
    // Process messages in reverse to count from the most recent
    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const message = conversationMessages[i];
      currentTurn.unshift(message);
      
      // A user message starts a new turn (when going backwards)
      if (message.role === 'user') {
        turns.unshift([...currentTurn]);
        currentTurn = [];
        
        // Stop if we have enough turns
        if (turns.length >= maxTurns) {
          break;
        }
      }
    }
    
    // Flatten the kept turns
    const keptMessages = turns.flat();
    
    if (keptMessages.length < conversationMessages.length) {
      console.log(`[MultiModelSystem] Context limited: kept ${keptMessages.length}/${conversationMessages.length} messages (${turns.length} turns)`);
    }
    
    return [...systemMessages, ...keptMessages];
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

    // Calculate current token count using provider's countTokens method
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

    // Get provider capabilities to determine max tokens
    const capabilities = provider.getCapabilityInfo();
    const tokenLimit = capabilities?.maxTokens || 10000;

    // Check both token limit and turn count for compression triggers
    let compressionNeeded = false;
    let compressionReason = '';
    
    if (!force) {
      const tokenThreshold = COMPRESSION_TOKEN_THRESHOLD;
      const thresholdTokens = tokenThreshold * tokenLimit;
      console.log(`[MultiModelSystem] Compression check: ${originalTokenCount} tokens vs ${thresholdTokens} threshold (${tokenThreshold} * ${tokenLimit})`);
      
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
        console.log(`[MultiModelSystem] No compression needed: ${originalTokenCount} < ${thresholdTokens} tokens and ${userTurns} < ${TURN_COMPRESSION_THRESHOLD} turns`);
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
      const summary = response.content;

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
}