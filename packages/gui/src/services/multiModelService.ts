import type { 
  UniversalMessage,
  UniversalStreamEvent,
  RoleDefinition,
  PresetTemplate,
  ModelProviderType 
} from '@/types';
import type { ToolCallConfirmationDetails, ToolConfirmationOutcome } from '@google/gemini-cli-core';

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
        onChunk: (chunk: { type: string; content: string; role: string; timestamp: number }) => void,
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
    // Session management
    createSession: (sessionId: string, title?: string) => Promise<void>;
    switchSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    getCurrentSessionId: () => Promise<string | null>;
    getDisplayMessages: (sessionId?: string) => Promise<UniversalMessage[]>;
    getSessionsInfo: () => Promise<Array<{id: string, title: string, messageCount: number, lastUpdated: Date}>>;
    updateSessionTitle: (sessionId: string, newTitle: string) => Promise<void>;
    // Tool confirmation
    onToolConfirmationRequest: (callback: (event: any, details: ToolCallConfirmationDetails) => void) => () => void;
    sendToolConfirmationResponse: (outcome: string) => Promise<{ success: boolean }>;
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
      this.api.onToolConfirmationRequest(async (_, confirmationDetails) => {
        console.log('Received tool confirmation request from main process:', confirmationDetails);
        
        if (this.confirmationCallback) {
          try {
            // Call the registered callback to handle confirmation in GUI
            const outcome = await this.confirmationCallback(confirmationDetails);
            console.log('Sending confirmation response:', outcome);
            
            // Send the response back to main process
            await this.api.sendToolConfirmationResponse(outcome);
          } catch (error) {
            console.error('Error handling tool confirmation:', error);
            // Send cancel as fallback
            await this.api.sendToolConfirmationResponse('cancel');
          }
        } else {
          console.warn('No confirmation callback registered, auto-cancelling');
          await this.api.sendToolConfirmationResponse('cancel');
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
  ): Promise<AsyncGenerator<UniversalStreamEvent>> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    const streamResponse = this.api.sendMessageStream(messages);
    
    // Create our own async generator using real-time callbacks
    async function* eventGenerator(): AsyncGenerator<UniversalStreamEvent> {
      const events: UniversalStreamEvent[] = [];
      let isComplete = false;
      let hasError = false;
      let eventIndex = 0;
      let resolveNext: (() => void) | null = null;
      
      // Set up real-time callbacks
      const cleanup = streamResponse.startStream(
        // onChunk callback
        (chunk) => {
          if (chunk.type === 'chunk' && chunk.content) {
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
    
    return eventGenerator();
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
}

export const multiModelService = new MultiModelService();