/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ModelProviderConfig,
  UniversalMessage,
  UniversalResponse,
  UniversalStreamEvent,
  ConnectionStatus
} from '../providers/types.js';
import { ModelProviderType } from '../providers/types.js';
import { ModelProviderFactory } from '../providers/ModelProviderFactory.js';
import { ProviderConfigManager } from '../providers/ProviderConfigManager.js';
import type { RoleDefinition } from '../roles/types.js';
import { RoleManager } from '../roles/RoleManager.js';
import { getRoleAwareSystemPrompt, setCurrentRole } from '../core/roleAwarePrompts.js';
import type { Config } from '../config/config.js';
import type { GeminiClient } from '../core/client.js';
import { WorkspaceManager } from '../utils/WorkspaceManager.js';
import type { WorkspaceChangeListener } from '../utils/WorkspaceManager.js';
import { TemplateManager } from '../templates/TemplateManager.js';
import { ToolsetManager } from '../tools/ToolsetManager.js';
import { ToolsetOptimizer } from '../tools/ToolsetOptimizer.js';
import type { 
  PresetTemplate, 
  TemplateRenderOptions, 
  TemplateRenderResult,
  TemplateSearchOptions,
  SimpleTemplateOptions,
  ConversationMessage,
  TemplateGenerationOptions
} from '../templates/index.js';
import type { 
  ToolsetChangeListener, 
  ToolsetOptimizationStats
} from '../tools/ToolsetManager.js';
import type {
  OptimizationResult,
  OptimizationProfile 
} from '../tools/ToolsetOptimizer.js';

export class MultiModelSystem {
  private configManager: ProviderConfigManager;
  private roleManager: RoleManager;
  private workspaceManager: WorkspaceManager;
  private templateManager: TemplateManager;
  private toolsetManager: ToolsetManager;
  private toolsetOptimizer: ToolsetOptimizer;
  private currentProvider: ModelProviderConfig | null = null;

  constructor(config: Config, geminiClient?: GeminiClient) {
    this.configManager = new ProviderConfigManager(config);
    this.workspaceManager = new WorkspaceManager(config);
    this.templateManager = new TemplateManager(config);
    this.toolsetManager = new ToolsetManager(config);
    this.toolsetOptimizer = new ToolsetOptimizer(config, this.toolsetManager);
    this.roleManager = new RoleManager(this.toolsetManager);
    
    if (geminiClient) {
      ModelProviderFactory.setGeminiClient(geminiClient);
    }
    
    this.currentProvider = this.configManager.getDefaultProviderConfig() || null;
  }

  async switchProvider(config: ModelProviderConfig): Promise<void> {
    ModelProviderFactory.validateConfig(config);
    this.configManager.setProviderConfig(config);
    this.currentProvider = config;
  }

  async switchRole(roleId: string): Promise<boolean> {
    const success = await this.roleManager.setCurrentRole(roleId);
    if (success) {
      setCurrentRole(roleId);
      
      // Auto-switch to preferred model if configured
      const role = this.roleManager.getRole(roleId);
      if (role?.modelPreferences?.preferred.length) {
        const preferredType = role.modelPreferences.preferred[0];
        const providerConfig = this.configManager.getProviderConfig(preferredType);
        
        if (providerConfig) {
          await this.switchProvider(providerConfig);
        }
      }
    }
    return success;
  }

