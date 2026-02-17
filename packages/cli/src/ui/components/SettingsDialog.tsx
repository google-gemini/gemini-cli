/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { Text } from 'ink';
import type { Key } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import type { LoadableSettingScope, Settings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { getScopeMessageForSetting } from '../../utils/dialogScopeUtils.js';
import {
  getDialogSettingKeys,
  getDisplayValue,
  getSettingDefinition,
  isDefaultValue,
  getDialogRestartRequiredSettings,
  getEffectiveDefaultValue,
  getEffectiveValue,
  settingExistsInScope,
} from '../../utils/settingsUtils.js';
import {
  useSettingsStore,
  type SettingsState,
} from '../contexts/SettingsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import {
  type SettingsType,
  type SettingsValue,
  TOGGLE_TYPES,
} from '../../config/settingsSchema.js';
import { coreEvents, debugLogger } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import {
  type SettingsDialogItem,
  BaseSettingsDialog,
} from './shared/BaseSettingsDialog.js';
import { useFuzzyList } from '../hooks/useFuzzyList.js';

interface SettingsDialogProps {
  onSelect: (settingName: string | undefined, scope: SettingScope) => void;
  onRestartRequest?: () => void;
  availableTerminalHeight?: number;
  config?: Config;
}

const MAX_ITEMS_TO_SHOW = 8;

type ParseEditResult = { valid: true; value: SettingsValue } | { valid: false };

function getEditValue(
  type: SettingsType,
  rawValue: SettingsValue,
): string | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  if (type === 'array' && Array.isArray(rawValue)) {
    return rawValue.join(', ');
  }

  if (type === 'object' && rawValue !== null && typeof rawValue === 'object') {
    return JSON.stringify(rawValue);
  }

  return undefined;
}

function parseStringArrayValue(input: string): string[] {
  const trimmed = input.trim();
  if (trimmed === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'string')
    ) {
      return parsed;
    }
  } catch {
    // Fall through to comma-delimited parsing.
  }

  return input
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseEditedValue(
  type: SettingsType,
  newValue: string,
): ParseEditResult {
  if (type === 'number') {
    if (newValue.trim() === '') {
      return { valid: false };
    }

    const numParsed = Number(newValue.trim());
    if (Number.isNaN(numParsed)) {
      return { valid: false };
    }

    return { valid: true, value: numParsed };
  }

  if (type === 'array') {
    return { valid: true, value: parseStringArrayValue(newValue) };
  }

  if (type === 'object') {
    const trimmed = newValue.trim();
    if (trimmed === '') {
      return { valid: false };
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        return { valid: true, value: parsed };
      }
    } catch {
      // Invalid JSON object input.
    }

    return { valid: false };
  }

  return { valid: true, value: newValue };
}

function capturePerScopeRestartSnapshot(
  settings: SettingsState,
): Map<string, Map<string, string>> {
  // Map<key, Map<scopeName, json>>
  const snapshot = new Map<string, Map<string, string>>();
  const scopes: Array<[string, Settings]> = [
    ['User', settings.user.settings],
    ['Workspace', settings.workspace.settings],
    ['System', settings.system.settings],
  ];

  for (const key of getDialogRestartRequiredSettings()) {
    const scopeMap = new Map<string, string>();
    for (const [scopeName, scopeSettings] of scopes) {
      // Raw per-scope value (undefined if not in file)
      const value = settingExistsInScope(key, scopeSettings)
        ? getEffectiveValue(key, scopeSettings, {})
        : undefined;
      scopeMap.set(scopeName, JSON.stringify(value));
    }
    snapshot.set(key, scopeMap);
  }
  return snapshot;
}

