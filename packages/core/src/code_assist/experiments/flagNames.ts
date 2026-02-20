/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export const ExperimentFlags = {
  CONTEXT_COMPRESSION_THRESHOLD: 45740197,
  USER_CACHING: 45740198,
  BANNER_TEXT_NO_CAPACITY_ISSUES: 45740199,
  BANNER_TEXT_CAPACITY_ISSUES: 45740200,
  ENABLE_PREVIEW: 45740196,
  ENABLE_NUMERICAL_ROUTING: 45750526,
  CLASSIFIER_THRESHOLD: 45750527,
  ENABLE_ADMIN_CONTROLS: 45752213,
  MASKING_PROTECTION_THRESHOLD: 45758817,
  MASKING_PRUNABLE_THRESHOLD: 45758818,
  MASKING_PROTECT_LATEST_TURN: 45758819,

  // Migrated from hardcoded experimental settings
  ENABLE_AGENTS: 45760001,
  EXTENSION_MANAGEMENT: 45760002,
  EXTENSION_CONFIG: 45760003,
  EXTENSION_REGISTRY: 45760004,
  EXTENSION_RELOADING: 45760005,
  JIT_CONTEXT: 45760006,
  USE_OSC52_PASTE: 45760007,
  USE_OSC52_COPY: 45760008,
  PLAN: 45760009,
  MODEL_STEERING: 45760010,
  DISABLE_LLM_CORRECTION: 45760011,
  ENABLE_TOOL_OUTPUT_MASKING: 45760012,
} as const;

export type ExperimentFlagName =
  (typeof ExperimentFlags)[keyof typeof ExperimentFlags];

export interface ExperimentMetadataEntry {
  description: string;
  schema: z.ZodTypeAny;
  defaultValue: unknown;
  hidden?: boolean;
  /** The key used in settings.json (defaults to kebab-case version of flag name) */
  settingKey?: string;
}

