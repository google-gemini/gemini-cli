/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { Text } from 'ink';
import {
  BaseSettingsDialog,
  type BaseSettingsDialogProps,
  type SettingsDialogItem,
} from './BaseSettingsDialog.js';
import { KeypressProvider } from '../../contexts/KeypressContext.js';
import { SettingScope } from '../../../config/settings.js';

vi.mock('../../contexts/UIStateContext.js', () => ({
  useUIState: () => ({
    mainAreaWidth: 100,
  }),
}));

enum TerminalKeys {
  ENTER = '\u000D',
  TAB = '\t',
  UP_ARROW = '\u001B[A',
  DOWN_ARROW = '\u001B[B',
  LEFT_ARROW = '\u001B[D',
  RIGHT_ARROW = '\u001B[C',
  ESCAPE = '\u001B',
  BACKSPACE = '\u0008',
  CTRL_L = '\u000C',
}

const createMockItems = (count = 4): SettingsDialogItem[] => {
  const items: SettingsDialogItem[] = [
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
    {
      key: 'enum-setting',
      label: 'Enum Setting',
      description: 'An enum setting for testing',
      displayValue: 'option-a',
      rawValue: 'option-a',
      type: 'enum',
    },
  ];

  // If count is larger than our base mock items, generate dynamic ones
  if (count > items.length) {
    for (let i = items.length; i < count; i++) {
      items.push({
        key: `extra-setting-${i}`,
        label: `Extra Setting ${i}`,
        displayValue: `value-${i}`,
        type: 'string',
      });
    }
  }

  return items.slice(0, count);
};

