/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import type { RegistryExtension } from '../../../config/extensionRegistryClient.js';

import {
  SearchableList,
  type GenericListItem,
} from '../shared/SearchableList.js';
import { theme } from '../../semantic-colors.js';

import { useExtensionRegistry } from '../../hooks/useExtensionRegistry.js';
import { ExtensionUpdateState } from '../../state/extensions.js';
import { useExtensionUpdates } from '../../hooks/useExtensionUpdates.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import type { ExtensionManager } from '../../../config/extension-manager.js';
import { useRegistrySearch } from '../../hooks/useRegistrySearch.js';

import { useUIState } from '../../contexts/UIStateContext.js';

interface ExtensionRegistryViewProps {
  onSelect?: (extension: RegistryExtension) => void;
  onClose?: () => void;
  extensionManager: ExtensionManager;
}

interface ExtensionItem extends GenericListItem {
  extension: RegistryExtension;
}

export function ExtensionRegistryView({
  onSelect,
  onClose,
  extensionManager,
}: ExtensionRegistryViewProps): React.JSX.Element {
  const { extensions, loading, error, search } = useExtensionRegistry();
  const config = useConfig();
  const { terminalHeight, staticExtraHeight } = useUIState();

  const { extensionsUpdateState } = useExtensionUpdates(
    extensionManager,
    () => 0,
    config.getEnableExtensionReloading(),
  );

  const installedExtensions = extensionManager.getExtensions();

  const items: ExtensionItem[] = useMemo(
    () =>
      extensions.map((ext) => ({
        key: ext.id,
        label: ext.extensionName,
        description: ext.extensionDescription || ext.repoDescription,
        extension: ext,
      })),
    [extensions],
  );

  const handleSelect = useCallback(
    (item: ExtensionItem) => {
      onSelect?.(item.extension);
    },
    [onSelect],
  );

  const renderItem = useCallback(
    (item: ExtensionItem, isActive: boolean, _labelWidth: number) => {
      const isInstalled = installedExtensions.some(
        (e) => e.name === item.extension.extensionName,
      );
      const updateState = extensionsUpdateState.get(
        item.extension.extensionName,
      );
      const hasUpdate = updateState === ExtensionUpdateState.UPDATE_AVAILABLE;

      return (
        <Box flexDirection="row" width="100%" justifyContent="space-between">
          <Box flexDirection="row" flexShrink={1} minWidth={0}>
            <Box width={2} flexShrink={0}>
              <Text
                color={isActive ? theme.status.success : theme.text.secondary}
              >
                {isActive ? '● ' : '  '}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Text
                bold={isActive}
                color={isActive ? theme.status.success : theme.text.primary}
              >
                {item.label}
              </Text>
            </Box>
            <Box flexShrink={0} marginX={1}>
              <Text color={theme.text.secondary}>|</Text>
            </Box>
            {isInstalled && (
              <Box marginRight={1} flexShrink={0}>
                <Text color={theme.status.success}>[Installed]</Text>
              </Box>
            )}
            {hasUpdate && (
              <Box marginRight={1} flexShrink={0}>
                <Text color={theme.status.warning}>[Update available]</Text>
              </Box>
            )}
            <Box flexShrink={1} minWidth={0}>
              <Text color={theme.text.secondary} wrap="truncate-end">
                {item.description}
              </Text>
            </Box>
          </Box>
          <Box flexShrink={0} marginLeft={2} width={8} flexDirection="row">
            <Text color={theme.status.warning}>⭐</Text>
            <Text
              color={isActive ? theme.status.success : theme.text.secondary}
            >
              {' '}
              {item.extension.stars || 0}
            </Text>
          </Box>
        </Box>
      );
    },
    [installedExtensions, extensionsUpdateState],
  );

  const header = useMemo(
    () => (
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Box flexShrink={1}>
          <Text color={theme.text.secondary} wrap="truncate">
            Browse and search extensions from the registry.
          </Text>
        </Box>
        <Box flexShrink={0} marginLeft={2}>
          <Text color={theme.text.secondary}>
            {installedExtensions.length &&
              `${installedExtensions.length} installed`}
          </Text>
        </Box>
      </Box>
    ),
    [installedExtensions.length],
  );

  const footer = useCallback(
    ({
      startIndex,
      endIndex,
      totalVisible,
    }: {
      startIndex: number;
      endIndex: number;
      totalVisible: number;
    }) => (
      <Text color={theme.text.secondary}>
        ({startIndex + 1}-{endIndex}) / {totalVisible}
      </Text>
    ),
    [],
  );

  const maxItemsToShow = useMemo(() => {
    // SearchableList layout overhead:
    // Container paddingY: 0
    // Title (marginBottom 1): 2
    // Search buffer (border 2, marginBottom 1): 4
    // Header (marginBottom 1): 2
    // Footer (marginTop 1): 2
    // List item (marginBottom 1): 2 per item
    // Total static height = 2 + 4 + 2 + 2 = 10
    const staticHeight = 10;
    const availableTerminalHeight = terminalHeight - staticExtraHeight;
    const remainingHeight = Math.max(0, availableTerminalHeight - staticHeight);
    const itemHeight = 2; // Each item takes 2 lines (content + marginBottom 1)

    // Ensure we show at least a few items and not more than we have
    return Math.max(4, Math.floor(remainingHeight / itemHeight));
  }, [terminalHeight, staticExtraHeight]);

  if (loading) {
    return (
      <Box padding={1}>
        <Text color={theme.text.secondary}>Loading extensions...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color={theme.status.error}>Error loading extensions:</Text>
        <Text color={theme.text.secondary}>{error}</Text>
      </Box>
    );
  }

  return (
    <SearchableList<ExtensionItem>
      title="Extensions"
      items={items}
      onSelect={handleSelect}
      onClose={onClose || (() => {})}
      searchPlaceholder="Search extension gallery"
      renderItem={renderItem}
      header={header}
      footer={footer}
      maxItemsToShow={maxItemsToShow}
      useSearch={useRegistrySearch}
      onSearch={search}
      resetSelectionOnItemsChange={true}
    />
  );
}
