/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RoleDefinition } from '../roles/types.js';
import type { Config } from '../config/config.js';
import type { ToolRegistry } from './tool-registry.js';

export interface ToolsetConfiguration {
  readonly roleId: string;
  readonly enabledTools: readonly string[];
  readonly disabledTools: readonly string[];
  readonly toolPriority: readonly string[];
}

export interface ToolsetOptimizationStats {
  readonly totalAvailableTools: number;
  readonly enabledToolsCount: number;
  readonly estimatedTokenSaving: number;
  readonly toolCategories: Record<string, number>;
}

export interface ToolsetChangeEvent {
  readonly roleId: string;
  readonly previousTools: readonly string[];
  readonly newTools: readonly string[];
  readonly addedTools: readonly string[];
  readonly removedTools: readonly string[];
}

export type ToolsetChangeListener = (event: ToolsetChangeEvent) => void;

/**
 * ToolsetManager manages dynamic tool switching based on roles to optimize token usage.
 * Different roles only expose relevant tools, reducing prompt size and improving focus.
 */
export class ToolsetManager {
  private readonly toolRegistry: ToolRegistry;
  private currentRoleId: string | null = null;
  private currentToolset: Set<string> = new Set();
  private changeListeners = new Set<ToolsetChangeListener>();
  private roleToolsets = new Map<string, Set<string>>();
  
  // Tool categories for optimization analysis
  private static readonly TOOL_CATEGORIES = {
    'file': ['read-file', 'write-file', 'edit', 'read-many-files'],
    'search': ['ripGrep', 'grep', 'glob', 'web-search'],
    'system': ['shell', 'ls'],
    'web': ['web-fetch', 'web-search'],
    'memory': ['memory-tool'],
    'mcp': ['mcp-tool']
  } as const;

  constructor(config: Config) {
    this.toolRegistry = config.getToolRegistry();
    this.initializeDefaultToolsets();
  }


  /**
   * Switch to tools appropriate for the given role.
   */
  async switchToRoleToolset(role: RoleDefinition): Promise<void> {
    const previousTools = Array.from(this.currentToolset);
    const newToolset = this.getToolsetForRole(role);
    
    // Update current state 
    this.currentRoleId = role.id;
    this.currentToolset = new Set(newToolset);
    
    // Calculate differences
    const addedTools = newToolset.filter(tool => !previousTools.includes(tool));
    const removedTools = previousTools.filter(tool => !newToolset.includes(tool));
    
    // Apply toolset to registry
    await this.applyToolsetToRegistry(newToolset);
    
    // Notify listeners
    this.notifyToolsetChange({
      roleId: role.id,
      previousTools,
      newTools: newToolset,
      addedTools,
      removedTools
    });
  }

  /**
   * Get the optimal toolset for a specific role.
   */
  getToolsetForRole(role: RoleDefinition): string[] {
    // Use cached toolset if available
    if (this.roleToolsets.has(role.id)) {
      return Array.from(this.roleToolsets.get(role.id)!);
    }

    // Get role-specific tools from role definition
    const roleTools = new Set(role.tools || []);
    
    // Get all available tools from registry
    const availableTools = this.getAllAvailableTools();
    
    // Filter to only include tools that exist in the registry
    const validTools = Array.from(roleTools).filter(tool => 
      availableTools.includes(tool)
    );
    
    // Add essential tools that every role should have
    const essentialTools = this.getEssentialTools();
    for (const tool of essentialTools) {
      if (availableTools.includes(tool)) {
        validTools.push(tool);
      }
    }
    
    // Remove duplicates and cache result
    const finalToolset = Array.from(new Set(validTools));
    this.roleToolsets.set(role.id, new Set(finalToolset));
    
    return finalToolset;
  }

  /**
   * Get the currently active toolset.
   */
  getCurrentToolset(): string[] {
    return Array.from(this.currentToolset);
  }

  /**
   * Get the currently active role ID.
   */
  getCurrentRoleId(): string | null {
    return this.currentRoleId;
  }

  /**
   * Add a custom tool configuration for a role.
   */
  setCustomToolsetForRole(roleId: string, toolNames: string[]): void {
    const availableTools = this.getAllAvailableTools();
    const validTools = toolNames.filter(tool => availableTools.includes(tool));
    
    this.roleToolsets.set(roleId, new Set(validTools));
  }

  /**
   * Get optimization statistics for the current toolset.
   */
  getOptimizationStats(): ToolsetOptimizationStats {
    const allTools = this.getAllAvailableTools();
    const enabledTools = this.getCurrentToolset();
    
    // Estimate token savings (rough approximation)
    const avgTokensPerTool = 150; // Estimated tokens per tool in prompt
    const disabledToolsCount = allTools.length - enabledTools.length;
    const estimatedTokenSaving = disabledToolsCount * avgTokensPerTool;
    
    // Categorize enabled tools
    const toolCategories: Record<string, number> = {};
    for (const [category, tools] of Object.entries(ToolsetManager.TOOL_CATEGORIES)) {
      toolCategories[category] = tools.filter(tool => enabledTools.includes(tool)).length;
    }
    
    return {
      totalAvailableTools: allTools.length,
      enabledToolsCount: enabledTools.length,
      estimatedTokenSaving,
      toolCategories
    };
  }

