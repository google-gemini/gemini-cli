import type { 
  UniversalMessage,
  UniversalStreamEvent,
  RoleDefinition,
  PresetTemplate,
  ModelProviderType 
} from '@/types';

// Define Electron API interface
interface ElectronAPI {
  multiModel: {
    initialize: (config: Record<string, unknown>) => Promise<void>;
    switchProvider: (providerType: string, model: string) => Promise<void>;
    switchRole: (roleId: string) => Promise<boolean>;
    sendMessage: (messages: UniversalMessage[], roleId?: string) => Promise<UniversalStreamEvent[]>;
    sendMessageStream: (messages: UniversalMessage[], roleId?: string) => {
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
    optimizeToolsetForCurrentRole: () => Promise<void>;
    addCustomRole: (role: RoleDefinition) => Promise<void>;
    addCustomTemplate: (template: Omit<PresetTemplate, 'isBuiltin'>) => Promise<void>;
  };
}

declare global {
  interface GlobalThis {
    electronAPI?: ElectronAPI;
  }
}

class MultiModelService {
  private initialized = false;

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

    return await this.api.switchRole(roleId);
  }

  async sendMessage(
    messages: UniversalMessage[],
    roleId?: string
  ): Promise<AsyncGenerator<UniversalStreamEvent>> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    const streamResponse = this.api.sendMessageStream(messages, roleId);
    
    // Create our own async generator using real-time callbacks
    async function* eventGenerator(): AsyncGenerator<UniversalStreamEvent> {
      const events: UniversalStreamEvent[] = [];
      let isComplete = false;
      let hasError = false;
      let eventIndex = 0;
      
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
        },
        // onError callback
        (error) => {
          events.push({
            type: 'error',
            error: error.error,
            timestamp: Date.now()
          });
          hasError = true;
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
          
          // Short delay to allow new events to arrive
          await new Promise(resolve => setTimeout(resolve, 10));
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

    return await this.api.getAvailableModels(providerType);
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

  async optimizeToolsetForCurrentRole(): Promise<void> {
    if (!this.initialized) {
      throw new Error('MultiModelService not initialized');
    }

    await this.api.optimizeToolsetForCurrentRole();
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
}

export const multiModelService = new MultiModelService();