export function SettingsDialog({
  onSelect,
  onRestartRequest,
  availableTerminalHeight,
  config,
}: SettingsDialogProps): React.JSX.Element {
  // Reactive settings from store (re-renders on any settings change)
  const { settings, setSetting } = useSettingsStore();

  // Get vim mode context to sync vim mode changes
  const { vimEnabled, toggleVimEnabled } = useVimMode();

  // Scope selector state (User by default)
  const [selectedScope, setSelectedScope] = useState<LoadableSettingScope>(
    SettingScope.User,
  );

  // Snapshot restart-required values at mount time for diff tracking
  const [initialRestartValues] = useState(() =>
    capturePerScopeRestartSnapshot(settings),
  );

  const restartChangedKeys = useMemo(() => {
    const changed = new Set<string>();
    const scopes: Array<[string, Settings]> = [
      ['User', settings.user.settings],
      ['Workspace', settings.workspace.settings],
      ['System', settings.system.settings],
    ];

    for (const [key, initialScopeMap] of initialRestartValues) {
      for (const [scopeName, scopeSettings] of scopes) {
        const currentValue = settingExistsInScope(key, scopeSettings)
          ? getEffectiveValue(key, scopeSettings, {})
          : undefined;
        const initialJson = initialScopeMap.get(scopeName);
        if (JSON.stringify(currentValue) !== initialJson) {
          changed.add(key);
          break; // one scope changed is enough
        }
      }
    }
    return changed;
  }, [settings, initialRestartValues]);

  // Derived: whether to show restart prompt
  const showRestartPrompt = restartChangedKeys.size > 0;

  // Generate items for SearchableList
  const settingKeys = useMemo(() => getDialogSettingKeys(), []);

  const items: SettingsDialogItem[] = useMemo(() => {
    const scopeSettings = settings.forScope(selectedScope).settings;
    const mergedSettings = settings.merged;

    return settingKeys.map((key) => {
      const definition = getSettingDefinition(key);
      const type: SettingsType = definition?.type ?? 'string';

      // Get the display value (with * indicator if modified)
      const displayValue = getDisplayValue(
        key,
        scopeSettings,
        mergedSettings,
        restartChangedKeys,
      );

      // Get the scope message (e.g., "(Modified in Workspace)")
      const scopeMessage = getScopeMessageForSetting(
        key,
        selectedScope,
        settings,
      );

      // Check if the value is at default (grey it out)
      const isGreyedOut = isDefaultValue(key, scopeSettings);

      // Get raw value for edit mode initialization
      const rawValue = getEffectiveValue(key, scopeSettings, mergedSettings);
      const editValue = getEditValue(type, rawValue);

      return {
        key,
        label: definition?.label || key,
        description: definition?.description,
        type,
        displayValue,
        isGreyedOut,
        scopeMessage,
        rawValue,
        editValue,
      };
    });
  }, [settingKeys, selectedScope, settings, restartChangedKeys]);

  const { filteredItems, searchBuffer, maxLabelWidth } = useFuzzyList({
    items,
  });

  // Scope selection handler
  const handleScopeChange = useCallback((scope: LoadableSettingScope) => {
    setSelectedScope(scope);
  }, []);

  // Toggle handler for boolean/enum settings
  const handleItemToggle = useCallback(
    (key: string, _item: SettingsDialogItem) => {
      const definition = getSettingDefinition(key);
      if (!TOGGLE_TYPES.has(definition?.type)) {
        return;
      }

      const scopeSettings = settings.forScope(selectedScope).settings;
      const currentValue = getEffectiveValue(
        key,
        scopeSettings,
        settings.merged,
      );
      let newValue: SettingsValue;

      if (definition?.type === 'boolean') {
        if (typeof currentValue !== 'boolean') {
          return;
        }
        newValue = !currentValue;
      } else if (definition?.type === 'enum' && definition.options) {
        const options = definition.options;
        if (options.length === 0) {
          return;
        }
        const currentIndex = options?.findIndex(
          (opt) => opt.value === currentValue,
        );
        if (currentIndex !== -1 && currentIndex < options.length - 1) {
          newValue = options[currentIndex + 1].value;
        } else {
          newValue = options[0].value; // loop back to start.
        }
      } else {
        return;
      }

      debugLogger.log(
        `[DEBUG SettingsDialog] Saving ${key} immediately with value:`,
        newValue,
      );
      setSetting(selectedScope, key, newValue);

      // Special handling for vim mode to sync with VimModeContext
      if (key === 'general.vimMode' && newValue !== vimEnabled) {
        toggleVimEnabled().catch((error) => {
          coreEvents.emitFeedback('error', 'Failed to toggle vim mode:', error);
        });
      }
    },
    [settings, selectedScope, setSetting, vimEnabled, toggleVimEnabled],
  );

  // Edit commit handler
  const handleEditCommit = useCallback(
    (key: string, newValue: string, _item: SettingsDialogItem) => {
      const definition = getSettingDefinition(key);
      const type: SettingsType = definition?.type ?? 'string';
      const parsed = parseEditedValue(type, newValue);

      if (!parsed.valid) {
        return;
      }

      setSetting(selectedScope, key, parsed.value);
    },
    [selectedScope, setSetting],
  );

  // Clear/reset handler - removes the value from settings.json so it falls back to default
  const handleItemClear = useCallback(
    (key: string, _item: SettingsDialogItem) => {
      setSetting(selectedScope, key, undefined);

      // Special handling for vim mode
      if (key === 'general.vimMode') {
        const defaultValue = getEffectiveDefaultValue(key, config);
        const booleanDefaultValue =
          typeof defaultValue === 'boolean' ? defaultValue : false;
        if (booleanDefaultValue !== vimEnabled) {
          toggleVimEnabled().catch((error) => {
            coreEvents.emitFeedback(
              'error',
              'Failed to toggle vim mode:',
              error,
            );
          });
        }
      }
    },
    [config, selectedScope, setSetting, vimEnabled, toggleVimEnabled],
  );

  // Close handler
  const handleClose = useCallback(() => {
    onSelect(undefined, selectedScope as SettingScope);
  }, [onSelect, selectedScope]);

  // Custom key handler for restart key
  const handleKeyPress = useCallback(
    (key: Key, _currentItem: SettingsDialogItem | undefined): boolean => {
      // 'r' key for restart
      if (showRestartPrompt && key.sequence === 'r') {
        if (onRestartRequest) onRestartRequest();
        return true;
      }
      return false;
    },
    [showRestartPrompt, onRestartRequest],
  );

  // Calculate effective max items and scope visibility based on terminal height
  const { effectiveMaxItemsToShow, showScopeSelection, showSearch } =
    useMemo(() => {
      // Only show scope selector if we have a workspace
      const hasWorkspace = settings.workspace.path !== undefined;

      // Search box is hidden when restart prompt is shown to save space and avoid key conflicts
      const shouldShowSearch = !showRestartPrompt;

      if (!availableTerminalHeight) {
        return {
          effectiveMaxItemsToShow: Math.min(MAX_ITEMS_TO_SHOW, items.length),
          showScopeSelection: hasWorkspace,
          showSearch: shouldShowSearch,
        };
      }

      // Layout constants based on BaseSettingsDialog structure:
      // 4 for border (2) and padding (2)
      const DIALOG_PADDING = 4;
      const SETTINGS_TITLE_HEIGHT = 1;
      // 3 for box + 1 for marginTop + 1 for spacing after
      const SEARCH_SECTION_HEIGHT = shouldShowSearch ? 5 : 0;
      const SCROLL_ARROWS_HEIGHT = 2;
      const ITEMS_SPACING_AFTER = 1;
      // 1 for Label + 3 for Scope items + 1 for spacing after
      const SCOPE_SECTION_HEIGHT = hasWorkspace ? 5 : 0;
      const HELP_TEXT_HEIGHT = 1;
      const RESTART_PROMPT_HEIGHT = showRestartPrompt ? 1 : 0;
      const ITEM_HEIGHT = 3; // Label + description + spacing

      const currentAvailableHeight = availableTerminalHeight - DIALOG_PADDING;

      const baseFixedHeight =
        SETTINGS_TITLE_HEIGHT +
        SEARCH_SECTION_HEIGHT +
        SCROLL_ARROWS_HEIGHT +
        ITEMS_SPACING_AFTER +
        HELP_TEXT_HEIGHT +
        RESTART_PROMPT_HEIGHT;

      // Calculate max items with scope selector
      const heightWithScope = baseFixedHeight + SCOPE_SECTION_HEIGHT;
      const availableForItemsWithScope =
        currentAvailableHeight - heightWithScope;
      const maxItemsWithScope = Math.max(
        1,
        Math.floor(availableForItemsWithScope / ITEM_HEIGHT),
      );

      // Calculate max items without scope selector
      const availableForItemsWithoutScope =
        currentAvailableHeight - baseFixedHeight;
      const maxItemsWithoutScope = Math.max(
        1,
        Math.floor(availableForItemsWithoutScope / ITEM_HEIGHT),
      );

      // In small terminals, hide scope selector if it would allow more items to show
      let shouldShowScope = hasWorkspace;
      let maxItems = maxItemsWithScope;

      if (hasWorkspace && availableTerminalHeight < 25) {
        // Hide scope selector if it gains us more than 1 extra item
        if (maxItemsWithoutScope > maxItemsWithScope + 1) {
          shouldShowScope = false;
          maxItems = maxItemsWithoutScope;
        }
      }

      return {
        effectiveMaxItemsToShow: Math.min(maxItems, items.length),
        showScopeSelection: shouldShowScope,
        showSearch: shouldShowSearch,
      };
    }, [
      availableTerminalHeight,
      items.length,
      settings.workspace.path,
      showRestartPrompt,
    ]);

  // Footer content for restart prompt
  const footerContent = showRestartPrompt ? (
    <Text color={theme.status.warning}>
      To see changes, Gemini CLI must be restarted. Press r to exit and apply
      changes now.
    </Text>
  ) : null;

  return (
    <BaseSettingsDialog
      title="Settings"
      borderColor={showRestartPrompt ? theme.status.warning : undefined}
      searchEnabled={showSearch}
      searchBuffer={searchBuffer}
      items={filteredItems}
      showScopeSelector={showScopeSelection}
      selectedScope={selectedScope}
      onScopeChange={handleScopeChange}
      maxItemsToShow={effectiveMaxItemsToShow}
      maxLabelWidth={maxLabelWidth}
      onItemToggle={handleItemToggle}
      onEditCommit={handleEditCommit}
      onItemClear={handleItemClear}
      onClose={handleClose}
      onKeyPress={handleKeyPress}
      footerContent={footerContent}
    />
  );
}