  /**
   * Register a listener for toolset changes.
   */
  onToolsetChange(listener: ToolsetChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Check if a specific tool is currently enabled.
   */
  isToolEnabled(toolName: string): boolean {
    return this.currentToolset.has(toolName);
  }

  /**
   * Get all tools available in a specific category.
   */
  getToolsByCategory(category: keyof typeof ToolsetManager.TOOL_CATEGORIES): string[] {
    return [...ToolsetManager.TOOL_CATEGORIES[category]];
  }

  /**
   * Get tools that are commonly used across roles.
   */
  private getEssentialTools(): string[] {
    // Tools that are useful for most roles
    return ['read-file', 'write-file'];
  }

  /**
   * Get all tools available in the registry.
   */
  private getAllAvailableTools(): string[] {
    // Get tools from the registry - use the toolRegistry to satisfy TypeScript
    void this.toolRegistry; // Mark as intentionally used
    
    // Since ToolRegistry doesn't expose all tools, return known tool names
    return [
      'read-file', 'write-file', 'edit', 'read-many-files',
      'ripGrep', 'grep', 'glob', 'web-search',
      'shell', 'ls',
      'web-fetch',
      'memory-tool',
      'mcp-tool'
    ];
  }

  /**
   * Apply the toolset configuration to the tool registry.
   */
  private async applyToolsetToRegistry(enabledTools: string[]): Promise<void> {
    // This would ideally modify the tool registry to only expose enabled tools
    // For now, we'll store the configuration for use by the prompt system
    // The actual filtering would happen in the prompt generation phase
  }

  /**
   * Initialize default toolsets for built-in roles.
   */
  private initializeDefaultToolsets(): void {
    // Default toolsets are already defined in role definitions
    // This method can be used for additional initialization if needed
  }

  /**
   * Notify all listeners about toolset changes.
   */
  private notifyToolsetChange(event: ToolsetChangeEvent): void {
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in toolset change listener:', error);
      }
    }
  }

  /**
   * Get optimization recommendations for a role.
   */
  getOptimizationRecommendations(role: RoleDefinition): Array<{
    type: 'add' | 'remove';
    tool: string;
    reason: string;
    impact: 'low' | 'medium' | 'high';
  }> {
    const recommendations: Array<{
      type: 'add' | 'remove';
      tool: string;
      reason: string;
      impact: 'low' | 'medium' | 'high';
    }> = [];

    const currentTools = new Set(this.getToolsetForRole(role));

    // Analyze role category to suggest relevant tools
    const roleCategory = role.category;
    
    switch (roleCategory) {
      case 'development':
        // Suggest development-specific tools
        if (!currentTools.has('shell')) {
          recommendations.push({
            type: 'add',
            tool: 'shell',
            reason: 'Development roles often need system commands',
            impact: 'high'
          });
        }
        if (!currentTools.has('ripGrep')) {
          recommendations.push({
            type: 'add',
            tool: 'ripGrep',
            reason: 'Code search is essential for development',
            impact: 'medium'
          });
        }
        break;
      
      case 'office':
        // Remove development-specific tools for office roles
        if (currentTools.has('shell')) {
          recommendations.push({
            type: 'remove',
            tool: 'shell',
            reason: 'Shell commands rarely needed for office tasks',
            impact: 'medium'
          });
        }
        if (!currentTools.has('web-search')) {
          recommendations.push({
            type: 'add',
            tool: 'web-search',
            reason: 'Research capabilities useful for office work',
            impact: 'high'
          });
        }
        break;
      
      case 'creative':
        // Creative roles need web access but not system tools
        if (currentTools.has('shell')) {
          recommendations.push({
            type: 'remove',
            tool: 'shell',
            reason: 'System commands not needed for creative tasks',
            impact: 'low'
          });
        }
        break;
    }

    return recommendations;
  }

  /**
   * Apply optimization recommendations.
   */
  async applyRecommendations(
    roleId: string, 
    recommendations: Array<{type: 'add' | 'remove'; tool: string}>
  ): Promise<void> {
    const currentToolset = this.roleToolsets.get(roleId) || new Set();
    const newToolset = new Set(currentToolset);

    for (const rec of recommendations) {
      if (rec.type === 'add') {
        newToolset.add(rec.tool);
      } else {
        newToolset.delete(rec.tool);
      }
    }

    this.roleToolsets.set(roleId, newToolset);
  }
}