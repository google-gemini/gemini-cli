/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { 
  UniversalMessage,
  UniversalStreamEvent,
  RoleDefinition,
  PresetTemplate,
  ModelProviderType,
  CompressionInfo,
  ToolCall
} from '@/types';
import type { ToolCallConfirmationDetails, ToolConfirmationOutcome } from '@/types';

// Define Electron API interface
interface ElectronAPI {
  multiModel: {
    initialize: (config: Record<string, unknown>) => Promise<void>;
    switchProvider: (providerType: string, model: string) => Promise<void>;
    switchRole: (roleId: string) => Promise<boolean>;
    sendMessage: (messages: UniversalMessage[]) => Promise<UniversalStreamEvent[]>;
    sendMessageStream: (messages: UniversalMessage[]) => {
      streamId: string;
      startStream: (
        onChunk: (chunk: { type: string; content?: string; role?: string; timestamp: number; compressionInfo?: CompressionInfo; toolCall?: ToolCall; toolCallId?: string; toolName?: string }) => void,
        onComplete: (data: { type: string; content: string; role: string; timestamp: number }) => void,
        onError: (error: { type: string; error: string }) => void
      ) => () => void; // Returns cleanup function
    };
    getAvailableModels: (providerType?: string) => Promise<Record<string, string[]>>;
    getAllRoles: () => Promise<RoleDefinition[]>;
    getCurrentRole: () => Promise<RoleDefinition | null>;
    getAllTemplates: () => Promise<PresetTemplate[]>;
    renderTemplate: (templateId: string, variables: Record<string, string | number | boolean>) => Promise<string>;
    addWorkspaceDirectory: (directory: string, basePath?: string) => Promise<void>;
    getWorkspaceDirectories: () => Promise<readonly string[]>;
    setWorkspaceDirectories: (directories: readonly string[]) => Promise<void>;
    getCurrentToolset: () => Promise<string[]>;
    addCustomRole: (role: RoleDefinition) => Promise<void>;
    addCustomTemplate: (template: Omit<PresetTemplate, 'isBuiltin'>) => Promise<void>;
    updateCustomTemplate: (id: string, updates: Partial<Omit<PresetTemplate, 'id' | 'isBuiltin'>>) => Promise<void>;
    deleteCustomTemplate: (id: string) => Promise<void>;
    // Session management
    createSession: (sessionId: string, title?: string) => Promise<void>;
    switchSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    deleteAllSessions: () => Promise<void>;
    getCurrentSessionId: () => Promise<string | null>;
    getDisplayMessages: (sessionId?: string) => Promise<UniversalMessage[]>;
    getSessionsInfo: () => Promise<Array<{id: string, title: string, messageCount: number, lastUpdated: Date}>>;
    updateSessionTitle: (sessionId: string, newTitle: string) => Promise<void>;
    // Tool confirmation
    onToolConfirmationRequest: (callback: (event: unknown, data: { streamId: string; confirmationDetails: ToolCallConfirmationDetails }) => void) => () => void;
    sendToolConfirmationResponse: (outcome: string) => Promise<{ success: boolean }>;
    // OAuth authentication
    startOAuthFlow: (providerType: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    getOAuthStatus: (providerType: string) => Promise<{ authenticated: boolean; userEmail?: string }>;
    clearOAuthCredentials: (providerType: string) => Promise<{ success: boolean; error?: string }>;
    checkEnvApiKey: (providerType: string) => Promise<{ detected: boolean; source: string }>;
    setApiKeyPreference: (providerType: string) => Promise<{ success: boolean; error?: string }>;
    setOAuthPreference: (providerType: string) => Promise<{ success: boolean; error?: string }>;
    getApprovalMode: () => Promise<'default' | 'autoEdit' | 'yolo'>;
    setApprovalMode: (mode: 'default' | 'autoEdit' | 'yolo') => Promise<void>;
  };
}

declare global {
  interface GlobalThis {
    electronAPI?: ElectronAPI;
  }
}

class MultiModelService {
  private initialized = false;
  private switchingRole = false;
  private lastRoleSwitch: { roleId: string; timestamp: number } | null = null;
  private modelsCache: Record<string, string[]> | null = null;
  private modelsCacheTimestamp: number = 0;
  private readonly MODELS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Tool confirmation callback
  private confirmationCallback?: (
    details: ToolCallConfirmationDetails
  ) => Promise<ToolConfirmationOutcome>;

  private get api() {
    const electronAPI = (globalThis as GlobalThis).electronAPI;
    if (!electronAPI?.multiModel) {
      throw new Error('Electron API not available');
    }
    return electronAPI.multiModel;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    await this.api.initialize(config);
    this.initialized = true;
    
    // Set up tool confirmation listener
    this.setupConfirmationListener();
  }

  // Set the confirmation callback for tool approvals
  setConfirmationCallback(
    callback: (details: ToolCallConfirmationDetails) => Promise<ToolConfirmationOutcome>
  ): void {
    this.confirmationCallback = callback;
  }

