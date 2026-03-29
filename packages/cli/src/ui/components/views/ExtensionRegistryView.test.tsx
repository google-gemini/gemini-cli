/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { makeFakeConfig } from '@google/gemini-cli-core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionRegistryView } from './ExtensionRegistryView.js';
import { type ExtensionManager } from '../../../config/extension-manager.js';
import { useExtensionRegistry } from '../../hooks/useExtensionRegistry.js';
import { useExtensionUpdates } from '../../hooks/useExtensionUpdates.js';
import { useRegistrySearch } from '../../hooks/useRegistrySearch.js';
import { type RegistryExtension } from '../../../config/extensionRegistryClient.js';
import { type UIState } from '../../contexts/UIStateContext.js';
import {
  type SearchListState,
  type GenericListItem,
} from '../shared/SearchableList.js';
import { type TextBuffer } from '../shared/text-buffer.js';

// Mocks
vi.mock('../../hooks/useExtensionRegistry.js');
vi.mock('../../hooks/useExtensionUpdates.js');
vi.mock('../../hooks/useRegistrySearch.js');
vi.mock('../../../config/extension-manager.js');

const mockExtensions: RegistryExtension[] = [
  {
    id: 'ext1',
    extensionName: 'Test Extension 1',
    extensionDescription: 'Description 1',
    fullName: 'author/ext1',
    extensionVersion: '1.0.0',
    rank: 1,
    stars: 10,
    url: 'http://example.com',
    repoDescription: 'Repo Desc 1',
    avatarUrl: 'http://avatar.com',
    lastUpdated: '2023-01-01',
    hasMCP: false,
    hasContext: false,
    hasHooks: false,
    hasSkills: false,
    hasCustomCommands: false,
    isGoogleOwned: false,
    licenseKey: 'mit',
  },
  {
    id: 'ext2',
    extensionName: 'Test Extension 2',
    extensionDescription: 'Description 2',
    fullName: 'author/ext2',
    extensionVersion: '2.0.0',
    rank: 2,
    stars: 20,
    url: 'http://example.com/2',
    repoDescription: 'Repo Desc 2',
    avatarUrl: 'http://avatar.com/2',
    lastUpdated: '2023-01-02',
    hasMCP: true,
    hasContext: true,
    hasHooks: true,
    hasSkills: true,
    hasCustomCommands: true,
    isGoogleOwned: true,
    licenseKey: 'apache-2.0',
  },
];

describe('ExtensionRegistryView', () => {
  let mockExtensionManager: ExtensionManager;
  let mockOnSelect: ReturnType<typeof vi.fn>;
  let mockOnClose: ReturnType<typeof vi.fn>;
  let mockSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExtensionManager = {
      getExtensions: vi.fn().mockReturnValue([]),
    } as unknown as ExtensionManager;

    mockOnSelect = vi.fn();
    mockOnClose = vi.fn();
    mockSearch = vi.fn();

    vi.mocked(useExtensionRegistry).mockReturnValue({
      extensions: mockExtensions,
      loading: false,
      error: null,
      search: mockSearch,
    });

    vi.mocked(useExtensionUpdates).mockReturnValue({
      extensionsUpdateState: new Map(),
    } as unknown as ReturnType<typeof useExtensionUpdates>);

    // Mock useRegistrySearch implementation
    vi.mocked(useRegistrySearch).mockImplementation(
      (props: { items: GenericListItem[]; onSearch?: (q: string) => void }) =>
        ({
          filteredItems: props.items, // Pass through items
          searchBuffer: {
            text: '',
            cursorOffset: 0,
            viewport: { width: 10, height: 1 },
            visualCursor: [0, 0] as [number, number],
            viewportVisualLines: [{ text: '', visualRowIndex: 0 }],
            visualScrollRow: 0,
            lines: [''],
            cursor: [0, 0] as [number, number],
            selectionAnchor: undefined,
          } as unknown as TextBuffer,
          searchQuery: '',
          setSearchQuery: vi.fn(),
          maxLabelWidth: 10,
        }) as unknown as SearchListState<GenericListItem>,
    );
  });

  const renderView = async () =>
    renderWithProviders(
      <ExtensionRegistryView
        extensionManager={mockExtensionManager}
        onSelect={mockOnSelect}
        onClose={mockOnClose}
      />,
      {
        config: makeFakeConfig(),
        uiState: {
          staticExtraHeight: 5,
          terminalHeight: 40,
        } as Partial<UIState>,
      },
    );

  it('should render extensions', async () => {
    const { lastFrame } = await renderView();

    await waitFor(() => {
      expect(lastFrame()).toContain('Test Extension 1');
      expect(lastFrame()).toContain('Test Extension 2');
    });
  });

  it('should use useRegistrySearch hook', async () => {
    await renderView();
    expect(useRegistrySearch).toHaveBeenCalled();
  });

  it('should call search function when typing', async () => {
    // Mock useRegistrySearch to trigger onSearch
    vi.mocked(useRegistrySearch).mockImplementation(
      (props: {
        items: GenericListItem[];
        onSearch?: (q: string) => void;
      }): SearchListState<GenericListItem> => {
        const { onSearch } = props;
        // Simulate typing
        React.useEffect(() => {
          if (onSearch) {
            onSearch('test query');
          }
        }, [onSearch]);
        return {
          filteredItems: props.items,
          searchBuffer: {
            text: 'test query',
            cursorOffset: 10,
            viewport: { width: 10, height: 1 },
            visualCursor: [0, 10] as [number, number],
            viewportVisualLines: [{ text: 'test query', visualRowIndex: 0 }],
            visualScrollRow: 0,
            lines: ['test query'],
            cursor: [0, 10] as [number, number],
            selectionAnchor: undefined,
          } as unknown as TextBuffer,
          searchQuery: 'test query',
          setSearchQuery: vi.fn(),
          maxLabelWidth: 10,
        } as unknown as SearchListState<GenericListItem>;
      },
    );

    await renderView();

    await waitFor(() => {
      expect(useRegistrySearch).toHaveBeenCalledWith(
        expect.objectContaining({
          onSearch: mockSearch,
        }),
      );
    });
  });

  it('should call onSelect when extension is selected and Enter is pressed in details', async () => {
    const { stdin, lastFrame } = await renderView();

    // Select the first extension in the list (Enter opens details)
    await React.act(async () => {
      stdin.write('\r');
    });

    // Verify we are in details view
    await waitFor(() => {
      expect(lastFrame()).toContain('author/ext1');
      expect(lastFrame()).toContain('[Enter] Install');
    });

    // Ensure onSelect hasn't been called yet
    expect(mockOnSelect).not.toHaveBeenCalled();

    // Press Enter again in the details view to trigger install
    await React.act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(
        mockExtensions[0],
        expect.any(Function),
      );
    });
  });
});
