/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchableList, type SearchableListProps } from './SearchableList.js';
import { KeypressProvider } from '../../contexts/KeypressContext.js';
import { type GenericListItem } from '../../hooks/useFuzzyList.js';

// Mock UI State
vi.mock('../../contexts/UIStateContext.js', () => ({
  useUIState: () => ({
    mainAreaWidth: 100,
  }),
}));

const mockItems: GenericListItem[] = [
  {
    key: 'item-1',
    label: 'Item One',
    description: 'Description for item one',
  },
  {
    key: 'item-2',
    label: 'Item Two',
    description: 'Description for item two',
  },
  {
    key: 'item-3',
    label: 'Item Three',
    description: 'Description for item three',
  },
];

describe('SearchableList', () => {
  let mockOnSelect: ReturnType<typeof vi.fn>;
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSelect = vi.fn();
    mockOnClose = vi.fn();
  });

  const renderList = (
    props: Partial<SearchableListProps<GenericListItem>> = {},
  ) => {
    const defaultProps: SearchableListProps<GenericListItem> = {
      title: 'Test List',
      items: mockItems,
      onSelect: mockOnSelect,
      onClose: mockOnClose,
      ...props,
    };

    return render(
      <KeypressProvider>
        <SearchableList {...defaultProps} />
      </KeypressProvider>,
    );
  };

  it('should render all items initially', () => {
    const { lastFrame } = renderList();
    const frame = lastFrame();

    // Check for title
    expect(frame).toContain('Test List');

    // Check for items
    expect(frame).toContain('Item One');
    expect(frame).toContain('Item Two');
    expect(frame).toContain('Item Three');

    // Check for descriptions
    expect(frame).toContain('Description for item one');
  });

  it('should filter items based on search query', async () => {
    const { lastFrame, stdin } = renderList();

    // Type "Two" into search
    await React.act(async () => {
      stdin.write('Two');
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Item Two');
      expect(frame).not.toContain('Item One');
      expect(frame).not.toContain('Item Three');
    });
  });

  it('should show "No items found." when no items match', async () => {
    const { lastFrame, stdin } = renderList();

    // Type something that won't match
    await React.act(async () => {
      stdin.write('xyz123');
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('No items found.');
    });
  });

  it('should handle selection with Enter', async () => {
    const { stdin } = renderList();

    // Select first item (default active)
    await React.act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(mockItems[0]);
    });
  });

  it('should handle navigation and selection', async () => {
    const { stdin } = renderList();

    // Navigate down to second item
    await React.act(async () => {
      stdin.write('\u001B[B'); // Down Arrow
    });

    // Select second item
    await React.act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(mockItems[1]);
    });
  });

  it('should handle close with Esc', async () => {
    const { stdin } = renderList();

    await React.act(async () => {
      stdin.write('\u001B'); // Esc
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
