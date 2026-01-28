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
    it('renders null for single tab', () => {
      const { lastFrame } = renderWithProviders(
        <TabHeader
          tabs={[{ key: '0', header: 'Only Tab' }]}
          currentIndex={0}
        />,
      );
      expect(lastFrame()).toBe('');
    });

    it('renders all tab headers', () => {
      const { lastFrame } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} />,
      );
      const frame = lastFrame();
      expect(frame).toContain('Tab 1');
      expect(frame).toContain('Tab 2');
      expect(frame).toContain('Tab 3');
      expect(frame).toMatchSnapshot();
    });

    it('renders separators between tabs', () => {
      const { lastFrame } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} />,
      );
      const frame = lastFrame();
      // Should have 2 separators for 3 tabs
      const separatorCount = (frame?.match(/│/g) || []).length;
      expect(separatorCount).toBe(2);
      expect(frame).toMatchSnapshot();
    });
  });

  describe('arrows', () => {
    it('shows arrows by default', () => {
      const { lastFrame } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} />,
      );
      const frame = lastFrame();
      expect(frame).toContain('←');
      expect(frame).toContain('→');
      expect(frame).toMatchSnapshot();
    });

    it('hides arrows when showArrows is false', () => {
      const { lastFrame } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} showArrows={false} />,
      );
      const frame = lastFrame();
      expect(frame).not.toContain('←');
      expect(frame).not.toContain('→');
      expect(frame).toMatchSnapshot();
    });
  });

  describe('status icons', () => {
    it('shows status icons by default', () => {
      const { lastFrame } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} />,
      );
      const frame = lastFrame();
      // Default uncompleted icon is □
      expect(frame).toContain('□');
      expect(frame).toMatchSnapshot();
    });

    it('hides status icons when showStatusIcons is false', () => {
      const { lastFrame } = renderWithProviders(
        <TabHeader tabs={MOCK_TABS} currentIndex={0} showStatusIcons={false} />,
      );
      const frame = lastFrame();
      expect(frame).not.toContain('□');
      expect(frame).not.toContain('✓');
      expect(frame).toMatchSnapshot();
    });

    it('shows checkmark for completed tabs', () => {
      const { lastFrame } = renderWithProviders(
        <TabHeader
          tabs={MOCK_TABS}
          currentIndex={0}
          completedIndices={new Set([0, 2])}
        />,
      );
      const frame = lastFrame();
      // Should have 2 checkmarks and 1 box
      const checkmarkCount = (frame?.match(/✓/g) || []).length;
      const boxCount = (frame?.match(/□/g) || []).length;
      expect(checkmarkCount).toBe(2);
      expect(boxCount).toBe(1);
      expect(frame).toMatchSnapshot();
    });

    it('shows special icon for special tabs', () => {
      const tabsWithSpecial: Tab[] = [
        { key: '0', header: 'Tab 1' },
        { key: '1', header: 'Review', isSpecial: true },
      ];
      const { lastFrame } = renderWithProviders(
        <TabHeader tabs={tabsWithSpecial} currentIndex={0} />,
      );
      const frame = lastFrame();
      // Special tab shows ≡ icon
      expect(frame).toContain('≡');
      expect(frame).toMatchSnapshot();
    });

    it('uses tab statusIcon when provided', () => {
      const tabsWithCustomIcon: Tab[] = [
        { key: '0', header: 'Tab 1', statusIcon: '★' },
        { key: '1', header: 'Tab 2' },
      ];
      const { lastFrame } = renderWithProviders(
        <TabHeader tabs={tabsWithCustomIcon} currentIndex={0} />,
      );
      const frame = lastFrame();
      expect(frame).toContain('★');
      expect(frame).toMatchSnapshot();
    });

    it('uses custom renderStatusIcon when provided', () => {
      const renderStatusIcon = () => '•';
      const { lastFrame } = renderWithProviders(
        <TabHeader
          tabs={MOCK_TABS}
          currentIndex={0}
          renderStatusIcon={renderStatusIcon}
        />,
      );
      const frame = lastFrame();
      const bulletCount = (frame?.match(/•/g) || []).length;
      expect(bulletCount).toBe(3);
      expect(frame).toMatchSnapshot();
    });

    it('falls back to default when renderStatusIcon returns undefined', () => {
      const renderStatusIcon = () => undefined;
      const { lastFrame } = renderWithProviders(
        <TabHeader
          tabs={MOCK_TABS}
          currentIndex={0}
          renderStatusIcon={renderStatusIcon}
        />,
      );
      const frame = lastFrame();
      expect(frame).toContain('□');
      expect(frame).toMatchSnapshot();
    });
  });
});
