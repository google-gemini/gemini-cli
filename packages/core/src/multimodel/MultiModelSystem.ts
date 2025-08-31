/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ModelProviderConfig,
  UniversalMessage,
  UniversalStreamEvent,
  ConnectionStatus
} from '../providers/types.js';
import type { ModelProviderType } from '../providers/types.js';
import { ModelProviderFactory } from '../providers/ModelProviderFactory.js';
import { ProviderConfigManager } from '../providers/ProviderConfigManager.js';
import { RoleManager } from '../roles/RoleManager.js';
import type { Config } from '../config/config.js';
import type { GeminiClient } from '../core/client.js';
import { WorkspaceManager } from '../utils/WorkspaceManager.js';
import { executeToolCall } from '../core/nonInteractiveToolExecutor.js';
import type { ToolCallRequestInfo } from '../core/turn.js';
import type { Part } from '@google/genai';
import { SessionManager } from '../sessions/SessionManager.js';

export class MultiModelSystem {
  private configManager: ProviderConfigManager;
  private workspaceManager: WorkspaceManager;
  private currentProvider: ModelProviderConfig | null = null;
  private config: Config;
  // private readonly DEFAULT_MAX_TURNS = 10;

  constructor(config: Config, geminiClient?: GeminiClient) {
    this.config = config;
    this.configManager = new ProviderConfigManager(config);
    this.workspaceManager = WorkspaceManager.getInstance(config);
    
    if (geminiClient) {
      ModelProviderFactory.setGeminiClient(geminiClient);
    }
    
    this.currentProvider = this.configManager.getDefaultProviderConfig() || null;
  }

  /**
   * Initialize the MultiModelSystem
   */
  async initialize(): Promise<void> {
    // MultiModelSystem initialization logic if needed
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
      sessionManager.addHistory(msg);
      
      // Auto-update title if this is the first user message in the session
      sessionManager.handleAutoTitleGeneration(msg);
    });

    // SessionManager maintains complete conversation history
    // const currentHistory = sessionManager.getHistory();
    // const limitedHistory = this.limitContextSize(currentHistory);
    // let currentMessages = [...currentHistory]; // OLD: maintained persistent currentMessages
    
    const provider = ModelProviderFactory.create(this.currentProvider, this.config);

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
      console.log('[MultiModelSystem] Using limited conversation history:', limitedMessages.length, '/', fullHistory.length, 'messages');
      
      // Enhance messages with system prompt, role and workspace context
      const enhancedMessages = await this.enhanceMessagesWithRole(limitedMessages, roleId);
      
      const responseStream = provider.sendMessageStream(enhancedMessages, signal);
      const toolCallRequests: ToolCallRequestInfo[] = [];
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
          
          toolCallRequests.push(toolCallRequest);
          console.log(`[MultiModelSystem] Collected tool call: ${event.toolCall.name}`);
        } else if (event.type === 'done') {
          // Save assistant response to history when stream completes
          if (assistantContent.trim()) {
            SessionManager.getInstance().addHistory({
              role: 'assistant',
              content: assistantContent
            });
            console.log(`[MultiModelSystem] Saved assistant response to history (${assistantContent.length} chars)`);
          }
          yield event;
        } else {
          // Pass through other events (error)
          yield event;
        }
      }
      
      // Check if we have tool calls to execute (like nonInteractiveCli.ts)
      if (toolCallRequests.length > 0) {
        const toolResponseParts: Part[] = [];
        
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
            } else {
              if (toolResponse.responseParts) {
                toolResponseParts.push(...toolResponse.responseParts);
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
        
        // Add tool response to conversation history (preserve context)
        if (toolResponseParts.length > 0) {
          // Convert Parts to UniversalMessage content
          const toolResponseContent = toolResponseParts
            .map(part => {
              if ('text' in part) {
                return part.text;
              } else if ('functionResponse' in part && part.functionResponse) {
                // Extract the actual tool result from functionResponse
                const response = part.functionResponse.response;
                if (response && typeof response === 'object' && 'output' in response) {
                  return response['output'] as string;
                }
                return JSON.stringify(response, null, 2);
              } else if ('inlineData' in part && part.inlineData?.data) {
                return `[Tool returned file data: ${part.inlineData.mimeType}]`;
              }
              return '[Tool response data]';
            })
            .join('\n');
          
          // Add tool response to SessionManager only (no more currentMessages management)
          const toolResponseMessage: UniversalMessage = {
            role: 'user',
            content: `Tool response: ${toolResponseContent}`
          };
          
          SessionManager.getInstance().addHistory(toolResponseMessage);
          // OLD: currentMessages = [...updatedHistory]; // No longer needed - we get fresh history each loop
          console.log(`[MultiModelSystem] Added tool response to session history, continuing loop...`);
        } 
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
        const provider = ModelProviderFactory.create(config, this.config);
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
    
    for (const config of configs) {
      try {
        // Check if provider has required configuration before trying to create it
        if (config!.type === 'gemini' && !config!.apiKey) {
          console.warn(`Skipping Gemini provider: GEMINI_API_KEY not set`);
          continue;
        }
        
        if (config!.type === 'openai' && !config!.apiKey) {
          console.warn(`Skipping OpenAI provider: OPENAI_API_KEY not set`);
          continue;
        }
        
        const provider = ModelProviderFactory.create(config!, this.config);
        const models = await provider.getAvailableModels();
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

  async switchProvider(config: ModelProviderConfig): Promise<void> {
    ModelProviderFactory.validateConfig(config);
    this.configManager.setProviderConfig(config);
    this.currentProvider = config;
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
      const provider = ModelProviderFactory.create(this.currentProvider, this.config);
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