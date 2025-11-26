/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../test-utils/render.js';
import { ContextWindowBar } from './ContextWindowBar.js';

describe('<ContextWindowBar />', () => {
  const defaultWidth = 100; // Simulated terminal width

  describe('core functionality', () => {
    it('should render with zero tokens', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={0}
          tokenLimit={1_048_576}
          percentage={0}
          zone="green"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('0/1M');
      // At 0%, bar should be mostly empty (─)
      expect(output).toContain('─');
    });

    it('should render at 25% usage (half of compression threshold)', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={262_144}
          tokenLimit={1_048_576}
          percentage={25}
          zone="green"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('262K/1M');
      // At 25%, visual bar should be ~50% filled (since 50% = full bar)
      expect(output).toContain('▬');
      expect(output).toContain('─');
    });

    it('should render at 50% usage (compression threshold = full bar)', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={524_288}
          tokenLimit={1_048_576}
          percentage={50}
          zone="yellow"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('524K/1M');
      // At 50%, bar should be completely filled (▬)
      expect(output).toContain('▬');
      // Should have minimal or no empty sections
      const filled = (output?.match(/▬/g) || []).length;
      const empty = (output?.match(/─/g) || []).length;
      expect(filled).toBeGreaterThan(empty);
    });

    it('should render at 75% usage (over compression threshold)', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={786_432}
          tokenLimit={1_048_576}
          percentage={75}
          zone="red"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('786K/1M');
      // At 75%, bar is 150% of visual width (clamped to 100%)
      expect(output).toContain('▬');
    });
  });

  describe('color zones', () => {
    it('should render in green zone when usage < 50%', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={400_000}
          tokenLimit={1_048_576}
          percentage={38.1}
          zone="green"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toBeTruthy();
      expect(output).toContain('400K/1M');
    });

    it('should render in yellow zone when 50% <= usage < 75%', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={600_000}
          tokenLimit={1_048_576}
          percentage={57.2}
          zone="yellow"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toBeTruthy();
      expect(output).toContain('600K/1M');
    });

    it('should render in red zone when usage >= 75%', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={800_000}
          tokenLimit={1_048_576}
          percentage={76.3}
          zone="red"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toBeTruthy();
      expect(output).toContain('800K/1M');
    });
  });

  describe('token count formatting', () => {
    it('should format tokens in millions (M)', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={1_500_000}
          tokenLimit={2_097_152}
          percentage={71.5}
          zone="yellow"
          willCompressAt={1_048_576}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('1.5M');
      expect(output).toContain('2.1M');
    });

    it('should format tokens in thousands (K)', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={750_000}
          tokenLimit={1_048_576}
          percentage={71.5}
          zone="yellow"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('750K');
      expect(output).toContain('1M');
    });

    it('should format small token counts as numbers', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={500}
          tokenLimit={1_048_576}
          percentage={0.05}
          zone="green"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('500');
    });
  });

  describe('visual bar scaling', () => {
    it('should have mostly empty bar at 10% usage', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={104_857}
          tokenLimit={1_048_576}
          percentage={10}
          zone="green"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      // 10% usage = 20% visual fill (since 50% = 100% visual)
      const filled = (output?.match(/▬/g) || []).length;
      const empty = (output?.match(/─/g) || []).length;
      expect(empty).toBeGreaterThan(filled);
    });

    it('should have roughly balanced bar at 25% usage', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={262_144}
          tokenLimit={1_048_576}
          percentage={25}
          zone="green"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      // 25% usage = 50% visual fill
      const filled = (output?.match(/▬/g) || []).length;
      const empty = (output?.match(/─/g) || []).length;
      // Should be roughly equal (within reasonable tolerance)
      expect(Math.abs(filled - empty)).toBeLessThan(20);
    });

    it('should have completely filled bar at 50% usage', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={524_288}
          tokenLimit={1_048_576}
          percentage={50}
          zone="yellow"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      // 50% usage = 100% visual fill
      const filled = (output?.match(/▬/g) || []).length;
      const empty = (output?.match(/─/g) || []).length;
      expect(filled).toBeGreaterThan(empty * 3); // Should be much more filled
    });
  });

  describe('edge cases', () => {
    it('should handle >100% token usage gracefully', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={1_200_000}
          tokenLimit={1_048_576}
          percentage={114.4}
          zone="red"
          willCompressAt={524_288}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toBeTruthy();
      expect(output).toContain('1.2M/1M'); // 1_200_000 = 1.2M
    });

    it('should handle very large token counts', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={15_000_000}
          tokenLimit={20_000_000}
          percentage={75}
          zone="red"
          willCompressAt={10_000_000}
          width={defaultWidth}
        />,
      );

      const output = lastFrame();
      expect(output).toContain('15M');
      expect(output).toContain('20M');
    });

    it('should handle no width parameter', () => {
      const { lastFrame } = render(
        <ContextWindowBar
          tokenCount={400_000}
          tokenLimit={1_048_576}
          percentage={38.1}
          zone="green"
          willCompressAt={524_288}
        />,
      );

      const output = lastFrame();
      expect(output).toBeTruthy();
      expect(output).toContain('400K/1M');
    });
  });
});
