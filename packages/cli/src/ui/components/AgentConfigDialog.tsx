/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type {
  LoadableSettingScope,
  LoadedSettings,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import type { AgentDefinition, AgentOverride } from '@google/gemini-cli-core';
import { getCachedStringWidth } from '../utils/textUtils.js';
import {
  BaseSettingsDialog,
  type SettingsDialogItem,
} from './shared/BaseSettingsDialog.js';

/**
 * Configuration field definition for agent settings
 */
interface AgentConfigField {
  key: string;
  label: string;
  description: string;
  type: 'boolean' | 'number' | 'string';
  path: string[]; // Path within AgentOverride, e.g., ['modelConfig', 'generateContentConfig', 'temperature']
  defaultValue: boolean | number | string | undefined;
}

/**
 * Agent configuration fields
 */
const AGENT_CONFIG_FIELDS: AgentConfigField[] = [
  {
    key: 'enabled',
    label: 'Enabled',
    description: 'Enable or disable this agent',
    type: 'boolean',
    path: ['enabled'],
    defaultValue: true,
  },
  {
    key: 'model',
    label: 'Model',
    description: "Model to use (e.g., 'gemini-2.0-flash' or 'inherit')",
    type: 'string',
    path: ['modelConfig', 'model'],
    defaultValue: 'inherit',
  },
  {
    key: 'temperature',
    label: 'Temperature',
    description: 'Sampling temperature (0.0 to 2.0)',
    type: 'number',
    path: ['modelConfig', 'generateContentConfig', 'temperature'],
    defaultValue: undefined,
  },
  {
    key: 'topP',
    label: 'Top P',
    description: 'Nucleus sampling parameter (0.0 to 1.0)',
    type: 'number',
    path: ['modelConfig', 'generateContentConfig', 'topP'],
    defaultValue: undefined,
  },
  {
    key: 'topK',
    label: 'Top K',
    description: 'Top-K sampling parameter',
    type: 'number',
    path: ['modelConfig', 'generateContentConfig', 'topK'],
    defaultValue: undefined,
  },
  {
    key: 'maxOutputTokens',
    label: 'Max Output Tokens',
    description: 'Maximum number of tokens to generate',
    type: 'number',
    path: ['modelConfig', 'generateContentConfig', 'maxOutputTokens'],
    defaultValue: undefined,
  },
  {
    key: 'maxTimeMinutes',
    label: 'Max Time (minutes)',
    description: 'Maximum execution time in minutes',
    type: 'number',
    path: ['runConfig', 'maxTimeMinutes'],
    defaultValue: undefined,
  },
  {
    key: 'maxTurns',
    label: 'Max Turns',
    description: 'Maximum number of conversational turns',
    type: 'number',
    path: ['runConfig', 'maxTurns'],
    defaultValue: undefined,
  },
];

interface AgentConfigDialogProps {
  agentName: string;
  displayName: string;
  definition: AgentDefinition;
  settings: LoadedSettings;
  onClose: () => void;
  onSave?: () => void;
}

/**
 * Get a nested value from an object using a path array
 */
function getNestedValue(
  obj: Record<string, unknown> | undefined,
  path: string[],
): unknown {
  if (!obj) return undefined;
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Set a nested value in an object using a path array, creating intermediate objects as needed
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  const result = { ...obj };
  let current = result;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === undefined || current[key] === null) {
      current[key] = {};
    } else {
      current[key] = { ...(current[key] as Record<string, unknown>) };
    }
    current = current[key] as Record<string, unknown>;
  }

  const finalKey = path[path.length - 1];
  if (value === undefined) {
    delete current[finalKey];
  } else {
    current[finalKey] = value;
  }

  return result;
}

/**
 * Get the effective default value for a field from the agent definition
 */