  // Set up the confirmation request listener from main process
  private setupConfirmationListener(): void {
    if (this.api.onToolConfirmationRequest) {
      this.api.onToolConfirmationRequest(async (_, data) => {
        console.log('Received tool confirmation request from main process:', data);
        
        if (this.confirmationCallback) {
          try {
            // Call the registered callback to handle confirmation in GUI
            // data.confirmationDetails is the actual ToolCallConfirmationDetails
            const outcome = await this.confirmationCallback(data.confirmationDetails);
            console.log('Sending confirmation response:', outcome);
            
            // Send the response back to main process
            this.api.sendToolConfirmationResponse(outcome);
          } catch (error) {
            console.error('Error handling tool confirmation:', error);
            // Send cancel as fallback
            this.api.sendToolConfirmationResponse('cancel');
          }
        } else {
          console.warn('No confirmation callback registered, auto-cancelling');
          this.api.sendToolConfirmationResponse('cancel');
        }
      });
    }
  }

  async switchProvider(providerType: ModelProviderType, model: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.switchProvider(providerType, model);
  }

  async switchRole(roleId: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    // Prevent duplicate calls within 1 second
    const now = Date.now();
    if (this.lastRoleSwitch && 
        this.lastRoleSwitch.roleId === roleId && 
        now - this.lastRoleSwitch.timestamp < 1000) {
      console.log(`Ignoring duplicate switchRole call for ${roleId} (within 1s)`);
      return true;
    }

    // Prevent concurrent calls
    if (this.switchingRole) {
      console.log(`Role switch already in progress, ignoring call for ${roleId}`);
      return false;
    }

    this.switchingRole = true;
    try {
      console.log(`Switching to role: ${roleId}`);
      const result = await this.api.switchRole(roleId);
      
      if (result) {
        this.lastRoleSwitch = { roleId, timestamp: now };
      }
      
      return result;
    } finally {
      this.switchingRole = false;
    }
  }

  async sendMessage(
    messages: UniversalMessage[]
  ): Promise<{ stream: AsyncGenerator<UniversalStreamEvent>; cancel: () => void }> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    const streamResponse = this.api.sendMessageStream(messages);

    // Create our own async generator using real-time callbacks
    let cleanup: (() => void) | null = null;

    async function* eventGenerator(): AsyncGenerator<UniversalStreamEvent> {
      const events: UniversalStreamEvent[] = [];
      let isComplete = false;
      let hasError = false;
      let eventIndex = 0;
      let resolveNext: (() => void) | null = null;

      // Set up real-time callbacks
      cleanup = streamResponse.startStream(
        // onChunk callback
        (chunk) => {
          if (chunk.type === 'content_delta' && chunk.content) {
            events.push({
              type: 'content_delta',
              content: chunk.content,
              role: chunk.role as 'assistant',
              timestamp: chunk.timestamp
            });
            // Immediately wake up the generator
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          } else if (chunk.type === 'compression') {
            // Handle compression events
            events.push({
              type: 'compression',
              compressionInfo: chunk.compressionInfo,
              timestamp: chunk.timestamp
            });
            // Wake up the generator for compression event
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          } else if (chunk.type === 'tool_call') {
            // Handle tool call events
            events.push({
              type: 'tool_call',
              toolCall: chunk.toolCall,
              timestamp: chunk.timestamp
            });
            // Wake up the generator for tool call event
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          } else if (chunk.type === 'tool_response') {
            // Handle tool response events
            events.push({
              type: 'tool_response',
              content: chunk.content,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              timestamp: chunk.timestamp
            });
            // Wake up the generator for tool response event
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          }
        },
        // onComplete callback
        (data) => {
          events.push({
            type: 'message_complete',
            content: data.content,
            role: data.role as 'assistant',
            timestamp: data.timestamp
          });
          isComplete = true;
          // Wake up the generator for completion
          if (resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        },
        // onError callback
        (error) => {
          events.push({
            type: 'error',
            error: error.error,
            timestamp: Date.now()
          });
          hasError = true;
          // Wake up the generator for error
          if (resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        }
      );
      
      try {
        // Real-time event yielding loop
        while (!isComplete && !hasError) {
          // Yield any new events that have arrived
          while (eventIndex < events.length) {
            const event = events[eventIndex];
            yield event;
            eventIndex++;
          }
          
          // Wait for the next event to arrive (event-driven instead of polling)
          if (!isComplete && !hasError && eventIndex >= events.length) {
            await new Promise<void>(resolve => {
              resolveNext = resolve;
              // Fallback timeout to prevent infinite waiting
              setTimeout(() => {
                if (resolveNext === resolve) {
                  resolveNext = null;
                  resolve();
                }
              }, 100);
            });
          }
        }
        
        // Yield any remaining events
        while (eventIndex < events.length) {
          const event = events[eventIndex];
          yield event;
          eventIndex++;
        }
        
      } finally {
        if (cleanup) cleanup();
      }
    }

    return {
      stream: eventGenerator(),
      cancel: () => {
        if (cleanup) cleanup();
      }
    };
  }

  async getAvailableModels(providerType?: ModelProviderType): Promise<Record<string, string[]>> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    // Check cache if no specific provider is requested and cache is still valid
    const now = Date.now();
    if (!providerType && this.modelsCache && (now - this.modelsCacheTimestamp) < this.MODELS_CACHE_TTL) {
      console.log('MultiModelService: Using cached models');
      return this.modelsCache;
    }

    console.log('MultiModelService: Fetching models from API', providerType ? `for provider: ${providerType}` : 'for all providers');
    const models = await this.api.getAvailableModels(providerType);
    
    // Cache the full model list if no specific provider was requested
    if (!providerType) {
      this.modelsCache = models;
      this.modelsCacheTimestamp = now;
      console.log('MultiModelService: Cached models for future use');
    }

    return models;
  }

