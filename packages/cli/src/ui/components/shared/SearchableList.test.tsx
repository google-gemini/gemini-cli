/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { SearchableList, type SearchableListProps } from './SearchableList.js';
import { KeypressProvider } from '../../contexts/KeypressContext.js';
import { SettingScope } from '../../../config/settings.js';
import { type SettingsDialogItem } from './BaseSettingsDialog.js';

vi.mock('../../contexts/UIStateContext.js', () => ({
  useUIState: () => ({
    mainAreaWidth: 100,
  }),
}));

const createMockItems = (): SettingsDialogItem[] => [
  {
    key: 'boolean-setting',
    label: 'Boolean Setting',
    description: 'A boolean setting for testing',
    displayValue: 'true',
    rawValue: true,
    type: 'boolean',
  },
  {
    key: 'string-setting',
    label: 'String Setting',
    description: 'A string setting for testing',
    displayValue: 'test-value',
    rawValue: 'test-value',
    type: 'string',
  },
  {
    key: 'number-setting',
    label: 'Number Setting',
    description: 'A number setting for testing',
    displayValue: '42',
    rawValue: 42,
    type: 'number',
  },
];

describe('SearchableList', () => {
  let mockOnItemToggle: ReturnType<typeof vi.fn>;
  let mockOnEditCommit: ReturnType<typeof vi.fn>;
  let mockOnItemClear: ReturnType<typeof vi.fn>;
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnItemToggle = vi.fn();
    mockOnEditCommit = vi.fn();
    mockOnItemClear = vi.fn();
    mockOnClose = vi.fn();
  });

  const renderList = (props: Partial<SearchableListProps> = {}) => {
    const defaultProps: SearchableListProps = {
      title: 'Test List',
      items: createMockItems(),
      selectedScope: SettingScope.User,
      maxItemsToShow: 8,
      onItemToggle: mockOnItemToggle,
      onEditCommit: mockOnEditCommit,
      onItemClear: mockOnItemClear,
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
    expect(frame).toContain('Boolean Setting');
    expect(frame).toContain('String Setting');
    expect(frame).toContain('Number Setting');
  });

  it('should filter items based on search query', async () => {
    const { lastFrame, stdin } = renderList();

    // Type "bool" into search
    await act(async () => {
      stdin.write('bool');
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Boolean Setting');
      expect(frame).not.toContain('String Setting');
      expect(frame).not.toContain('Number Setting');
    });
  });

  it('should show "No matches found." when no items match', async () => {
    const { lastFrame, stdin } = renderList();

    // Type something that won't match
    await act(async () => {
      stdin.write('xyz123');
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('No matches found.');
    });
  });

  it('should call onSearch callback when query changes', async () => {
    const mockOnSearch = vi.fn();
    const { stdin } = renderList({ onSearch: mockOnSearch });

    await act(async () => {
      stdin.write('a');
    });

    await waitFor(() => {
      expect(mockOnSearch).toHaveBeenCalledWith('a');
    });
  });

  it('should handle clearing the search query', async () => {
    const { lastFrame, stdin } = renderList();

    // Search for something
    await act(async () => {
      stdin.write('bool');
    });

    await waitFor(() => {
      expect(lastFrame()).not.toContain('String Setting');
    });

    // Clear search (Backspace 4 times)
    await act(async () => {
      stdin.write('\u0008\u0008\u0008\u0008');
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Boolean Setting');
      expect(frame).toContain('String Setting');
      expect(frame).toContain('Number Setting');
    });
  });
});
