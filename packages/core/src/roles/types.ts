/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  category: RoleCategory;
  icon?: string;
  tools?: string[];
}

export interface RoleContext {
  role: RoleDefinition;
  userMemory?: string;
  additionalInstructions?: string;
}

export type RoleCategory = 'development' | 'office' | 'creative' | 'education' | 'custom';