  getAllRoles(): RoleDefinition[] {
    if (!this.initialized) {
      return [];
    }

    // This needs to be async but keeping interface for compatibility
    return [];
  }

  async getAllRolesAsync(): Promise<RoleDefinition[]> {
    if (!this.initialized) {
      return [];
    }

    return await this.api.getAllRoles();
  }

  getCurrentRole(): RoleDefinition | null {
    if (!this.initialized) {
      return null;
    }

    // This needs to be async but keeping interface for compatibility
    return null;
  }

  async getCurrentRoleAsync(): Promise<RoleDefinition | null> {
    if (!this.initialized) {
      return null;
    }

    return await this.api.getCurrentRole();
  }

  getAllTemplates(): PresetTemplate[] {
    if (!this.initialized) {
      return [];
    }

    // This needs to be async but keeping interface for compatibility
    return [];
  }

  async getAllTemplatesAsync(): Promise<PresetTemplate[]> {
    if (!this.initialized) {
      return [];
    }

    return await this.api.getAllTemplates();
  }

  async renderTemplate(
    templateId: string,
    variables: Record<string, string | number | boolean>
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    return await this.api.renderTemplate(templateId, variables);
  }

  async addWorkspaceDirectory(directory: string, basePath?: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.addWorkspaceDirectory(directory, basePath);
  }

  async setWorkspaceDirectories(directories: readonly string[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.setWorkspaceDirectories(directories);
  }

  async getWorkspaceDirectories(): Promise<readonly string[]> {
    if (!this.initialized) {
      return [];
    }

    return await this.api.getWorkspaceDirectories();
  }

  async getCurrentToolset(): Promise<string[]> {
    if (!this.initialized) {
      return [];
    }

    return await this.api.getCurrentToolset();
  }


  async addCustomRole(role: RoleDefinition): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.addCustomRole(role);
  }

  async addCustomTemplate(template: Omit<PresetTemplate, 'isBuiltin'>): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.addCustomTemplate(template);
  }

  async updateCustomTemplate(id: string, updates: Partial<Omit<PresetTemplate, 'id' | 'isBuiltin'>>): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.updateCustomTemplate(id, updates);
  }

  async deleteCustomTemplate(id: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.deleteCustomTemplate(id);
  }

  // Session management methods
  async createSession(sessionId: string, title?: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.createSession(sessionId, title);
  }

  async switchSession(sessionId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.switchSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.deleteSession(sessionId);
  }

  async deleteAllSessions(): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.deleteAllSessions();
  }

  async getCurrentSessionId(): Promise<string | null> {
    if (!this.initialized) {
      return null;
    }

    return await this.api.getCurrentSessionId();
  }

  async getDisplayMessages(sessionId?: string): Promise<UniversalMessage[]> {
    if (!this.initialized) {
      return [];
    }

    return await this.api.getDisplayMessages(sessionId);
  }

  async getSessionsInfo(): Promise<Array<{id: string, title: string, messageCount: number, lastUpdated: Date}>> {
    if (!this.initialized) {
      return [];
    }

    return await this.api.getSessionsInfo();
  }

  async updateSessionTitle(sessionId: string, newTitle: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.updateSessionTitle(sessionId, newTitle);
  }

  // OAuth authentication methods
  async startOAuthFlow(providerType: string): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    return await this.api.startOAuthFlow(providerType);
  }

  async getOAuthStatus(providerType: string): Promise<{ authenticated: boolean; userEmail?: string }> {
    if (!this.initialized) {
      return { authenticated: false };
    }

    return await this.api.getOAuthStatus(providerType);
  }

  async clearOAuthCredentials(providerType: string): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    return await this.api.clearOAuthCredentials(providerType);
  }

  async checkEnvApiKey(providerType: string): Promise<{ detected: boolean; source: string }> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    return await this.api.checkEnvApiKey(providerType);
  }

  async setApiKeyPreference(providerType: string): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    return await this.api.setApiKeyPreference(providerType);
  }

  async setOAuthPreference(providerType: string): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    return await this.api.setOAuthPreference(providerType);
  }

  async getApprovalMode(): Promise<'default' | 'autoEdit' | 'yolo'> {
    if (!this.initialized) {
      return 'default';
    }

    return await this.api.getApprovalMode();
  }

  async setApprovalMode(mode: 'default' | 'autoEdit' | 'yolo'): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.setApprovalMode(mode);
  }
}

export const multiModelService = new MultiModelService();