export const ExperimentMetadata: Record<number, ExperimentMetadataEntry> = {
  [ExperimentFlags.CONTEXT_COMPRESSION_THRESHOLD]: {
    description: 'Threshold at which context compression activates.',
    schema: z.number(),
    defaultValue: 0,
  },
  [ExperimentFlags.USER_CACHING]: {
    description: 'Enables caching of user contexts.',
    schema: z.boolean(),
    defaultValue: false,
  },
  [ExperimentFlags.BANNER_TEXT_NO_CAPACITY_ISSUES]: {
    description: 'Banner text displayed when there are no capacity issues.',
    schema: z.string(),
    defaultValue: '',
  },
  [ExperimentFlags.BANNER_TEXT_CAPACITY_ISSUES]: {
    description: 'Banner text displayed during capacity issues.',
    schema: z.string(),
    defaultValue: '',
  },
  [ExperimentFlags.ENABLE_PREVIEW]: {
    description: 'Enables preview features globally.',
    schema: z.boolean(),
    defaultValue: false,
  },
  [ExperimentFlags.ENABLE_NUMERICAL_ROUTING]: {
    description: 'Enables numerical routing strategies for the model.',
    schema: z.boolean(),
    defaultValue: false,
  },
  [ExperimentFlags.CLASSIFIER_THRESHOLD]: {
    description: 'Threshold for the intent classifier.',
    schema: z.number(),
    defaultValue: 0.5,
  },
  [ExperimentFlags.ENABLE_ADMIN_CONTROLS]: {
    description: 'Enables admin control features in the CLI.',
    schema: z.boolean(),
    defaultValue: false,
  },
  [ExperimentFlags.MASKING_PROTECTION_THRESHOLD]: {
    description: 'Threshold for masking protection logic.',
    schema: z.number(),
    defaultValue: 0,
    settingKey: 'toolOutputMasking.toolProtectionThreshold',
  },
  [ExperimentFlags.MASKING_PRUNABLE_THRESHOLD]: {
    description: 'Threshold for prunable masking.',
    schema: z.number(),
    defaultValue: 0,
    settingKey: 'toolOutputMasking.minPrunableTokensThreshold',
  },
  [ExperimentFlags.MASKING_PROTECT_LATEST_TURN]: {
    description: 'Protects the latest turn from being masked.',
    schema: z.boolean(),
    defaultValue: true,
    settingKey: 'toolOutputMasking.protectLatestTurn',
  },

  // Migrated settings (marked hidden to keep /experiment list focused)
  [ExperimentFlags.ENABLE_AGENTS]: {
    description: 'Enable local and remote subagents.',
    schema: z.boolean(),
    defaultValue: false,
    hidden: true,
    settingKey: 'enableAgents',
  },
  [ExperimentFlags.EXTENSION_MANAGEMENT]: {
    description: 'Enable extension management features.',
    schema: z.boolean(),
    defaultValue: true,
    hidden: true,
    settingKey: 'extensionManagement',
  },
  [ExperimentFlags.EXTENSION_CONFIG]: {
    description: 'Enable requesting and fetching of extension settings.',
    schema: z.boolean(),
    defaultValue: true,
    hidden: true,
    settingKey: 'extensionConfig',
  },
  [ExperimentFlags.EXTENSION_REGISTRY]: {
    description: 'Enable extension registry explore UI.',
    schema: z.boolean(),
    defaultValue: false,
    hidden: true,
    settingKey: 'extensionRegistry',
  },
  [ExperimentFlags.EXTENSION_RELOADING]: {
    description: 'Enables extension loading/unloading within the CLI session.',
    schema: z.boolean(),
    defaultValue: false,
    hidden: true,
    settingKey: 'extensionReloading',
  },
  [ExperimentFlags.JIT_CONTEXT]: {
    description: 'Enable Just-In-Time (JIT) context loading.',
    schema: z.boolean(),
    defaultValue: false,
    hidden: true,
    settingKey: 'jitContext',
  },
  [ExperimentFlags.USE_OSC52_PASTE]: {
    description: 'Use OSC 52 for pasting.',
    schema: z.boolean(),
    defaultValue: false,
    hidden: true,
    settingKey: 'useOSC52Paste',
  },
  [ExperimentFlags.USE_OSC52_COPY]: {
    description: 'Use OSC 52 for copying.',
    schema: z.boolean(),
    defaultValue: false,
    hidden: true,
    settingKey: 'useOSC52Copy',
  },
  [ExperimentFlags.PLAN]: {
    description: 'Enable planning features (Plan Mode and tools).',
    schema: z.boolean(),
    defaultValue: false,
    hidden: true,
    settingKey: 'plan',
  },
  [ExperimentFlags.MODEL_STEERING]: {
    description: 'Enable model steering (user hints).',
    schema: z.boolean(),
    defaultValue: false,
    hidden: true,
    settingKey: 'modelSteering',
  },
  [ExperimentFlags.DISABLE_LLM_CORRECTION]: {
    description: 'Disable LLM-based error correction for edit tools.',
    schema: z.boolean(),
    defaultValue: true,
    hidden: true,
    settingKey: 'disableLLMCorrection',
  },
  [ExperimentFlags.ENABLE_TOOL_OUTPUT_MASKING]: {
    description: 'Enables tool output masking to save tokens.',
    schema: z.boolean(),
    defaultValue: true,
    hidden: true,
    settingKey: 'toolOutputMasking.enabled',
  },
};

/**
 * Gets the name of an experiment flag from its ID.
 */
export function getExperimentFlagName(flagId: number): string | undefined {
  const metadata = ExperimentMetadata[flagId];
  if (metadata?.settingKey) {
    return metadata.settingKey;
  }

  for (const [name, id] of Object.entries(ExperimentFlags)) {
    if (id === flagId) {
      return name.toLowerCase().replace(/_/g, '-');
    }
  }
  return undefined;
}

/**
 * Gets the ID of an experiment flag from its name (supports kebab-case or camelCase).
 */
export function getExperimentFlagIdFromName(name: string): number | undefined {
  // Check metadata for explicit settingKey matches first
  for (const [idStr, metadata] of Object.entries(ExperimentMetadata)) {
    if (metadata.settingKey === name) {
      return parseInt(idStr, 10);
    }
  }

  // Convert enableNumericalRouting or enable-numerical-routing to ENABLE_NUMERICAL_ROUTING
  const constantName = name
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase to snake_case
    .toUpperCase()
    .replace(/-/g, '_'); // kebab-case to snake_case
  return (ExperimentFlags as Record<string, number>)[constantName];
}