describe('BaseSettingsDialog', () => {
  let mockOnItemToggle: ReturnType<typeof vi.fn>;
  let mockOnEditCommit: ReturnType<typeof vi.fn>;
  let mockOnItemClear: ReturnType<typeof vi.fn>;
  let mockOnClose: ReturnType<typeof vi.fn>;
  let mockOnScopeChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnItemToggle = vi.fn();
    mockOnEditCommit = vi.fn();
    mockOnItemClear = vi.fn();
    mockOnClose = vi.fn();
    mockOnScopeChange = vi.fn();
  });

  const renderDialog = async (props: Partial<BaseSettingsDialogProps> = {}) => {
    const defaultProps: BaseSettingsDialogProps = {
      title: 'Test Settings',
      items: createMockItems(),
      selectedScope: SettingScope.User,
      maxItemsToShow: 8,
      onItemToggle: mockOnItemToggle,
      onEditCommit: mockOnEditCommit,
      onItemClear: mockOnItemClear,
      onClose: mockOnClose,
      ...props,
    };

    const result = render(
      <KeypressProvider>
        <BaseSettingsDialog {...defaultProps} />
      </KeypressProvider>,
    );
    await result.waitUntilReady();
    return result;
  };

  describe('rendering', () => {
    it('should render the dialog with title', async () => {
      const { lastFrame, unmount } = await renderDialog();
      expect(lastFrame()).toContain('Test Settings');
      unmount();
    });

    it('should render all items', async () => {
      const { lastFrame, unmount } = await renderDialog();
      const frame = lastFrame();

      expect(frame).toContain('Boolean Setting');
      expect(frame).toContain('String Setting');
      expect(frame).toContain('Number Setting');
      expect(frame).toContain('Enum Setting');
      unmount();
    });

    it('should render help text with Ctrl+L for reset', async () => {
      const { lastFrame, unmount } = await renderDialog();
      const frame = lastFrame();

      expect(frame).toContain('Use Enter to select');
      expect(frame).toContain('Ctrl+L to reset');
      expect(frame).toContain('Tab to change focus');
      expect(frame).toContain('Esc to close');
      unmount();
    });

    it('should render scope selector when showScopeSelector is true', async () => {
      const { lastFrame, unmount } = await renderDialog({
        showScopeSelector: true,
        onScopeChange: mockOnScopeChange,
      });

      expect(lastFrame()).toContain('Apply To');
      unmount();
    });

    it('should not render scope selector when showScopeSelector is false', async () => {
      const { lastFrame, unmount } = await renderDialog({
        showScopeSelector: false,
      });

      expect(lastFrame({ allowEmpty: true })).not.toContain('Apply To');
      unmount();
    });

    it('should render footer content when provided', async () => {
      const { lastFrame, unmount } = await renderDialog({
        footerContent: <Text>Custom Footer</Text>,
      });

      expect(lastFrame()).toContain('Custom Footer');
      unmount();
    });
  });

  describe('keyboard navigation', () => {
    it('should close dialog on Escape', async () => {
      const { stdin, waitUntilReady, unmount } = await renderDialog();

      await act(async () => {
        stdin.write(TerminalKeys.ESCAPE);
      });
      // Escape key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
      await act(async () => {
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
      unmount();
    });

    it('should navigate down with arrow key', async () => {
      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderDialog();

      // Initially first item is active (indicated by bullet point)
      const initialFrame = lastFrame();
      expect(initialFrame).toContain('Boolean Setting');

      // Press down arrow
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();

      // Navigation should move to next item
      await waitFor(() => {
        const frame = lastFrame();
        // The active indicator should now be on a different row
        expect(frame).toContain('String Setting');
      });
      unmount();
    });

    it('should navigate up with arrow key', async () => {
      const { stdin, waitUntilReady, unmount } = await renderDialog();

      // Press down then up
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();

      await act(async () => {
        stdin.write(TerminalKeys.UP_ARROW);
      });
      await waitUntilReady();

      // Should be back at first item
      await waitFor(() => {
        // First item should be active again
        expect(mockOnClose).not.toHaveBeenCalled();
      });
      unmount();
    });

    it('should wrap around when navigating past last item', async () => {
      const items = createMockItems(2); // Only 2 items
      const { stdin, waitUntilReady, unmount } = await renderDialog({ items });

      // Press down twice to go past the last item
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();

      // Should wrap to first item - verify no crash
      await waitFor(() => {
        expect(mockOnClose).not.toHaveBeenCalled();
      });
      unmount();
    });

    it('should wrap around when navigating before first item', async () => {
      const { stdin, waitUntilReady, unmount } = await renderDialog();

      // Press up at first item
      await act(async () => {
        stdin.write(TerminalKeys.UP_ARROW);
      });
      await waitUntilReady();

      // Should wrap to last item - verify no crash
      await waitFor(() => {
        expect(mockOnClose).not.toHaveBeenCalled();
      });
      unmount();
    });

    it('should switch focus with Tab when scope selector is shown', async () => {
      const { lastFrame, stdin, waitUntilReady, unmount } = await renderDialog({
        showScopeSelector: true,
        onScopeChange: mockOnScopeChange,
      });

      // Initially settings section is focused (indicated by >)
      expect(lastFrame()).toContain('> Test Settings');

      // Press Tab to switch to scope selector
      await act(async () => {
        stdin.write(TerminalKeys.TAB);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(lastFrame()).toContain('> Apply To');
      });
      unmount();
    });
  });

  describe('scrolling and resizing list (search filtering)', () => {
    it('should preserve focus on the active item if it remains in the filtered list', async () => {
      const items = createMockItems(5); // items 0 to 4
      const { rerender, stdin, lastFrame, waitUntilReady, unmount } =
        await renderDialog({
          items,
          maxItemsToShow: 5,
        });

      // Move focus down to item 2 ("Number Setting")
      // Separate acts needed so React state updates between keypresses
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();

      // Rerender with a filtered list where "Number Setting" is now at index 1
      const filteredItems = [items[0], items[2], items[4]];
      await act(async () => {
        rerender(
          <KeypressProvider>
            <BaseSettingsDialog
              title="Test Settings"
              items={filteredItems}
              selectedScope={SettingScope.User}
              maxItemsToShow={5}
              onItemToggle={mockOnItemToggle}
              onEditCommit={mockOnEditCommit}
              onItemClear={mockOnItemClear}
              onClose={mockOnClose}
            />
          </KeypressProvider>,
        );
      });
      await waitUntilReady();

      // Verify the dialog hasn't crashed and the items are displayed
      await waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('Boolean Setting');
        expect(frame).toContain('Number Setting');
        expect(frame).toContain('Extra Setting 4');
        expect(frame).not.toContain('No matches found.');
      });

      // Press Enter. If focus was preserved, it should be on "Number Setting" (index 1).
      // Since it's a number, it enters edit mode (mockOnItemToggle is NOT called).
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockOnItemToggle).not.toHaveBeenCalled();
      });
      unmount();
    });

    it('should reset focus to the top if the active item is filtered out', async () => {
      const items = createMockItems(5);
      const { rerender, stdin, lastFrame, waitUntilReady, unmount } =
        await renderDialog({
          items,
          maxItemsToShow: 5,
        });

      // Move focus down to item 2 ("Number Setting")
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();

      // Rerender with a filtered list that EXCLUDES "Number Setting"
      const filteredItems = [items[0], items[1]];
      await act(async () => {
        rerender(
          <KeypressProvider>
            <BaseSettingsDialog
              title="Test Settings"
              items={filteredItems}
              selectedScope={SettingScope.User}
              maxItemsToShow={5}
              onItemToggle={mockOnItemToggle}
              onEditCommit={mockOnEditCommit}
              onItemClear={mockOnItemClear}
              onClose={mockOnClose}
            />
          </KeypressProvider>,
        );
      });
      await waitUntilReady();

      await waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('Boolean Setting');
        expect(frame).toContain('String Setting');
      });

      // Press Enter. Since focus reset to index 0 ("Boolean Setting"), it should toggle.
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockOnItemToggle).toHaveBeenCalledWith(
          'boolean-setting',
          expect.anything(),
        );
      });
      unmount();
    });
  });

  describe('item interactions', () => {
    it('should call onItemToggle for boolean items on Enter', async () => {
      const { stdin, waitUntilReady, unmount } = await renderDialog();

      // Press Enter on first item (boolean)
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockOnItemToggle).toHaveBeenCalledWith(
          'boolean-setting',
          expect.objectContaining({ type: 'boolean' }),
        );
      });
      unmount();
    });

    it('should call onItemToggle for enum items on Enter', async () => {
      const items = createMockItems(4);
      // Move enum to first position
      const enumItem = items.find((i) => i.type === 'enum')!;
      const { stdin, waitUntilReady, unmount } = await renderDialog({
        items: [enumItem],
      });

      // Press Enter on enum item
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockOnItemToggle).toHaveBeenCalledWith(
          'enum-setting',
          expect.objectContaining({ type: 'enum' }),
        );
      });
      unmount();
    });

    it('should enter edit mode for string items on Enter', async () => {
      const items = createMockItems(4);
      const stringItem = items.find((i) => i.type === 'string')!;
      const { lastFrame, stdin, waitUntilReady, unmount } = await renderDialog({
        items: [stringItem],
      });

      // Press Enter to start editing
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      // Should show the edit buffer with cursor
      await waitFor(() => {
        const frame = lastFrame();
        // In edit mode, the value should be displayed (possibly with cursor)
        expect(frame).toContain('test-value');
      });
      unmount();
    });

    it('should enter edit mode for number items on Enter', async () => {
      const items = createMockItems(4);
      const numberItem = items.find((i) => i.type === 'number')!;
      const { lastFrame, stdin, waitUntilReady, unmount } = await renderDialog({
        items: [numberItem],
      });

      // Press Enter to start editing
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      // Should show the edit buffer
      await waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('42');
      });
      unmount();
    });

    it('should call onItemClear on Ctrl+L', async () => {
      const { stdin, waitUntilReady, unmount } = await renderDialog();

      // Press Ctrl+L to reset
      await act(async () => {
        stdin.write(TerminalKeys.CTRL_L);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockOnItemClear).toHaveBeenCalledWith(
          'boolean-setting',
          expect.objectContaining({ type: 'boolean' }),
        );
      });
      unmount();
    });
  });

  describe('edit mode', () => {
    it('should commit edit on Enter', async () => {
      const items = createMockItems(4);
      const stringItem = items.find((i) => i.type === 'string')!;
      const { stdin, waitUntilReady, unmount } = await renderDialog({
        items: [stringItem],
      });

      // Enter edit mode
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      // Type some characters
      await act(async () => {
        stdin.write('x');
      });
      await waitUntilReady();

      // Commit with Enter
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockOnEditCommit).toHaveBeenCalledWith(
          'string-setting',
          'test-valuex',
          expect.objectContaining({ type: 'string' }),
        );
      });
      unmount();
    });

    it('should commit edit on Escape', async () => {
      const items = createMockItems(4);
      const stringItem = items.find((i) => i.type === 'string')!;
      const { stdin, waitUntilReady, unmount } = await renderDialog({
        items: [stringItem],
      });

      // Enter edit mode
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      // Commit with Escape
      await act(async () => {
        stdin.write(TerminalKeys.ESCAPE);
      });
      // Escape key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
      await act(async () => {
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(mockOnEditCommit).toHaveBeenCalled();
      });
      unmount();
    });

    it('should commit edit and navigate on Down arrow', async () => {
      const items = createMockItems(4);
      const stringItem = items.find((i) => i.type === 'string')!;
      const numberItem = items.find((i) => i.type === 'number')!;
      const { stdin, waitUntilReady, unmount } = await renderDialog({
        items: [stringItem, numberItem],
      });

      // Enter edit mode
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      // Press Down to commit and navigate
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockOnEditCommit).toHaveBeenCalled();
      });
      unmount();
    });

    it('should commit edit and navigate on Up arrow', async () => {
      const items = createMockItems(4);
      const stringItem = items.find((i) => i.type === 'string')!;
      const numberItem = items.find((i) => i.type === 'number')!;
      const { stdin, waitUntilReady, unmount } = await renderDialog({
        items: [stringItem, numberItem],
      });

      // Navigate to second item
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });
      await waitUntilReady();

      // Enter edit mode
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      // Press Up to commit and navigate
      await act(async () => {
        stdin.write(TerminalKeys.UP_ARROW);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockOnEditCommit).toHaveBeenCalled();
      });
      unmount();
    });

    it('should allow number input for number fields', async () => {
      const items = createMockItems(4);
      const numberItem = items.find((i) => i.type === 'number')!;
      const { stdin, waitUntilReady, unmount } = await renderDialog({
        items: [numberItem],
      });

      // Enter edit mode
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      // Type numbers one at a time
      await act(async () => {
        stdin.write('1');
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('2');
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('3');
      });
      await waitUntilReady();

      // Commit
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockOnEditCommit).toHaveBeenCalledWith(
          'number-setting',
          '42123',
          expect.objectContaining({ type: 'number' }),
        );
      });
      unmount();
    });

    it('should support quick number entry for number fields', async () => {
      const items = createMockItems(4);
      const numberItem = items.find((i) => i.type === 'number')!;
      const { stdin, waitUntilReady, unmount } = await renderDialog({
        items: [numberItem],
      });

      // Type a number directly (without Enter first)
      await act(async () => {
        stdin.write('5');
      });
      await waitUntilReady();

      // Should start editing with that number
      await waitFor(async () => {
        // Commit to verify
        await act(async () => {
          stdin.write(TerminalKeys.ENTER);
        });
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(mockOnEditCommit).toHaveBeenCalledWith(
          'number-setting',
          '5',
          expect.objectContaining({ type: 'number' }),
        );
      });
      unmount();
    });
  });

  describe('custom key handling', () => {
    it('should call onKeyPress and respect its return value', async () => {
      const customKeyHandler = vi.fn().mockReturnValue(true);
      const { stdin, waitUntilReady, unmount } = await renderDialog({
        onKeyPress: customKeyHandler,
      });

      // Press a key
      await act(async () => {
        stdin.write('r');
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(customKeyHandler).toHaveBeenCalled();
      });

      // Since handler returned true, default behavior should be blocked
      expect(mockOnClose).not.toHaveBeenCalled();
      unmount();
    });
  });

  describe('focus management', () => {
    it('should keep focus on settings when scope selector is hidden', async () => {
      const { lastFrame, stdin, waitUntilReady, unmount } = await renderDialog({
        showScopeSelector: false,
      });

      // Press Tab - should not crash and focus should stay on settings
      await act(async () => {
        stdin.write(TerminalKeys.TAB);
      });
      await waitUntilReady();

      await waitFor(() => {
        // Should still show settings as focused
        expect(lastFrame()).toContain('> Test Settings');
      });
      unmount();
    });
  });
});
