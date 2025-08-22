/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import {
  CompressionMessage,
  CompressionDisplayProps,
} from './CompressionMessage.js';
import { CompressionProps } from '../../types.js';
import { describe, it, expect } from 'vitest';

describe('<CompressionMessage />', () => {
  const createCompressionProps = (
    overrides: Partial<CompressionProps> = {},
  ): CompressionDisplayProps => ({
    compression: {
      isPending: false,
      originalTokenCount: null,
      newTokenCount: null,
      ...overrides,
    },
  });

  describe('pending state', () => {
    it('renders pending message when compression is in progress', () => {
      const props = createCompressionProps({ isPending: true });
      const { lastFrame } = render(<CompressionMessage {...props} />);
      const output = lastFrame();

      expect(output).toContain('Compressing chat history');
    });
  });

  describe('normal compression (successful token reduction)', () => {
    it('renders success message when tokens are reduced', () => {
      const props = createCompressionProps({
        isPending: false,
        originalTokenCount: 100,
        newTokenCount: 50,
      });
      const { lastFrame } = render(<CompressionMessage {...props} />);
      const output = lastFrame();

      expect(output).toContain('✦');
      expect(output).toContain(
        'Chat history compressed from 100 to 50 tokens.',
      );
    });
  });

  describe('skipped compression (tokens increased or same)', () => {
    it('renders skip message when compression would increase token count', () => {
      const props = createCompressionProps({
        isPending: false,
        originalTokenCount: 50,
        newTokenCount: 75,
      });
      const { lastFrame } = render(<CompressionMessage {...props} />);
      const output = lastFrame();

      expect(output).toContain('✦');
      expect(output).toContain(
        'Skipping compression for small history as the process would have increased its size.',
      );
    });

    it('renders skip message when token counts are equal', () => {
      const props = createCompressionProps({
        isPending: false,
        originalTokenCount: 50,
        newTokenCount: 50,
      });
      const { lastFrame } = render(<CompressionMessage {...props} />);
      const output = lastFrame();

      expect(output).toContain(
        'Skipping compression for small history as the process would have increased its size.',
      );
    });
  });

  describe('message content validation', () => {
    it('displays correct compression statistics', () => {
      const testCases = [
        {
          original: 200,
          new: 80,
          expected: 'compressed from 200 to 80 tokens',
        },
        {
          original: 500,
          new: 150,
          expected: 'compressed from 500 to 150 tokens',
        },
        {
          original: 1500,
          new: 400,
          expected: 'compressed from 1500 to 400 tokens',
        },
      ];

      testCases.forEach(({ original, new: newTokens, expected }) => {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
        });
        const { lastFrame } = render(<CompressionMessage {...props} />);
        const output = lastFrame();

        expect(output).toContain(expected);
      });
    });

    it('always shows skip message when new tokens >= original tokens', () => {
      const testCases = [
        { original: 50, new: 60 }, // Increased
        { original: 100, new: 100 }, // Same
      ];

      testCases.forEach(({ original, new: newTokens }) => {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
        });
        const { lastFrame } = render(<CompressionMessage {...props} />);
        const output = lastFrame();

        expect(output).toContain(
          'Skipping compression for small history as the process would have increased its size.',
        );
        expect(output).not.toContain('compressed from');
      });
    });
  });
});
