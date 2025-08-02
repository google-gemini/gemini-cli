/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import {
  LoadedSettings,
  SettingScope,
  Settings,
} from '../../config/settings.js';
import { getScopeItems } from '../../utils/dialogScopeUtils.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

interface SettingsDialogProps {
  settings: LoadedSettings;
  onSelect: (settingName: string | undefined, scope: SettingScope) => void;
  onRestartRequest?: () => void;
}

interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}
interface CheckpointingSettings {
  enabled?: boolean;
}
interface FileFilteringSettings {
  respectGitIgnore?: boolean;
  respectGeminiIgnore?: boolean;
  enableRecursiveFileSearch?: boolean;
}

const maxItemsToShow = 8;

export function SettingsDialog({
  settings,
  onSelect,
  onRestartRequest,
}: SettingsDialogProps): React.JSX.Element {
  // Focus state: 'settings' or 'scope'
  const [focusSection, setFocusSection] = useState<'settings' | 'scope'>(
    'settings',
  );
  // Scope selector state (User by default)
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );
  // Active indices
  const [activeSettingIndex, setActiveSettingIndex] = useState(0);
  // Scroll offset for settings
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

  // Local pending settings state for the selected scope
  const [pendingSettings, setPendingSettings] = useState<Settings>(() =>
    // Deep clone to avoid mutation
    structuredClone(settings.forScope(selectedScope).settings),
  );

  // Track which settings have been modified by the user
  const [modifiedSettings, setModifiedSettings] = useState<Set<string>>(
    new Set(),
  );

  // Reset pending settings when scope changes
  useEffect(() => {
    setPendingSettings(
      structuredClone(settings.forScope(selectedScope).settings),
    );
    setModifiedSettings(new Set()); // Reset modified settings when scope changes
  }, [selectedScope, settings]);

  // Helper to get value for a given scope (from pendingSettings)
  const getScopedValue = (key: keyof Settings): boolean | undefined =>
    pendingSettings[key] as boolean | undefined;
  function getScopedNestedValue(
    parentKey: 'accessibility',
    nestedKey: keyof AccessibilitySettings,
  ): boolean | undefined;
  function getScopedNestedValue(
    parentKey: 'checkpointing',
    nestedKey: keyof CheckpointingSettings,
  ): boolean | undefined;
  function getScopedNestedValue(
    parentKey: 'fileFiltering',
    nestedKey: keyof FileFilteringSettings,
  ): boolean | undefined;
  function getScopedNestedValue(
    parentKey: keyof Settings,
    nestedKey: string,
  ): boolean | undefined {
    const parent = pendingSettings[parentKey];
    if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
      return (parent as Record<string, boolean | undefined>)[nestedKey];
    }
    return undefined;
  }

  // Update helpers (update local pendingSettings only)
  const updateAccessibility = (
    key: keyof AccessibilitySettings,
    value: boolean,
  ) => {
    setPendingSettings((prev) => ({
      ...prev,
      accessibility: { ...(prev.accessibility || {}), [key]: value },
    }));
    setModifiedSettings((prev) => new Set(prev).add(`accessibility.${key}`));
    setShowRestartPrompt(true);
  };
  const updateCheckpointing = (
    key: keyof CheckpointingSettings,
    value: boolean,
  ) => {
    setPendingSettings((prev) => ({
      ...prev,
      checkpointing: { ...(prev.checkpointing || {}), [key]: value },
    }));
    setModifiedSettings((prev) => new Set(prev).add(`checkpointing.${key}`));
    setShowRestartPrompt(true);
  };
  const updateFileFiltering = (
    key: keyof FileFilteringSettings,
    value: boolean,
  ) => {
    setPendingSettings((prev) => ({
      ...prev,
      fileFiltering: { ...(prev.fileFiltering || {}), [key]: value },
    }));
    setModifiedSettings((prev) => new Set(prev).add(`fileFiltering.${key}`));
    setShowRestartPrompt(true);
  };
  const updateSetting = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => {
    setPendingSettings((prev) => ({ ...prev, [key]: value }));
    setModifiedSettings((prev) => new Set(prev).add(key as string));
    setShowRestartPrompt(true);
  };

  // List of boolean settings (with default false if undefined)
  const items = [
    {
      label: 'Show Memory Usage',
      value: 'showMemoryUsage',
      checked: getScopedValue('showMemoryUsage') ?? false,
      toggle: () => {
        updateSetting(
          'showMemoryUsage',
          !(getScopedValue('showMemoryUsage') ?? false),
        );
      },
    },
    {
      label: 'Disable Loading Phrases (Accessibility)',
      value: 'accessibility.disableLoadingPhrases',
      checked:
        getScopedNestedValue('accessibility', 'disableLoadingPhrases') ?? false,
      toggle: () => {
        updateAccessibility(
          'disableLoadingPhrases',
          !(
            getScopedNestedValue('accessibility', 'disableLoadingPhrases') ??
            false
          ),
        );
      },
    },
    {
      label: 'Enable Usage Statistics',
      value: 'usageStatisticsEnabled',
      checked: getScopedValue('usageStatisticsEnabled') ?? false,
      toggle: () => {
        updateSetting(
          'usageStatisticsEnabled',
          !(getScopedValue('usageStatisticsEnabled') ?? false),
        );
      },
    },
    {
      label: 'Enable Checkpointing',
      value: 'checkpointing.enabled',
      checked: getScopedNestedValue('checkpointing', 'enabled') ?? false,
      toggle: () => {
        updateCheckpointing(
          'enabled',
          !(getScopedNestedValue('checkpointing', 'enabled') ?? false),
        );
      },
    },
    {
      label: 'Auto Configure Max Old Space Size',
      value: 'autoConfigureMaxOldSpaceSize',
      checked: getScopedValue('autoConfigureMaxOldSpaceSize') ?? false,
      toggle: () => {
        updateSetting(
          'autoConfigureMaxOldSpaceSize',
          !(getScopedValue('autoConfigureMaxOldSpaceSize') ?? false),
        );
      },
    },
    {
      label: 'Respect .gitignore',
      value: 'fileFiltering.respectGitIgnore',
      checked:
        getScopedNestedValue('fileFiltering', 'respectGitIgnore') ?? false,
      toggle: () => {
        updateFileFiltering(
          'respectGitIgnore',
          !(getScopedNestedValue('fileFiltering', 'respectGitIgnore') ?? false),
        );
      },
    },
    {
      label: 'Respect .geminiignore',
      value: 'fileFiltering.respectGeminiIgnore',
      checked:
        getScopedNestedValue('fileFiltering', 'respectGeminiIgnore') ?? false,
      toggle: () => {
        updateFileFiltering(
          'respectGeminiIgnore',
          !(
            getScopedNestedValue('fileFiltering', 'respectGeminiIgnore') ??
            false
          ),
        );
      },
    },
    {
      label: 'Enable Recursive File Search',
      value: 'fileFiltering.enableRecursiveFileSearch',
      checked:
        getScopedNestedValue('fileFiltering', 'enableRecursiveFileSearch') ??
        false,
      toggle: () => {
        updateFileFiltering(
          'enableRecursiveFileSearch',
          !(
            getScopedNestedValue(
              'fileFiltering',
              'enableRecursiveFileSearch',
            ) ?? false
          ),
        );
      },
    },
    {
      label: 'Hide Window Title',
      value: 'hideWindowTitle',
      checked: getScopedValue('hideWindowTitle') ?? false,
      toggle: () => {
        updateSetting(
          'hideWindowTitle',
          !(getScopedValue('hideWindowTitle') ?? false),
        );
      },
    },
    {
      label: 'Hide Tips',
      value: 'hideTips',
      checked: getScopedValue('hideTips') ?? false,
      toggle: () => {
        updateSetting('hideTips', !(getScopedValue('hideTips') ?? false));
      },
    },
    {
      label: 'Hide Banner',
      value: 'hideBanner',
      checked: getScopedValue('hideBanner') ?? false,
      toggle: () => {
        updateSetting('hideBanner', !(getScopedValue('hideBanner') ?? false));
      },
    },
    {
      label: 'IDE Mode',
      value: 'ideMode',
      checked: getScopedValue('ideMode') ?? false,
      toggle: () => {
        updateSetting('ideMode', !(getScopedValue('ideMode') ?? false));
      },
    },
    {
      label: 'Vim Mode',
      value: 'vimMode',
      checked: getScopedValue('vimMode') ?? false,
      toggle: () => {
        updateSetting('vimMode', !(getScopedValue('vimMode') ?? false));
      },
    },
    {
      label: 'Disable Auto Update',
      value: 'disableAutoUpdate',
      checked: getScopedValue('disableAutoUpdate') ?? false,
      toggle: () => {
        updateSetting(
          'disableAutoUpdate',
          !(getScopedValue('disableAutoUpdate') ?? false),
        );
      },
    },
  ];

  // Scope selector items
  const scopeItems = getScopeItems();

  // Scope handling functions (similar to ThemeDialog)
  const handleScopeHighlight = (scope: SettingScope) => {
    setSelectedScope(scope);
  };

  const handleScopeSelect = (scope: SettingScope) => {
    handleScopeHighlight(scope);
    setFocusSection('settings'); // Reset focus to settings section
  };

  // Scroll logic for settings
  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItemsToShow);
  const showScrollUp = scrollOffset > 0;
  const showScrollDown = scrollOffset + maxItemsToShow < items.length;

  useInput((input, key) => {
    if (key.tab) {
      setFocusSection((prev) => (prev === 'settings' ? 'scope' : 'settings'));
    }
    if (focusSection === 'settings') {
      if (key.upArrow || input === 'k') {
        if (activeSettingIndex > 0) {
          setActiveSettingIndex(activeSettingIndex - 1);
          if (activeSettingIndex - 1 < scrollOffset) {
            setScrollOffset(scrollOffset - 1);
          }
        }
      } else if (key.downArrow || input === 'j') {
        if (activeSettingIndex < items.length - 1) {
          setActiveSettingIndex(activeSettingIndex + 1);
          if (activeSettingIndex + 1 >= scrollOffset + maxItemsToShow) {
            setScrollOffset(scrollOffset + 1);
          }
        }
      } else if (key.return || input === ' ') {
        visibleItems[activeSettingIndex - scrollOffset]?.toggle();
      }
    }
    if (showRestartPrompt && input === 'r') {
      // Commit only modified settings to real settings
      const scope = selectedScope;
      const pending = pendingSettings;

      // Only save settings that have been modified by the user and are not default values
      modifiedSettings.forEach((settingKey) => {
        const [parentKey, childKey] = settingKey.includes('.')
          ? settingKey.split('.')
          : [settingKey, undefined];

        if (childKey) {
          // Nested setting (e.g., accessibility.disableLoadingPhrases)
          const parentValue = pending[parentKey as keyof Settings];
          if (parentValue && typeof parentValue === 'object') {
            const childValue = (parentValue as Record<string, unknown>)[
              childKey
            ];
            if (childValue !== undefined) {
              // Check if this setting already exists in the original file
              const originalParent =
                settings.forScope(scope).settings[parentKey as keyof Settings];
              const existsInOriginalFile =
                originalParent &&
                typeof originalParent === 'object' &&
                originalParent !== null &&
                childKey in originalParent;

              // Save if it exists in original file OR if it's not the default value
              const isDefaultValue = childValue === false;
              if (existsInOriginalFile || !isDefaultValue) {
                const currentParent =
                  settings.forScope(scope).settings[
                    parentKey as keyof Settings
                  ];
                const parentObject =
                  currentParent && typeof currentParent === 'object'
                    ? (currentParent as Record<string, unknown>)
                    : {};
                settings.setValue(scope, parentKey as keyof Settings, {
                  ...parentObject,
                  [childKey]: childValue,
                });
              }
            }
          }
        } else {
          // Top-level setting
          const value = pending[parentKey as keyof Settings];
          if (value !== undefined) {
            // Check if this setting already exists in the original file
            const existsInOriginalFile =
              settings.forScope(scope).settings[parentKey as keyof Settings] !==
              undefined;

            // Save if it exists in original file OR if it's not the default value
            const isDefaultValue = value === false;
            if (existsInOriginalFile || !isDefaultValue) {
              settings.setValue(scope, parentKey as keyof Settings, value);
            }
          }
        }
      });

      setShowRestartPrompt(false);
      if (onRestartRequest) onRestartRequest();
    }
    if (key.escape) {
      onSelect(undefined, selectedScope);
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="row"
      padding={1}
      width="100%"
      height="100%"
    >
      {/* Settings List */}
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color={Colors.AccentBlue}>
          Settings
        </Text>
        <Box height={1} />
        {showScrollUp && <Text color={Colors.Gray}>▲</Text>}
        {visibleItems.map((item, idx) => {
          const isActive =
            focusSection === 'settings' &&
            activeSettingIndex === idx + scrollOffset;

          // Check if setting exists in original settings file for this scope
          const [parentKey, childKey] = item.value.includes('.')
            ? item.value.split('.')
            : [item.value, undefined];

          let existsInOriginalFile = false;
          if (childKey) {
            // Nested setting
            const originalParent =
              settings.forScope(selectedScope).settings[
                parentKey as keyof Settings
              ];
            existsInOriginalFile = !!(
              originalParent &&
              typeof originalParent === 'object' &&
              originalParent !== null &&
              childKey in originalParent
            );
          } else {
            // Top-level setting
            existsInOriginalFile =
              settings.forScope(selectedScope).settings[
                parentKey as keyof Settings
              ] !== undefined;
          }

          // Show value if it exists in original file OR if user modified it in this session
          const shouldShowValue =
            existsInOriginalFile || modifiedSettings.has(item.value);
          const displayValue: string = shouldShowValue
            ? String(item.checked ?? false)
            : 'undefined';

          return (
            <React.Fragment key={item.value}>
              <Box flexDirection="row" alignItems="center">
                <Box minWidth={2} flexShrink={0}>
                  <Text color={isActive ? Colors.AccentGreen : Colors.Gray}>
                    {isActive ? '●' : ''}
                  </Text>
                </Box>
                <Box minWidth={50}>
                  <Text
                    color={isActive ? Colors.AccentGreen : Colors.Foreground}
                  >
                    {item.label}
                  </Text>
                </Box>
                <Box minWidth={3} />
                <Text color={isActive ? Colors.AccentGreen : Colors.Gray}>
                  {displayValue}
                </Text>
              </Box>
              <Box height={1} />
            </React.Fragment>
          );
        })}
        {showScrollDown && <Text color={Colors.Gray}>▼</Text>}

        <Box height={1} />

        {/* Apply To Section - Using RadioButtonSelect like ThemeDialog */}
        <Box marginTop={1} flexDirection="column">
          <Text bold={focusSection === 'scope'} wrap="truncate">
            {focusSection === 'scope' ? '> ' : '  '}Apply To
          </Text>
          <RadioButtonSelect
            items={scopeItems}
            initialIndex={0} // Default to User Settings
            onSelect={handleScopeSelect}
            onHighlight={handleScopeHighlight}
            isFocused={focusSection === 'scope'}
            showNumbers={focusSection === 'scope'}
          />
        </Box>

        <Box height={1} />
        <Text color={Colors.Gray}>
          (Use Enter to select, Tab to change focus)
        </Text>
        {showRestartPrompt && (
          <Text color={Colors.AccentYellow}>
            To see changes, Gemini CLI must be restarted. Press r to exit and
            apply changes now.
          </Text>
        )}
      </Box>
    </Box>
  );
}
