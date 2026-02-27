/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { themeManager, DEFAULT_THEME } from '../themes/theme-manager.js';
import { type Theme } from '../themes/theme.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { DiffRenderer } from './messages/DiffRenderer.js';
import { colorizeCode } from '../utils/CodeColorizer.js';
import type {
  LoadableSettingScope,
  LoadedSettings,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { getScopeMessageForSetting } from '../../utils/dialogScopeUtils.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { ScopeSelector } from './shared/ScopeSelector.js';
import { useUIState } from '../contexts/UIStateContext.js';

interface ThemeDialogProps {
  /** Callback function when a theme is selected */
  onSelect: (
    themeName: string,
    scope: LoadableSettingScope,
  ) => void | Promise<void>;

  /** Callback function when the dialog is cancelled */
  onCancel: () => void;

  /** Callback function when a theme is highlighted */
  onHighlight: (themeName: string | undefined) => void;
  /** The settings object */
  settings: LoadedSettings;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

import { resolveColor , getThemeTypeFromBackgroundColor } from '../themes/color-utils.js';

import { DefaultLight } from '../themes/default-light.js';
import { DefaultDark } from '../themes/default.js';

function generateThemeItem(
  name: string,
  typeDisplay: string,
  fullTheme: Theme | undefined,
  terminalBackgroundColor: string | undefined,
) {
  const themeBackground = fullTheme
    ? resolveColor(fullTheme.colors.Background)
    : undefined;

  const isBackgroundMatch =
    terminalBackgroundColor &&
    themeBackground &&
    terminalBackgroundColor.toLowerCase() === themeBackground.toLowerCase();

  return {
    label: name,
    value: name,
    themeNameDisplay: name,
    themeTypeDisplay: typeDisplay,
    themeMatch: isBackgroundMatch ? ' (Matches terminal)' : '',
    key: name,
    type: fullTheme?.type,
  };
}

export function ThemeDialog({
  onSelect,
  onCancel,
  onHighlight,
  settings,
  availableTerminalHeight,
  terminalWidth,
}: ThemeDialogProps): React.JSX.Element {
  const isAlternateBuffer = useAlternateBuffer();
  const { terminalBackgroundColor } = useUIState();
  const [selectedScope, setSelectedScope] = useState<LoadableSettingScope>(
    SettingScope.User,
  );

  const initialTab =
    terminalBackgroundColor &&
    getThemeTypeFromBackgroundColor(terminalBackgroundColor) === 'dark'
      ? 'dark'
      : 'light';
  const [activeTab, setActiveTab] = useState<'light' | 'dark'>(initialTab);

  const [highlightedThemeNameLight, setHighlightedThemeNameLight] =
    useState<string>(() => settings.merged.ui.themeLight || DefaultLight.name);
  const [highlightedThemeNameDark, setHighlightedThemeNameDark] =
    useState<string>(() => settings.merged.ui.themeDark || DefaultDark.name);

  const highlightedThemeName =
    activeTab === 'light'
      ? highlightedThemeNameLight
      : highlightedThemeNameDark;

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Generate theme items
  const allThemeItems = themeManager.getAvailableThemes().map((theme) => {
    const fullTheme = themeManager.getTheme(theme.name);
    const capitalizedType = capitalize(theme.type);
    const typeDisplay = theme.name.endsWith(capitalizedType)
      ? ''
      : capitalizedType;

    return generateThemeItem(
      theme.name,
      typeDisplay,
      fullTheme,
      terminalBackgroundColor,
    );
  });

  const themeItems = allThemeItems
    .filter((item) => item.type === activeTab || !item.type) // Filter by tab, allow untyped
    .sort((a, b) => a.label.localeCompare(b.label));

  // Find the index of the selected theme, but only if it exists in the list
  const initialThemeIndex = themeItems.findIndex(
    (item) => item.value === highlightedThemeName,
  );
  // If not found, fall back to the first theme
  const safeInitialThemeIndex = initialThemeIndex >= 0 ? initialThemeIndex : 0;

  const handleThemeSelect = useCallback(
    async (themeName: string) => {
      // @ts-expect-error adding extra argument for the updated hook
      await onSelect(themeName, selectedScope, activeTab);
    },
    [onSelect, selectedScope, activeTab],
  );

  const handleThemeHighlight = (themeName: string) => {
    if (activeTab === 'light') {
      setHighlightedThemeNameLight(themeName);
    } else {
      setHighlightedThemeNameDark(themeName);
    }
    onHighlight(themeName);
  };

  const handleScopeHighlight = useCallback((scope: LoadableSettingScope) => {
    setSelectedScope(scope);
  }, []);

  const handleScopeSelect = useCallback(
    async (scope: LoadableSettingScope) => {
      // @ts-expect-error adding extra argument
      await onSelect(highlightedThemeName, scope, activeTab);
    },
    [onSelect, highlightedThemeName, activeTab],
  );

  const [mode, setMode] = useState<'theme' | 'scope'>('theme');

  useKeypress(
    (key) => {
      if (key.name === 'tab') {
        setMode((prev) => (prev === 'theme' ? 'scope' : 'theme'));
        return true;
      }
      if (key.name === 'escape') {
        onCancel();
        return true;
      }
      if (mode === 'theme') {
        if (key.name === 'left' && activeTab === 'dark') {
          setActiveTab('light');
          onHighlight(highlightedThemeNameLight);
          return true;
        }
        if (key.name === 'right' && activeTab === 'light') {
          setActiveTab('dark');
          onHighlight(highlightedThemeNameDark);
          return true;
        }
      }
      return false;
    },
    { isActive: true },
  );

  // Generate scope message for theme setting
  const otherScopeModifiedMessage = getScopeMessageForSetting(
    activeTab === 'light' ? 'ui.themeLight' : 'ui.themeDark',
    selectedScope,
    settings,
  );

  // Constants for calculating preview pane layout.
  // These values are based on the JSX structure below.
  const PREVIEW_PANE_WIDTH_PERCENTAGE = 0.55;
  // A safety margin to prevent text from touching the border.
  // This is a complete hack unrelated to the 0.9 used in App.tsx
  const PREVIEW_PANE_WIDTH_SAFETY_MARGIN = 0.9;
  // Combined horizontal padding from the dialog and preview pane.
  const TOTAL_HORIZONTAL_PADDING = 4;
  const colorizeCodeWidth = Math.max(
    Math.floor(
      (terminalWidth - TOTAL_HORIZONTAL_PADDING) *
        PREVIEW_PANE_WIDTH_PERCENTAGE *
        PREVIEW_PANE_WIDTH_SAFETY_MARGIN,
    ),
    1,
  );

  const DIALOG_PADDING = 2;
  const selectThemeHeight = themeItems.length + 1;
  const TAB_TO_SELECT_HEIGHT = 2;
  availableTerminalHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  availableTerminalHeight -= 2; // Top and bottom borders.
  availableTerminalHeight -= TAB_TO_SELECT_HEIGHT;

  let totalLeftHandSideHeight = DIALOG_PADDING + selectThemeHeight;

  let includePadding = true;

  // Remove content from the LHS that can be omitted if it exceeds the available height.
  if (totalLeftHandSideHeight > availableTerminalHeight) {
    includePadding = false;
    totalLeftHandSideHeight -= DIALOG_PADDING;
  }

  // Vertical space taken by elements other than the two code blocks in the preview pane.
  // Includes "Preview" title, borders, and margin between blocks.
  const PREVIEW_PANE_FIXED_VERTICAL_SPACE = 8;

  // The right column doesn't need to ever be shorter than the left column.
  availableTerminalHeight = Math.max(
    availableTerminalHeight,
    totalLeftHandSideHeight,
  );
  const availableTerminalHeightCodeBlock =
    availableTerminalHeight -
    PREVIEW_PANE_FIXED_VERTICAL_SPACE -
    (includePadding ? 2 : 0) * 2;

  // Subtract margin between code blocks from available height.
  const availableHeightForPanes = Math.max(
    0,
    availableTerminalHeightCodeBlock - 1,
  );

  // The code block is slightly longer than the diff, so give it more space.
  const codeBlockHeight = Math.ceil(availableHeightForPanes * 0.6);
  const diffHeight = Math.floor(availableHeightForPanes * 0.4);
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={includePadding ? 1 : 0}
      paddingBottom={includePadding ? 1 : 0}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      {mode === 'theme' ? (
        <Box flexDirection="row">
          {/* Left Column: Selection */}
          <Box flexDirection="column" width="45%" paddingRight={2}>
            <Text bold={mode === 'theme'} wrap="truncate">
              {mode === 'theme' ? '> ' : '  '}Select Theme{' '}
              <Text color={theme.text.secondary}>
                {otherScopeModifiedMessage}
              </Text>
            </Text>
            <Box
              flexDirection="row"
              paddingLeft={2}
              paddingTop={1}
              paddingBottom={1}
            >
              <Text
                color={
                  activeTab === 'light'
                    ? theme.text.primary
                    : theme.text.secondary
                }
                underline={activeTab === 'light'}
                bold={activeTab === 'light'}
              >
                {' '}
                Light{' '}
              </Text>
              <Text> | </Text>
              <Text
                color={
                  activeTab === 'dark'
                    ? theme.text.primary
                    : theme.text.secondary
                }
                underline={activeTab === 'dark'}
                bold={activeTab === 'dark'}
              >
                {' '}
                Dark{' '}
              </Text>
            </Box>
            <RadioButtonSelect
              items={themeItems}
              initialIndex={safeInitialThemeIndex}
              onSelect={handleThemeSelect}
              onHighlight={handleThemeHighlight}
              isFocused={mode === 'theme'}
              maxItemsToShow={12}
              showScrollArrows={true}
              showNumbers={mode === 'theme'}
              renderItem={(item, { titleColor }) => {
                // We know item has themeMatch because we put it there, but we need to cast or access safely
                const itemWithExtras = item as typeof item & {
                  themeMatch?: string;
                };

                if (item.themeNameDisplay && item.themeTypeDisplay) {
                  const match = item.themeNameDisplay.match(/^(.*) \((.*)\)$/);
                  let themeNamePart: React.ReactNode = item.themeNameDisplay;
                  if (match) {
                    themeNamePart = (
                      <>
                        {match[1]}{' '}
                        <Text color={theme.text.secondary}>({match[2]})</Text>
                      </>
                    );
                  }

                  return (
                    <Text color={titleColor} wrap="truncate" key={item.key}>
                      {themeNamePart}{' '}
                      <Text color={theme.text.secondary}>
                        {item.themeTypeDisplay}
                      </Text>
                      {itemWithExtras.themeMatch && (
                        <Text color={theme.status.success}>
                          {itemWithExtras.themeMatch}
                        </Text>
                      )}
                    </Text>
                  );
                }
                // Regular label display
                return (
                  <Text color={titleColor} wrap="truncate">
                    {item.label}
                  </Text>
                );
              }}
            />
          </Box>

          {/* Right Column: Preview */}
          <Box flexDirection="column" width="55%" paddingLeft={2}>
            <Text bold color={theme.text.primary}>
              Preview
            </Text>
            {/* Get the Theme object for the highlighted theme, fall back to default if not found */}
            {(() => {
              const previewTheme =
                themeManager.getTheme(
                  highlightedThemeName || DEFAULT_THEME.name,
                ) || DEFAULT_THEME;

              const effectiveBackground =
                activeTab === 'light' ? '#ffffff' : '#000000';

              return (
                <Box
                  borderStyle="single"
                  borderColor={theme.border.default}
                  paddingTop={includePadding ? 1 : 0}
                  paddingBottom={includePadding ? 1 : 0}
                  paddingLeft={1}
                  paddingRight={1}
                  flexDirection="column"
                  backgroundColor={effectiveBackground}
                >
                  {colorizeCode({
                    code: `# function
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a`,
                    language: 'python',
                    availableHeight:
                      isAlternateBuffer === false ? codeBlockHeight : undefined,
                    maxWidth: colorizeCodeWidth,
                    settings,
                    theme: previewTheme,
                  })}
                  <Box marginTop={1} />
                  <DiffRenderer
                    diffContent={`--- a/util.py
+++ b/util.py
@@ -1,2 +1,2 @@
- print("Hello, " + name)
+ print(f"Hello, {name}!")
`}
                    availableTerminalHeight={
                      isAlternateBuffer === false ? diffHeight : undefined
                    }
                    terminalWidth={colorizeCodeWidth}
                    theme={previewTheme}
                  />
                </Box>
              );
            })()}
          </Box>
        </Box>
      ) : (
        <ScopeSelector
          onSelect={handleScopeSelect}
          onHighlight={handleScopeHighlight}
          isFocused={mode === 'scope'}
          initialScope={selectedScope}
        />
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary} wrap="truncate">
          (Use Enter to {mode === 'theme' ? 'select' : 'apply scope'}, Tab to{' '}
          {mode === 'theme' ? 'configure scope' : 'select theme'}, Esc to close)
        </Text>
      </Box>
    </Box>
  );
}
