/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
} as const;

export type ExperimentFlagName =
  (typeof ExperimentFlags)[keyof typeof ExperimentFlags];

export interface ExperimentMetadataEntry {
  description: string;
  type: 'boolean' | 'number' | 'string';
  defaultValue: boolean | number | string;
}

export const ExperimentMetadata: Record<number, ExperimentMetadataEntry> = {
  [ExperimentFlags.CONTEXT_COMPRESSION_THRESHOLD]: {
    description: 'Threshold at which context compression activates.',
    type: 'number',
    defaultValue: 0,
  },
  [ExperimentFlags.USER_CACHING]: {
    description: 'Enables caching of user contexts.',
    type: 'boolean',
    defaultValue: false,
  },
  [ExperimentFlags.BANNER_TEXT_NO_CAPACITY_ISSUES]: {
    description: 'Banner text displayed when there are no capacity issues.',
    type: 'string',
    defaultValue: '',
  },
  [ExperimentFlags.BANNER_TEXT_CAPACITY_ISSUES]: {
    description: 'Banner text displayed during capacity issues.',
    type: 'string',
    defaultValue: '',
  },
  [ExperimentFlags.ENABLE_PREVIEW]: {
    description: 'Enables preview features globally.',
    type: 'boolean',
    defaultValue: false,
  },
  [ExperimentFlags.ENABLE_NUMERICAL_ROUTING]: {
    description: 'Enables numerical routing strategies for the model.',
    type: 'boolean',
    defaultValue: false,
  },
  [ExperimentFlags.CLASSIFIER_THRESHOLD]: {
    description: 'Threshold for the intent classifier.',
    type: 'number',
    defaultValue: 0.5,
  },
  [ExperimentFlags.ENABLE_ADMIN_CONTROLS]: {
    description: 'Enables admin control features in the CLI.',
    type: 'boolean',
    defaultValue: false,
  },
  [ExperimentFlags.MASKING_PROTECTION_THRESHOLD]: {
    description: 'Threshold for masking protection logic.',
    type: 'number',
    defaultValue: 0,
  },
  [ExperimentFlags.MASKING_PRUNABLE_THRESHOLD]: {
    description: 'Threshold for prunable masking.',
    type: 'number',
    defaultValue: 0,
  },
  [ExperimentFlags.MASKING_PROTECT_LATEST_TURN]: {
    description: 'Protects the latest turn from being masked.',
    type: 'boolean',
    defaultValue: true,
  },
};

/**
 * Gets the name of an experiment flag from its ID.
 */
export function getExperimentFlagName(flagId: number): string | undefined {
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
  // Convert enableNumericalRouting or enable-numerical-routing to ENABLE_NUMERICAL_ROUTING
  const constantName = name
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase to snake_case
    .toUpperCase()
    .replace(/-/g, '_'); // kebab-case to snake_case
  return (ExperimentFlags as Record<string, number>)[constantName];
}
