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
  ToolCall
} from '../providers/types.js';
import type { ModelProviderType } from '../providers/types.js';
import { ModelProviderFactory } from '../providers/ModelProviderFactory.js';
import { ProviderConfigManager } from '../providers/ProviderConfigManager.js';
import { RoleManager } from '../roles/RoleManager.js';
import type { Config } from '../config/config.js';
import { WorkspaceManager } from '../utils/WorkspaceManager.js';
import { executeToolCall } from '../core/nonInteractiveToolExecutor.js';
import type { ToolCallRequestInfo } from '../core/turn.js';
import { SessionManager } from '../sessions/SessionManager.js';

export class MultiModelSystem {
  private configManager: ProviderConfigManager;
  private workspaceManager: WorkspaceManager;
  private currentProvider: ModelProviderConfig | null = null;
  private config: Config;
  private initializedProviders: Map<string, any> = new Map();
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
    'gemini-pro': 'gemini',
    'gemini-1.5-pro': 'gemini',
    'gemini-1.5-flash': 'gemini',
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
   * Initialize the MultiModelSystem
   */
  async initialize(): Promise<void> {
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

    // Add turn limit like nonInteractiveCli.ts to prevent infinite loops
    let turnCount = 0;
    const MAX_TURNS = this.config.getMaxSessionTurns() >= 0 ? this.config.getMaxSessionTurns() : 10;

    while (true) {
      turnCount++;
      if (turnCount > MAX_TURNS) {
        console.error(`[MultiModelSystem] Reached maximum turns (${MAX_TURNS}), stopping to prevent infinite loop.`);
        return;
      }

      // Check for abort signal
      if (signal.aborted) {
        console.error('[MultiModelSystem] Operation cancelled.');
        return;
      }
      
      // NEW: Get fresh history from SessionManager and apply context limiting each time
      const fullHistory = sessionManager.getHistory();
      const limitedMessages = this.limitContextSize(fullHistory);
      // console.log('[MultiModelSystem] Using limited conversation history:', limitedMessages.length, '/', fullHistory.length, 'messages');
      // print limitedMessages for debugging
      console.log('[MultiModelSystem] Limited Messages:', limitedMessages);

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
        
        if (event.type === 'content' && event.content) {
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
        
        // Execute each tool call and create individual tool response messages
        for (const requestInfo of toolCallRequests) {
          try {
            const toolResponse = await executeToolCall(this.config, requestInfo, signal);
            
            if (toolResponse.error) {
              console.error(`[MultiModelSystem] Tool call failed:`, toolResponse.error);
              yield {
                type: 'error',
                error: toolResponse.error
              };
              return;
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
                  if (response && typeof response === 'object' && 'output' in response) {
                    toolResponseContent = response['output'] as string;
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
              }
            }
            
          } catch (error) {
            console.error(`[MultiModelSystem] Tool execution error:`, error);
            yield {
              type: 'error',
              error: error instanceof Error ? error : new Error('Unknown tool execution error')
            };
            return;
          }
        }
        
        // Continue to next iteration to let LLM process all tool responses
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
        
        // Route to static provider methods
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

  private getProviderKey(config: ModelProviderConfig): string {
    return `${config.type}-${config.model}-${config.baseUrl || 'default'}`;
  }

  private async getOrCreateProvider(config: ModelProviderConfig): Promise<any> {
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
    // Get max turns from config or use default
    const DEFAULT_MAX_TURNS = 10;
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