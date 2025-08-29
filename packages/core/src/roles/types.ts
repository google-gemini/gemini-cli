/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProviderType } from '../providers/types.js';

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  category: RoleCategory;
  icon?: string;
  tools?: string[];
  modelPreferences?: {
    preferred: ModelProviderType[];
    fallback: ModelProviderType;
  };
}

export interface RoleContext {
  role: RoleDefinition;
  userMemory?: string;
  additionalInstructions?: string;
}

export type RoleCategory = 'development' | 'office' | 'creative' | 'education' | 'custom';