/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SearchableList,
  type SearchableListProps,
  type SearchListState,
  type GenericListItem,
} from './SearchableList.js';
import { KeypressProvider } from '../../contexts/KeypressContext.js';
import { useTextBuffer } from './text-buffer.js';

const useMockSearch = (props: {
  items: GenericListItem[];
  initialQuery?: string;
  onSearch?: (query: string) => void;
}): SearchListState<GenericListItem> => {
  const { onSearch, items, initialQuery = '' } = props;
  const [text, setText] = React.useState(initialQuery);
  const filteredItems = React.useMemo(
    () =>
      items.filter((item: GenericListItem) =>
        item.label.toLowerCase().includes(text.toLowerCase()),
      ),
    [items, text],
  );

  React.useEffect(() => {
    onSearch?.(text);
  }, [text, onSearch]);

  const searchBuffer = useTextBuffer({
    initialText: text,
    onChange: setText,
    viewport: { width: 100, height: 1 },
    singleLine: true,
  });

  return {
    filteredItems,
    searchBuffer,
    searchQuery: text,
    setSearchQuery: setText,
    maxLabelWidth: 10,
  };
};

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
      useSearch: useMockSearch,
      ...props,
    };

    return render(
      <KeypressProvider>
        <SearchableList {...defaultProps} />
      </KeypressProvider>,
    );
  };

  it('should render all items initially', async () => {
    const { lastFrame, waitUntilReady } = renderList();
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('Test List');

    expect(frame).toContain('Item One');
    expect(frame).toContain('Item Two');
    expect(frame).toContain('Item Three');

    expect(frame).toContain('Description for item one');
  });

  it('should reset selection to top when items change if resetSelectionOnItemsChange is true', async () => {
    const { lastFrame, stdin, waitUntilReady } = renderList({
      resetSelectionOnItemsChange: true,
    });
    await waitUntilReady();

    await React.act(async () => {
      stdin.write('\u001B[B'); // Down arrow
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('● Item Two');
    });
    expect(lastFrame()).toMatchSnapshot();

    await React.act(async () => {
      stdin.write('One');
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Item One');
      expect(frame).not.toContain('Item Two');
    });
    expect(lastFrame()).toMatchSnapshot();

    await React.act(async () => {
      // Backspace "One" (3 chars)
      stdin.write('\u007F\u007F\u007F');
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Item Two');
      expect(frame).toContain('● Item One');
      expect(frame).not.toContain('● Item Two');
    });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('should filter items based on search query', async () => {
    const { lastFrame, stdin } = renderList();

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

    await React.act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(mockItems[0]);
    });
  });

  it('should handle navigation and selection', async () => {
    const { stdin } = renderList();

    await React.act(async () => {
      stdin.write('\u001B[B'); // Down arrow
    });

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

  it('should match snapshot', async () => {
    const { lastFrame, waitUntilReady } = renderList();
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
