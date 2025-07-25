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

const SCOPE_LABELS = {
  [SettingScope.User]: 'User Settings',
  [SettingScope.Workspace]: 'Workspace Settings',
  [SettingScope.System]: 'System Settings',
};

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
  const [activeScopeIndex, setActiveScopeIndex] = useState(0);
  // Scroll offset for settings
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

  // Local pending settings state for the selected scope
  const [pendingSettings, setPendingSettings] = useState<Settings>(() => {
    // Deep clone to avoid mutation
    return JSON.parse(
      JSON.stringify(settings.forScope(selectedScope).settings),
    );
  });

  // Reset pending settings when scope changes
  useEffect(() => {
    setPendingSettings(
      JSON.parse(JSON.stringify(settings.forScope(selectedScope).settings)),
    );
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
    setShowRestartPrompt(true);
  };
  const updateSetting = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => {
    setPendingSettings((prev) => ({ ...prev, [key]: value }));
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
  ];

  // Scope selector items
  const scopeItems = [
    { label: SCOPE_LABELS[SettingScope.User], value: SettingScope.User },
    {
      label: SCOPE_LABELS[SettingScope.Workspace],
      value: SettingScope.Workspace,
    },
    { label: SCOPE_LABELS[SettingScope.System], value: SettingScope.System },
  ];

  // Scroll logic for settings
  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItemsToShow);
  const showScrollUp = scrollOffset > 0;
  const showScrollDown = scrollOffset + maxItemsToShow < items.length;

  useInput((input, key) => {
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
      } else if (key.tab) {
        setFocusSection('scope');
      }
    } else if (focusSection === 'scope') {
      if (key.upArrow || input === 'k') {
        if (activeScopeIndex > 0) setActiveScopeIndex(activeScopeIndex - 1);
      } else if (key.downArrow || input === 'j') {
        if (activeScopeIndex < scopeItems.length - 1)
          setActiveScopeIndex(activeScopeIndex + 1);
      } else if (key.return || input === ' ') {
        setSelectedScope(scopeItems[activeScopeIndex].value);
        setFocusSection('settings');
        setActiveSettingIndex(0);
        setScrollOffset(0);
      } else if (key.tab) {
        setFocusSection('settings');
      }
    }
    if (showRestartPrompt && input === 'r') {
      // Commit all pending changes to real settings
      const scope = selectedScope;
      const pending = pendingSettings;
      // For each key in pending, set value in settings
      Object.entries(pending).forEach(([key, value]) => {
        settings.setValue(scope, key as keyof Settings, value);
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
                  {String(item.checked)}
                </Text>
              </Box>
              <Box height={1} />
            </React.Fragment>
          );
        })}
        {showScrollDown && <Text color={Colors.Gray}>▼</Text>}

        <Box height={1} />

        {/* Apply To Section - Moved to bottom */}
        <Text color={Colors.AccentBlue}>Apply To</Text>
        <Box height={1} />

        {/* Display scope items vertically */}
        <Box flexDirection="column">
          {scopeItems.map((item, idx) => {
            const isActive =
              focusSection === 'scope' && activeScopeIndex === idx;
            const isSelected = selectedScope === item.value;
            return (
              <Box key={item.value} flexDirection="row" alignItems="center">
                <Box minWidth={2} flexShrink={0}>
                  <Text color={Colors.AccentGreen}>
                    {isSelected ? '●' : ''}
                  </Text>
                </Box>
                <Text color={isActive ? Colors.AccentGreen : Colors.Foreground}>
                  {item.label}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box height={1} />
        <Text color={Colors.Gray}>
          (Use Enter to select, Tab to change focus)
        </Text>
        {showRestartPrompt && (
          <Text color={Colors.AccentYellow}>
            To see changes, Gemini CLI must be restarted. Press r to restart
            now.
          </Text>
        )}
      </Box>
    </Box>
  );
}
