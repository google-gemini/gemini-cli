/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RoleDefinition, RoleContext, RoleCategory } from './types.js';
import { BUILTIN_ROLES } from './BuiltinRoles.js';
import type { ToolsetManager, ToolsetChangeListener } from '../tools/ToolsetManager.js';

export class RoleManager {
  private roles: Map<string, RoleDefinition> = new Map();
  private currentRole: RoleDefinition;
  private toolsetManager: ToolsetManager | null = null;

  constructor(toolsetManager?: ToolsetManager) {
    this.loadBuiltinRoles();
    this.currentRole = this.roles.get('software_engineer')!;
    if (toolsetManager) {
      this.setToolsetManager(toolsetManager);
    }
  }

  getAllRoles(): RoleDefinition[] {
    return Array.from(this.roles.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getRolesByCategory(category: RoleCategory): RoleDefinition[] {
    return this.getAllRoles().filter(role => role.category === category);
  }

  getRole(roleId: string): RoleDefinition | undefined {
    return this.roles.get(roleId);
  }

  getCurrentRole(): RoleDefinition {
    return this.currentRole;
  }

  async setCurrentRole(roleId: string): Promise<boolean> {
    const role = this.roles.get(roleId);
    if (!role) return false;
    
    this.currentRole = role;
    
    // Switch toolset if toolset manager is available
    if (this.toolsetManager) {
      await this.toolsetManager.switchToRoleToolset(role);
    }
    
    return true;
  }

  addCustomRole(role: RoleDefinition): void {
    this.roles.set(role.id, role);
  }

  removeCustomRole(roleId: string): boolean {
    if (this.isBuiltinRole(roleId)) return false;
    
    const deleted = this.roles.delete(roleId);
    
    if (this.currentRole.id === roleId) {
      this.currentRole = this.roles.get('software_engineer')!;
    }
    
    return deleted;
  }

  isBuiltinRole(roleId: string): boolean {
    return roleId in BUILTIN_ROLES;
  }

  createRoleContext(
    roleId?: string,
    userMemory?: string,
    additionalInstructions?: string
  ): RoleContext {
    const role = roleId ? this.getRole(roleId) : this.getCurrentRole();
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }

    return {
      role,
      userMemory,
      additionalInstructions
    };
  }

  generateSystemPrompt(context: RoleContext): string {
    let prompt = context.role.systemPrompt;

    if (context.additionalInstructions) {
      prompt += `\n\n# Additional Instructions\n${context.additionalInstructions}`;
    }

    if (context.userMemory && context.userMemory.trim()) {
      prompt += `\n\n# User Memory\n${context.userMemory.trim()}`;
    }

    return prompt;
  }

  setToolsetManager(toolsetManager: ToolsetManager): void {
    this.toolsetManager = toolsetManager;
  }

  getActiveToolset(): string[] {
    if (this.toolsetManager) {
      return this.toolsetManager.getCurrentToolset();
    }
    return this.currentRole.tools || [];
  }

  onToolsetChange(listener: ToolsetChangeListener): (() => void) | null {
    if (this.toolsetManager) {
      return this.toolsetManager.onToolsetChange(listener);
    }
    return null;
  }

  getToolsetOptimizationStats() {
    if (this.toolsetManager) {
      return this.toolsetManager.getOptimizationStats();
    }
    return null;
  }

  private loadBuiltinRoles(): void {
    Object.values(BUILTIN_ROLES).forEach(role => {
      this.roles.set(role.id, role);
    });
  }
}