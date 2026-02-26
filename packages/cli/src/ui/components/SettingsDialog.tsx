/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Text } from 'ink';
import { AsyncFzf } from 'fzf';
import type { Key } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import type {
  LoadableSettingScope,
  LoadedSettings,
  Settings,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { getScopeMessageForSetting } from '../../utils/dialogScopeUtils.js';
import {
  getDialogSettingKeys,
  setPendingSettingValue,
  getDisplayValue,
  hasRestartRequiredSettings,
  saveModifiedSettings,
  getSettingDefinition,
  isDefaultValue,
  requiresRestart,
  getRestartRequiredFromModified,
  getEffectiveDefaultValue,
  setPendingSettingValueAny,
  getEffectiveValue,
} from '../../utils/settingsUtils.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { getCachedStringWidth } from '../utils/textUtils.js';
import {
  type SettingsValue,
  TOGGLE_TYPES,
} from '../../config/settingsSchema.js';
import { coreEvents, debugLogger } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';

import { useSearchBuffer } from '../hooks/useSearchBuffer.js';
import {
  BaseSettingsDialog,
  type SettingsDialogItem,
} from './shared/BaseSettingsDialog.js';

interface FzfResult {
  item: string;
  start: number;
  end: number;
  score: number;
  positions?: number[];
}

interface SettingsDialogProps {
  settings: LoadedSettings;
  onSelect: (settingName: string | undefined, scope: SettingScope) => void;
  onRestartRequest?: () => void;
  availableTerminalHeight?: number;
  config?: Config;
}

const MAX_ITEMS_TO_SHOW = 8;

export function SettingsDialog({
  settings,
  onSelect,
  onRestartRequest,
  availableTerminalHeight,
  config,
}: SettingsDialogProps): React.JSX.Element {
  // Get vim mode context to sync vim mode changes
  const { vimEnabled, toggleVimEnabled } = useVimMode();

  // Scope selector state (User by default)
  const [selectedScope, setSelectedScope] = useState<LoadableSettingScope>(
    SettingScope.User,
  );

  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredKeys, setFilteredKeys] = useState<string[]>(() =>
    getDialogSettingKeys(),
  );
  const { fzfInstance, searchMap } = useMemo(() => {
    const keys = getDialogSettingKeys();
    const map = new Map<string, string>();
    const searchItems: string[] = [];

    keys.forEach((key) => {
      const def = getSettingDefinition(key);
      if (def?.label) {
        searchItems.push(def.label);
        map.set(def.label.toLowerCase(), key);
      }
    });

    const fzf = new AsyncFzf(searchItems, {
      fuzzy: 'v2',
      casing: 'case-insensitive',
    });
    return { fzfInstance: fzf, searchMap: map };
  }, []);

  // Perform search
  useEffect(() => {
    let active = true;
    if (!searchQuery.trim() || !fzfInstance) {
      setFilteredKeys(getDialogSettingKeys());
      return;
    }

    const doSearch = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const results = await fzfInstance.find(searchQuery);

      if (!active) return;

      const matchedKeys = new Set<string>();
      results.forEach((res: FzfResult) => {
        const key = searchMap.get(res.item.toLowerCase());
        if (key) matchedKeys.add(key);
      });
      setFilteredKeys(Array.from(matchedKeys));
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    doSearch();

    return () => {
      active = false;
    };
  }, [searchQuery, fzfInstance, searchMap]);

  // Local pending settings state for the selected scope
  const [pendingSettings, setPendingSettings] = useState<Settings>(() =>
    // Deep clone to avoid mutation
    structuredClone(settings.forScope(selectedScope).settings),
  );

  // Track which settings have been modified by the user
  const [modifiedSettings, setModifiedSettings] = useState<Set<string>>(
    new Set(),
  );

  // Preserve pending changes across scope switches
  type PendingValue = boolean | number | string;
  const [globalPendingChanges, setGlobalPendingChanges] = useState<
    Map<string, PendingValue>
  >(new Map());

  // Track restart-required settings across scope changes
  const [_restartRequiredSettings, setRestartRequiredSettings] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    // Base settings for selected scope
    let updated = structuredClone(settings.forScope(selectedScope).settings);
    // Overlay globally pending (unsaved) changes so user sees their modifications in any scope
    const newModified = new Set<string>();
    const newRestartRequired = new Set<string>();
    for (const [key, value] of globalPendingChanges.entries()) {
      const def = getSettingDefinition(key);
      if (def?.type === 'boolean' && typeof value === 'boolean') {
        updated = setPendingSettingValue(key, value, updated);
      } else if (
        (def?.type === 'number' && typeof value === 'number') ||
        (def?.type === 'string' && typeof value === 'string')
      ) {
        updated = setPendingSettingValueAny(key, value, updated);
      }
      newModified.add(key);
      if (requiresRestart(key)) newRestartRequired.add(key);
    }
    setPendingSettings(updated);
    setModifiedSettings(newModified);
    setRestartRequiredSettings(newRestartRequired);
    setShowRestartPrompt(newRestartRequired.size > 0);
  }, [selectedScope, settings, globalPendingChanges]);

  // Calculate max width for the left column (Label/Description) to keep values aligned or close
  const maxLabelOrDescriptionWidth = useMemo(() => {
    const allKeys = getDialogSettingKeys();
    let max = 0;
    for (const key of allKeys) {
      const def = getSettingDefinition(key);
      if (!def) continue;

      const scopeMessage = getScopeMessageForSetting(
        key,
        selectedScope,
        settings,
      );
      const label = def.label || key;
      const labelFull = label + (scopeMessage ? ` ${scopeMessage}` : '');
      const lWidth = getCachedStringWidth(labelFull);
      const dWidth = def.description
        ? getCachedStringWidth(def.description)
        : 0;

      max = Math.max(max, lWidth, dWidth);
    }
    return max;
  }, [selectedScope, settings]);

  // Search input buffer
  const searchBuffer = useSearchBuffer({
    initialText: '',
    onChange: setSearchQuery,
  });

  // Generate items for BaseSettingsDialog
  const settingKeys = searchQuery ? filteredKeys : getDialogSettingKeys();
  const items: SettingsDialogItem[] = useMemo(() => {
    const scopeSettings = settings.forScope(selectedScope).settings;
    const mergedSettings = settings.merged;

    return settingKeys.map((key) => {
      const definition = getSettingDefinition(key);
      const type = definition?.type ?? 'string';

      // Get the display value (with * indicator if modified)
      const displayValue = getDisplayValue(
        key,
        scopeSettings,
        mergedSettings,
        modifiedSettings,
        pendingSettings,
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
      const rawValue = getEffectiveValue(key, pendingSettings, {});

      return {
        key,
        label: definition?.label || key,
        description: definition?.description,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        type: type as 'boolean' | 'number' | 'string' | 'enum',
        displayValue,
        isGreyedOut,
        scopeMessage,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        rawValue: rawValue as string | number | boolean | undefined,
      };
    });
  }, [settingKeys, selectedScope, settings, modifiedSettings, pendingSettings]);

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
      const currentValue = getEffectiveValue(key, pendingSettings, {});
      let newValue: SettingsValue;
      if (definition?.type === 'boolean') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        newValue = !(currentValue as boolean);
        setPendingSettings((prev) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          setPendingSettingValue(key, newValue as boolean, prev),
        );
      } else if (definition?.type === 'enum' && definition.options) {
        const options = definition.options;
        const currentIndex = options?.findIndex(
          (opt) => opt.value === currentValue,
        );
        if (currentIndex !== -1 && currentIndex < options.length - 1) {
          newValue = options[currentIndex + 1].value;
        } else {
          newValue = options[0].value; // loop back to start.
        }
        setPendingSettings((prev) =>
          setPendingSettingValueAny(key, newValue, prev),
        );
      }

      if (!requiresRestart(key)) {
        const immediateSettings = new Set([key]);
        const currentScopeSettings = settings.forScope(selectedScope).settings;
        const immediateSettingsObject = setPendingSettingValueAny(
          key,
          newValue,
          currentScopeSettings,
        );
        debugLogger.log(
          `[DEBUG SettingsDialog] Saving ${key} immediately with value:`,
          newValue,
        );
        saveModifiedSettings(
          immediateSettings,
          immediateSettingsObject,
          settings,
          selectedScope,
        );

        // Special handling for vim mode to sync with VimModeContext
        if (key === 'general.vimMode' && newValue !== vimEnabled) {
          // Call toggleVimEnabled to sync the VimModeContext local state
          toggleVimEnabled().catch((error) => {
            coreEvents.emitFeedback(
              'error',
              'Failed to toggle vim mode:',
              error,
            );
          });
        }

        // Remove from modifiedSettings since it's now saved
        setModifiedSettings((prev) => {
          const updated = new Set(prev);
          updated.delete(key);
          return updated;
        });

        // Also remove from restart-required settings if it was there
        setRestartRequiredSettings((prev) => {
          const updated = new Set(prev);
          updated.delete(key);
          return updated;
        });

        // Remove from global pending changes if present
        setGlobalPendingChanges((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      } else {
        // For restart-required settings, track as modified
        setModifiedSettings((prev) => {
          const updated = new Set(prev).add(key);
          const needsRestart = hasRestartRequiredSettings(updated);
          debugLogger.log(
            `[DEBUG SettingsDialog] Modified settings:`,
            Array.from(updated),
            'Needs restart:',
            needsRestart,
          );
          if (needsRestart) {
            setShowRestartPrompt(true);
            setRestartRequiredSettings((prevRestart) =>
              new Set(prevRestart).add(key),
            );
          }
          return updated;
        });

        // Record pending change globally
        setGlobalPendingChanges((prev) => {
          const next = new Map(prev);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          next.set(key, newValue as PendingValue);
          return next;
        });
      }
    },
    [pendingSettings, settings, selectedScope, vimEnabled, toggleVimEnabled],
  );

  // Edit commit handler
  const handleEditCommit = useCallback(
    (key: string, newValue: string, _item: SettingsDialogItem) => {
      const definition = getSettingDefinition(key);
      const type = definition?.type;

      if (newValue.trim() === '' && type === 'number') {
        // Nothing entered for a number; cancel edit
        return;
      }

      let parsed: string | number;
      if (type === 'number') {
        const numParsed = Number(newValue.trim());
        if (Number.isNaN(numParsed)) {
          // Invalid number; cancel edit
          return;
        }
        parsed = numParsed;
      } else {
        // For strings, use the buffer as is.
        parsed = newValue;
      }

      // Update pending
      setPendingSettings((prev) =>
        setPendingSettingValueAny(key, parsed, prev),
      );

      if (!requiresRestart(key)) {
        const immediateSettings = new Set([key]);
        const currentScopeSettings = settings.forScope(selectedScope).settings;
        const immediateSettingsObject = setPendingSettingValueAny(
          key,
          parsed,
          currentScopeSettings,
        );
        saveModifiedSettings(
          immediateSettings,
          immediateSettingsObject,
          settings,
          selectedScope,
        );

        // Remove from modified sets if present
        setModifiedSettings((prev) => {
          const updated = new Set(prev);
          updated.delete(key);
          return updated;
        });
        setRestartRequiredSettings((prev) => {
          const updated = new Set(prev);
          updated.delete(key);
          return updated;
        });

        // Remove from global pending since it's immediately saved
        setGlobalPendingChanges((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      } else {
        // Mark as modified and needing restart
        setModifiedSettings((prev) => {
          const updated = new Set(prev).add(key);
          const needsRestart = hasRestartRequiredSettings(updated);
          if (needsRestart) {
            setShowRestartPrompt(true);
            setRestartRequiredSettings((prevRestart) =>
              new Set(prevRestart).add(key),
            );
          }
          return updated;
        });

        // Record pending change globally for persistence across scopes
        setGlobalPendingChanges((prev) => {
          const next = new Map(prev);
          next.set(key, parsed as PendingValue);
          return next;
        });
      }
    },
    [settings, selectedScope],
  );

  // Clear/reset handler - removes the value from settings.json so it falls back to default
  const handleItemClear = useCallback(
    (key: string, _item: SettingsDialogItem) => {
      const defaultValue = getEffectiveDefaultValue(key, config);

      // Update local pending state to show the default value
      if (typeof defaultValue === 'boolean') {
        setPendingSettings((prev) =>
          setPendingSettingValue(key, defaultValue, prev),
        );
      } else if (
        typeof defaultValue === 'number' ||
        typeof defaultValue === 'string'
      ) {
        setPendingSettings((prev) =>
          setPendingSettingValueAny(key, defaultValue, prev),
        );
      }

      // Clear the value from settings.json (set to undefined to remove the key)
      if (!requiresRestart(key)) {
        settings.setValue(selectedScope, key, undefined);

        // Special handling for vim mode
        if (key === 'general.vimMode') {
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
      }

      // Remove from modified sets
      setModifiedSettings((prev) => {
        const updated = new Set(prev);
        updated.delete(key);
        return updated;
      });
      setRestartRequiredSettings((prev) => {
        const updated = new Set(prev);
        updated.delete(key);
        return updated;
      });
      setGlobalPendingChanges((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      // Update restart prompt
      setShowRestartPrompt((_prev) => {
        const remaining = getRestartRequiredFromModified(modifiedSettings);
        return remaining.filter((k) => k !== key).length > 0;
      });
    },
    [
      config,
      settings,
      selectedScope,
      vimEnabled,
      toggleVimEnabled,
      modifiedSettings,
    ],
  );

  const saveRestartRequiredSettings = useCallback(() => {
    const restartRequiredSettings =
      getRestartRequiredFromModified(modifiedSettings);
    const restartRequiredSet = new Set(restartRequiredSettings);

    if (restartRequiredSet.size > 0) {
      saveModifiedSettings(
        restartRequiredSet,
        pendingSettings,
        settings,
        selectedScope,
      );

      // Remove saved keys from global pending changes
      setGlobalPendingChanges((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const key of restartRequiredSet) {
          next.delete(key);
        }
        return next;
      });
    }
  }, [modifiedSettings, pendingSettings, settings, selectedScope]);

  // Close handler
  const handleClose = useCallback(() => {
    // Save any restart-required settings before closing
    saveRestartRequiredSettings();
    onSelect(undefined, selectedScope as SettingScope);
  }, [saveRestartRequiredSettings, onSelect, selectedScope]);

  // Custom key handler for restart key
  const handleKeyPress = useCallback(
    (key: Key, _currentItem: SettingsDialogItem | undefined): boolean => {
      // 'r' key for restart
      if (showRestartPrompt && key.sequence === 'r') {
        saveRestartRequiredSettings();
        setShowRestartPrompt(false);
        setModifiedSettings(new Set());
        setRestartRequiredSettings(new Set());
        if (onRestartRequest) onRestartRequest();
        return true;
      }
      return false;
    },
    [showRestartPrompt, onRestartRequest, saveRestartRequiredSettings],
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
      items={items}
      showScopeSelector={showScopeSelection}
      selectedScope={selectedScope}
      onScopeChange={handleScopeChange}
      maxItemsToShow={effectiveMaxItemsToShow}
      maxLabelWidth={maxLabelOrDescriptionWidth}
      onItemToggle={handleItemToggle}
      onEditCommit={handleEditCommit}
      onItemClear={handleItemClear}
      onClose={handleClose}
      onKeyPress={handleKeyPress}
      footerContent={footerContent}
    />
  );
}