  async sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal,
    roleId?: string
  ): Promise<UniversalResponse> {
    if (!this.currentProvider) {
      throw new Error('No provider configured');
    }

    const provider = ModelProviderFactory.create(this.currentProvider);
    const enhancedMessages = await this.enhanceMessagesWithRole(messages, roleId);
    
    return provider.sendMessage(enhancedMessages, signal);
  }

  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal,
    roleId?: string
  ): AsyncGenerator<UniversalStreamEvent> {
    if (!this.currentProvider) {
      throw new Error('No provider configured');
    }

    const provider = ModelProviderFactory.create(this.currentProvider);
    const enhancedMessages = await this.enhanceMessagesWithRole(messages, roleId);
    
    yield* provider.sendMessageStream(enhancedMessages, signal);
  }

  async getConnectionStatus(): Promise<ConnectionStatus[]> {
    const configs = this.configManager.getAllProviderConfigs();
    const statuses: ConnectionStatus[] = [];
    
    for (const config of configs) {
      try {
        const provider = ModelProviderFactory.create(config);
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
        const provider = ModelProviderFactory.create(config!);
        const models = await provider.getAvailableModels();
        modelsByProvider[config!.type] = models;
      } catch (error) {
        modelsByProvider[config!.type] = [];
      }
    }
    
    return modelsByProvider;
  }

  getCurrentProvider(): ModelProviderConfig | null {
    return this.currentProvider;
  }

  getCurrentRole(): RoleDefinition {
    return this.roleManager.getCurrentRole();
  }

  getAllRoles(): RoleDefinition[] {
    return this.roleManager.getAllRoles();
  }

  getAllProviders(): ModelProviderConfig[] {
    return this.configManager.getAllProviderConfigs();
  }

  getSupportedProviders(): ModelProviderType[] {
    return ModelProviderFactory.getSupportedProviders();
  }

  addCustomRole(role: RoleDefinition): void {
    this.roleManager.addCustomRole(role);
  }

  // Workspace management methods
  async addWorkspaceDirectory(directory: string, basePath?: string): Promise<void> {
    await this.workspaceManager.addDirectory(directory, basePath);
  }

  async setWorkspaceDirectories(directories: readonly string[]): Promise<void> {
    await this.workspaceManager.setDirectories(directories);
  }

  getWorkspaceDirectories(): readonly string[] {
    return this.workspaceManager.getDirectories();
  }

  onWorkspaceChange(listener: WorkspaceChangeListener) {
    return this.workspaceManager.onWorkspaceChange(listener);
  }

  async updateWorkspaceContext(): Promise<void> {
    await this.workspaceManager.updateEnvironmentContext();
  }

  // Template management methods
  getAllTemplates(): PresetTemplate[] {
    return this.templateManager.getAllTemplates();
  }

  getTemplate(id: string): PresetTemplate | undefined {
    return this.templateManager.getTemplate(id);
  }

  searchTemplates(options: TemplateSearchOptions): PresetTemplate[] {
    return this.templateManager.searchTemplates(options);
  }

  renderTemplate(
    templateId: string,
    variables: Record<string, string | number | boolean>,
    options?: Partial<TemplateRenderOptions>
  ): TemplateRenderResult {
    return this.templateManager.renderTemplate(templateId, variables, options);
  }

  addCustomTemplate(template: Omit<PresetTemplate, 'isBuiltin'>): void {
    this.templateManager.addCustomTemplate(template);
  }

  updateCustomTemplate(
    id: string,
    updates: Partial<Omit<PresetTemplate, 'id' | 'isBuiltin'>>
  ): void {
    this.templateManager.updateCustomTemplate(id, updates);
  }

  deleteCustomTemplate(id: string): void {
    this.templateManager.deleteCustomTemplate(id);
  }

  // Simplified template creation methods
  createSimpleTemplate(options: SimpleTemplateOptions): void {
    this.templateManager.createSimpleTemplate(options);
  }

  createTemplateFromConversation(
    message: ConversationMessage,
    name: string,
    options?: TemplateGenerationOptions
  ): void {
    this.templateManager.createTemplateFromConversation(message, name, options);
  }

  createTemplateFromExamples(
    examples: ConversationMessage[],
    name: string,
    options?: TemplateGenerationOptions
  ): void {
    this.templateManager.createTemplateFromExamples(examples, name, options);
  }

  suggestTemplatesFromConversations(
    conversations: readonly ConversationMessage[],
    minLength?: number
  ) {
    return this.templateManager.suggestTemplatesFromConversations(conversations, minLength);
  }

  createInteractiveTemplateBuilder() {
    return this.templateManager.createInteractiveBuilder();
  }

  // Toolset management methods
  getCurrentToolset(): string[] {
    return this.toolsetManager.getCurrentToolset();
  }

  getToolsetOptimizationStats(): ToolsetOptimizationStats {
    return this.toolsetManager.getOptimizationStats();
  }

  onToolsetChange(listener: ToolsetChangeListener): () => void {
    return this.toolsetManager.onToolsetChange(listener);
  }

  isToolEnabled(toolName: string): boolean {
    return this.toolsetManager.isToolEnabled(toolName);
  }

  optimizeToolsetForCurrentRole(profile?: OptimizationProfile): OptimizationResult {
    const currentRole = this.roleManager.getCurrentRole();
    return this.toolsetOptimizer.optimizeForRole(currentRole, profile);
  }

  getToolUsageRecommendations() {
    const currentRole = this.roleManager.getCurrentRole();
    return this.toolsetOptimizer.getUsageBasedRecommendations(currentRole.id);
  }

  recordToolUsage(
    toolName: string,
    success: boolean,
    executionTime: number
  ): void {
    const currentRole = this.roleManager.getCurrentRole();
    this.toolsetOptimizer.recordToolUsage(toolName, currentRole.id, success, executionTime);
  }

  private async enhanceMessagesWithRole(
    messages: UniversalMessage[],
    roleId?: string
  ): Promise<UniversalMessage[]> {
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    
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
    const roleSystemPrompt = getRoleAwareSystemPrompt(
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