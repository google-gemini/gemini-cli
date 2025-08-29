/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RoleDefinition } from '../roles/types.js';
import { RoleManager } from '../roles/RoleManager.js';
import { getCoreSystemPrompt } from './prompts.js';

let roleManager: RoleManager | null = null;

function getRoleManager(): RoleManager {
  if (!roleManager) {
    roleManager = new RoleManager();
  }
  return roleManager;
}

export function getRoleAwareSystemPrompt(
  userMemory?: string,
  roleId?: string,
  additionalInstructions?: string
): string {
  const manager = getRoleManager();
  
  try {
    const context = manager.createRoleContext(roleId, userMemory, additionalInstructions);
    return manager.generateSystemPrompt(context);
  } catch {
    // Fallback to original system prompt if role system fails
    return getCoreSystemPrompt(userMemory);
  }
}

export function getCurrentRole(): RoleDefinition {
  return getRoleManager().getCurrentRole();
}

export async function setCurrentRole(roleId: string): Promise<boolean> {
  return await getRoleManager().setCurrentRole(roleId);
}

export function getAllRoles(): RoleDefinition[] {
  return getRoleManager().getAllRoles();
}

export function getRole(roleId: string): RoleDefinition | undefined {
  return getRoleManager().getRole(roleId);
}

export function isRoleSystemEnabled(): boolean {
  return process.env['GEMINI_ROLE_SYSTEM'] !== '0' && 
         process.env['GEMINI_ROLE_SYSTEM'] !== 'false';
}

export function getCombinedSystemPrompt(
  userMemory?: string,
  roleId?: string,
  additionalInstructions?: string
): string {
  if (isRoleSystemEnabled()) {
    return getRoleAwareSystemPrompt(userMemory, roleId, additionalInstructions);
  }
  return getCoreSystemPrompt(userMemory);
}