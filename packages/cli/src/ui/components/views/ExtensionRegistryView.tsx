/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import {
  ExtensionRegistryClient,
  type RegistryExtension,
} from '../../../config/extensionRegistryClient.js';
import { SearchableList } from '../shared/SearchableList.js';
import type { GenericListItem } from '../../hooks/useFuzzyList.js';
import { theme } from '../../semantic-colors.js';

import { ExtensionUpdateState } from '../../state/extensions.js';
import { useExtensionUpdates } from '../../hooks/useExtensionUpdates.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import type { ExtensionManager } from '../../../config/extension-manager.js';

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
  const [extensions, setExtensions] = useState<RegistryExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const config = useConfig();

  const { extensionsUpdateState } = useExtensionUpdates(
    extensionManager,
    () => 0,
    config.getEnableExtensionReloading(),
  );

  const installedExtensions = extensionManager.getExtensions();

  const client = useMemo(() => new ExtensionRegistryClient(), []);

  useEffect(() => {
    let active = true;
    const fetchExtensions = async () => {
      try {
        const result = await client.getExtensions(1, 1000); // Fetch a large enough batch
        if (active) {
          setExtensions(result.extensions);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    };

    void fetchExtensions();
    return () => {
      active = false;
    };
  }, [client]);

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

  const handleSelect = (item: ExtensionItem) => {
    onSelect?.(item.extension);
  };

  const renderItem = (
    item: ExtensionItem,
    isActive: boolean,
    _labelWidth: number,
  ) => {
    const isInstalled = installedExtensions.some(
      (e) => e.name === item.extension.extensionName,
    );
    const updateState = extensionsUpdateState.get(item.extension.extensionName);
    const hasUpdate = updateState === ExtensionUpdateState.UPDATE_AVAILABLE;

    return (
      <Box flexDirection="row" width="100%" justifyContent="space-between">
        <Box flexDirection="row" flexShrink={1} minWidth={0}>
          <Box width={2} flexShrink={0}>
            <Text
              color={isActive ? theme.status.success : theme.text.secondary}
            >
              {isActive ? '> ' : '  '}
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
          <Text color={isActive ? theme.status.success : theme.text.secondary}>
            {' '}
            {item.extension.stars || 0}
          </Text>
        </Box>
      </Box>
    );
  };

  const header = (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Box flexShrink={1}>
        <Text color={theme.text.secondary} wrap="truncate">
          Browse and search extensions from the registry.
        </Text>
      </Box>
      <Box flexShrink={0} marginLeft={2}>
        <Text color={theme.text.secondary}>
          Reg: {extensions.length} | Inst: {installedExtensions.length}
        </Text>
      </Box>
    </Box>
  );

  const footer = ({
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
  );

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
      maxItemsToShow={8}
    />
  );
}
