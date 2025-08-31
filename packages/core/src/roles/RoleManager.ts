/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RoleDefinition, RoleContext, RoleCategory } from './types.js';
import { BUILTIN_ROLES } from './BuiltinRoles.js';
import { getCoreSystemPrompt } from '../core/prompts.js';

export class RoleManager {
  private static instance: RoleManager | null = null;
  private roles: Map<string, RoleDefinition> = new Map();
  private currentRole: RoleDefinition;

  private constructor() {
    this.loadBuiltinRoles();
    this.currentRole = this.roles.get('software_engineer')!;
  }

  static getInstance(): RoleManager {
    if (!RoleManager.instance) {
      RoleManager.instance = new RoleManager();
    }
    return RoleManager.instance;
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

  private loadBuiltinRoles(): void {
    Object.values(BUILTIN_ROLES).forEach(role => {
      this.roles.set(role.id, role);
    });
  }

  /**
   * Generates a role-aware system prompt
   */
  getRoleAwareSystemPrompt(
    userMemory?: string,
    roleId?: string,
    additionalInstructions?: string
  ): string {
    try {
      const context = this.createRoleContext(roleId, userMemory, additionalInstructions);
      return this.generateSystemPrompt(context);
    } catch {
      // Fallback to original system prompt if role system fails
      return getCoreSystemPrompt(userMemory);
    }
  }

  /**
   * Checks if the role system is enabled via environment variable
   */
  isRoleSystemEnabled(): boolean {
    return process.env['GEMINI_ROLE_SYSTEM'] !== '0' && 
           process.env['GEMINI_ROLE_SYSTEM'] !== 'false';
  }

  /**
   * Gets the combined system prompt, using role system if enabled
   */
  getCombinedSystemPrompt(
    userMemory?: string,
    roleId?: string,
    additionalInstructions?: string
  ): string {
    if (this.isRoleSystemEnabled()) {
      return this.getRoleAwareSystemPrompt(userMemory, roleId, additionalInstructions);
    }
    return getCoreSystemPrompt(userMemory);
  }
}