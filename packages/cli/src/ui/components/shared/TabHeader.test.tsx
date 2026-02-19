/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { TabHeader, type Tab } from './TabHeader.js';

const MOCK_TABS: Tab[] = [
  { key: '0', header: 'Tab 1' },
  { key: '1', header: 'Tab 2' },
  { key: '2', header: 'Tab 3' },
];

describe('TabHeader', () => {
  describe('rendering', () => {
    it('renders null for single tab', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader
          tabs={[{ key: '0', header: 'Only Tab' }]}
          currentIndex={0}
        />,
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toBe('');
      unmount();
    });

    it('renders all tab headers', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      expect(frame).toContain('Tab 1');
      expect(frame).toContain('Tab 2');
      expect(frame).toContain('Tab 3');
      expect(frame).toMatchSnapshot();
      unmount();
    });

    it('renders separators between tabs', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      // Should have 2 separators for 3 tabs
      const separatorCount = (frame?.match(/│/g) || []).length;
      expect(separatorCount).toBe(2);
      expect(frame).toMatchSnapshot();
      unmount();
    });
  });

  describe('arrows', () => {
    it('shows arrows by default', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      expect(frame).toContain('←');
      expect(frame).toContain('→');
      expect(frame).toMatchSnapshot();
      unmount();
    });

    it('hides arrows when showArrows is false', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} showArrows={false} />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      expect(frame).not.toContain('←');
      expect(frame).not.toContain('→');
      expect(frame).toMatchSnapshot();
      unmount();
    });
  });

  describe('status icons', () => {
    it('shows status icons by default', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      // Default uncompleted icon is □
      expect(frame).toContain('□');
      expect(frame).toMatchSnapshot();
      unmount();
    });

    it('hides status icons when showStatusIcons is false', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} showStatusIcons={false} />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      expect(frame).not.toContain('□');
      expect(frame).not.toContain('✓');
      expect(frame).toMatchSnapshot();
      unmount();
    });

    it('shows checkmark for completed tabs', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader
          tabs={MOCK_TABS}
          currentIndex={0}
          completedIndices={new Set([0, 2])}
        />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      // Should have 2 checkmarks and 1 box
      const checkmarkCount = (frame?.match(/✓/g) || []).length;
      const boxCount = (frame?.match(/□/g) || []).length;
      expect(checkmarkCount).toBe(2);
      expect(boxCount).toBe(1);
      expect(frame).toMatchSnapshot();
      unmount();
    });

    it('shows special icon for special tabs', async () => {
      const tabsWithSpecial: Tab[] = [
        { key: '0', header: 'Tab 1' },
        { key: '1', header: 'Review', isSpecial: true },
      ];
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader tabs={tabsWithSpecial} currentIndex={0} />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      // Special tab shows ≡ icon
      expect(frame).toContain('≡');
      expect(frame).toMatchSnapshot();
      unmount();
    });

    it('uses tab statusIcon when provided', async () => {
      const tabsWithCustomIcon: Tab[] = [
        { key: '0', header: 'Tab 1', statusIcon: '★' },
        { key: '1', header: 'Tab 2' },
      ];
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader tabs={tabsWithCustomIcon} currentIndex={0} />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      expect(frame).toContain('★');
      expect(frame).toMatchSnapshot();
      unmount();
    });

    it('uses custom renderStatusIcon when provided', async () => {
      const renderStatusIcon = () => '•';
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader
          tabs={MOCK_TABS}
          currentIndex={0}
          renderStatusIcon={renderStatusIcon}
        />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      const bulletCount = (frame?.match(/•/g) || []).length;
      expect(bulletCount).toBe(3);
      expect(frame).toMatchSnapshot();
      unmount();
    });

    it('falls back to default when renderStatusIcon returns undefined', async () => {
      const renderStatusIcon = () => undefined;
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <TabHeader
          tabs={MOCK_TABS}
          currentIndex={0}
          renderStatusIcon={renderStatusIcon}
        />,
      );
      await waitUntilReady();
      const frame = lastFrame();
      expect(frame).toContain('□');
      expect(frame).toMatchSnapshot();
      unmount();
    });
  });
});