function getFieldDefaultFromDefinition(
  field: AgentConfigField,
  definition: AgentDefinition,
): unknown {
  if (definition.kind !== 'local') return field.defaultValue;

  if (field.key === 'enabled') {
    return !definition.experimental; // Experimental agents default to disabled
  }
  if (field.key === 'model') {
    return definition.modelConfig?.model ?? 'inherit';
  }
  if (field.key === 'temperature') {
    return definition.modelConfig?.generateContentConfig?.temperature;
  }
  if (field.key === 'topP') {
    return definition.modelConfig?.generateContentConfig?.topP;
  }
  if (field.key === 'topK') {
    return definition.modelConfig?.generateContentConfig?.topK;
  }
  if (field.key === 'maxOutputTokens') {
    return definition.modelConfig?.generateContentConfig?.maxOutputTokens;
  }
  if (field.key === 'maxTimeMinutes') {
    return definition.runConfig?.maxTimeMinutes;
  }
  if (field.key === 'maxTurns') {
    return definition.runConfig?.maxTurns;
  }

  return field.defaultValue;
}

export function AgentConfigDialog({
  agentName,
  displayName,
  definition,
  settings,
  onClose,
  onSave,
}: AgentConfigDialogProps): React.JSX.Element {
  // Scope selector state (User by default)
  const [selectedScope, setSelectedScope] = useState<LoadableSettingScope>(
    SettingScope.User,
  );

  // Pending override state for the selected scope
  const [pendingOverride, setPendingOverride] = useState<AgentOverride>(() => {
    const scopeSettings = settings.forScope(selectedScope).settings;
    const existingOverride = scopeSettings.agents?.overrides?.[agentName];
    return existingOverride ? structuredClone(existingOverride) : {};
  });

  // Track which fields have been modified
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());

  // Update pending override when scope changes
  useEffect(() => {
    const scopeSettings = settings.forScope(selectedScope).settings;
    const existingOverride = scopeSettings.agents?.overrides?.[agentName];
    setPendingOverride(
      existingOverride ? structuredClone(existingOverride) : {},
    );
    setModifiedFields(new Set());
  }, [selectedScope, settings, agentName]);

  /**
   * Save a specific field value to settings
   */
  const saveFieldValue = useCallback(
    (fieldKey: string, path: string[], value: unknown) => {
      // Guard against prototype pollution
      if (['__proto__', 'constructor', 'prototype'].includes(agentName)) {
        return;
      }
      // Build the full settings path for agent override
      // e.g., agents.overrides.<agentName>.modelConfig.generateContentConfig.temperature
      const settingsPath = ['agents', 'overrides', agentName, ...path].join(
        '.',
      );
      settings.setValue(selectedScope, settingsPath, value);
      onSave?.();
    },
    [settings, selectedScope, agentName, onSave],
  );

  // Calculate max label width
  const maxLabelWidth = useMemo(() => {
    let max = 0;
    for (const field of AGENT_CONFIG_FIELDS) {
      const lWidth = getCachedStringWidth(field.label);
      const dWidth = getCachedStringWidth(field.description);
      max = Math.max(max, lWidth, dWidth);
    }
    return max;
  }, []);

  // Generate items for BaseSettingsDialog
  const items: SettingsDialogItem[] = useMemo(
    () =>
      AGENT_CONFIG_FIELDS.map((field) => {
        const currentValue = getNestedValue(
          pendingOverride as Record<string, unknown>,
          field.path,
        );
        const defaultValue = getFieldDefaultFromDefinition(field, definition);
        const effectiveValue =
          currentValue !== undefined ? currentValue : defaultValue;

        let displayValue: string;
        if (field.type === 'boolean') {
          displayValue = effectiveValue ? 'true' : 'false';
        } else if (effectiveValue !== undefined && effectiveValue !== null) {
          displayValue = String(effectiveValue);
        } else {
          displayValue = '(default)';
        }

        // Add * if modified
        const isModified =
          modifiedFields.has(field.key) || currentValue !== undefined;
        if (isModified && currentValue !== undefined) {
          displayValue += '*';
        }

        // Get raw value for edit mode
        const rawValue =
          currentValue !== undefined ? currentValue : effectiveValue;

        return {
          key: field.key,
          label: field.label,
          description: field.description,
          type: field.type,
          displayValue,
          isGreyedOut: currentValue === undefined,
          scopeMessage: undefined,
          rawValue: rawValue as string | number | boolean | undefined,
        };
      }),
    [pendingOverride, definition, modifiedFields],
  );

  const maxItemsToShow = 8;

  // Handle scope changes
  const handleScopeChange = useCallback((scope: LoadableSettingScope) => {
    setSelectedScope(scope);
  }, []);

  // Handle toggle for boolean fields
  const handleItemToggle = useCallback(
    (key: string, _item: SettingsDialogItem) => {
      const field = AGENT_CONFIG_FIELDS.find((f) => f.key === key);
      if (!field || field.type !== 'boolean') return;

      const currentValue = getNestedValue(
        pendingOverride as Record<string, unknown>,
        field.path,
      );
      const defaultValue = getFieldDefaultFromDefinition(field, definition);
      const effectiveValue =
        currentValue !== undefined ? currentValue : defaultValue;
      const newValue = !effectiveValue;

      const newOverride = setNestedValue(
        pendingOverride as Record<string, unknown>,
        field.path,
        newValue,
      ) as AgentOverride;

      setPendingOverride(newOverride);
      setModifiedFields((prev) => new Set(prev).add(key));

      // Save the field value to settings
      saveFieldValue(field.key, field.path, newValue);
    },
    [pendingOverride, definition, saveFieldValue],
  );

  // Handle edit commit for string/number fields
  const handleEditCommit = useCallback(
    (key: string, newValue: string, _item: SettingsDialogItem) => {
      const field = AGENT_CONFIG_FIELDS.find((f) => f.key === key);
      if (!field) return;

      let parsed: string | number | undefined;
      if (field.type === 'number') {
        if (newValue.trim() === '') {
          // Empty means clear the override
          parsed = undefined;
        } else {
          const numParsed = Number(newValue.trim());
          if (Number.isNaN(numParsed)) {
            // Invalid number; don't save
            return;
          }
          parsed = numParsed;
        }
      } else {
        // For strings, empty means clear the override
        parsed = newValue.trim() === '' ? undefined : newValue;
      }

      // Update pending override locally
      const newOverride = setNestedValue(
        pendingOverride as Record<string, unknown>,
        field.path,
        parsed,
      ) as AgentOverride;

      setPendingOverride(newOverride);
      setModifiedFields((prev) => new Set(prev).add(key));

      // Save the field value to settings
      saveFieldValue(field.key, field.path, parsed);
    },
    [pendingOverride, saveFieldValue],
  );

  // Handle clear/reset - reset to default value (removes override)
  const handleItemClear = useCallback(
    (key: string, _item: SettingsDialogItem) => {
      const field = AGENT_CONFIG_FIELDS.find((f) => f.key === key);
      if (!field) return;

      // Remove the override (set to undefined)
      const newOverride = setNestedValue(
        pendingOverride as Record<string, unknown>,
        field.path,
        undefined,
      ) as AgentOverride;

      setPendingOverride(newOverride);
      setModifiedFields((prev) => {
        const updated = new Set(prev);
        updated.delete(key);
        return updated;
      });

      // Save as undefined to remove the override
      saveFieldValue(field.key, field.path, undefined);
    },
    [pendingOverride, saveFieldValue],
  );

  // Footer content
  const footerContent =
    modifiedFields.size > 0 ? (
      <Text color={theme.text.secondary}>Changes saved automatically.</Text>
    ) : null;

  return (
    <BaseSettingsDialog
      title={`Configure: ${displayName}`}
      searchEnabled={false}
      items={items}
      showScopeSelector={true}
      selectedScope={selectedScope}
      onScopeChange={handleScopeChange}
      maxItemsToShow={maxItemsToShow}
      maxLabelWidth={maxLabelWidth}
      onItemToggle={handleItemToggle}
      onEditCommit={handleEditCommit}
      onItemClear={handleItemClear}
      onClose={onClose}
      footerContent={footerContent}
    />
  );
}
