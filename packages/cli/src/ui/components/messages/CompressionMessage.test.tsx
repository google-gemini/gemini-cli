/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import type { CompressionDisplayProps } from './CompressionMessage.js';
import { CompressionMessage } from './CompressionMessage.js';
import { CompressionStatus } from '@google/gemini-cli-core';
import type { CompressionProps } from '../../types.js';
import { describe, it, expect } from 'vitest';

describe('<CompressionMessage />', () => {
  const createCompressionProps = (
    overrides: Partial<CompressionProps> = {},
  ): CompressionDisplayProps => ({
    compression: {
      isPending: false,
      originalTokenCount: null,
      newTokenCount: null,
      compressionStatus: CompressionStatus.COMPRESSED,
      ...overrides,
    },
  });

  describe('pending state', () => {
    it('renders pending message when compression is in progress', () => {
      const props = createCompressionProps({ isPending: true });
      const { lastFrame, unmount } = render(<CompressionMessage {...props} />);
      const output = lastFrame();

      expect(output).toContain('Compressing chat history');
      unmount();
    });
  });

  describe('normal compression (successful token reduction)', () => {
    it('renders success message when tokens are reduced', () => {
      const props = createCompressionProps({
        isPending: false,
        originalTokenCount: 100,
        newTokenCount: 50,
        compressionStatus: CompressionStatus.COMPRESSED,
      });
      const { lastFrame, unmount } = render(<CompressionMessage {...props} />);
      const output = lastFrame();

      expect(output).toContain('✦');
      expect(output).toContain(
        'Chat history compressed from 100 to 50 tokens.',
      );
      unmount();
    });

    it('renders success message for large successful compressions', () => {
      const testCases = [
        { original: 50000, new: 25000 }, // Large compression
        { original: 700000, new: 350000 }, // Very large compression
      ];

      for (const { original, new: newTokens } of testCases) {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
          compressionStatus: CompressionStatus.COMPRESSED,
        });
        const { lastFrame, unmount } = render(
          <CompressionMessage {...props} />,
        );
        const output = lastFrame();

        expect(output).toContain('✦');
        expect(output).toContain(
          `compressed from ${original} to ${newTokens} tokens`,
        );
        expect(output).not.toContain('Skipping compression');
        expect(output).not.toContain('did not reduce size');
        unmount();
      }
    });
  });

  describe('skipped compression (tokens increased or same)', () => {
    it('renders skip message when compression would increase token count', () => {
      const props = createCompressionProps({
        isPending: false,
        originalTokenCount: 50,
        newTokenCount: 75,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      });
      const { lastFrame, unmount } = render(<CompressionMessage {...props} />);
      const output = lastFrame();

      expect(output).toContain('✦');
      expect(output).toContain(
        'Compression was not beneficial for this history size.',
      );
      unmount();
    });

    it('renders skip message when token counts are equal', () => {
      const props = createCompressionProps({
        isPending: false,
        originalTokenCount: 50,
        newTokenCount: 50,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      });
      const { lastFrame, unmount } = render(<CompressionMessage {...props} />);
      const output = lastFrame();

      expect(output).toContain(
        'Compression was not beneficial for this history size.',
      );
      unmount();
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

      for (const { original, new: newTokens, expected } of testCases) {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
          compressionStatus: CompressionStatus.COMPRESSED,
        });
        const { lastFrame, unmount } = render(
          <CompressionMessage {...props} />,
        );
        const output = lastFrame();

        expect(output).toContain(expected);
        unmount();
      }
    });

    it('shows skip message for small histories when new tokens >= original tokens', () => {
      const testCases = [
        { original: 50, new: 60 }, // Increased
        { original: 100, new: 100 }, // Same
        { original: 49999, new: 50000 }, // Just under 50k threshold
      ];

      for (const { original, new: newTokens } of testCases) {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });
        const { lastFrame, unmount } = render(
          <CompressionMessage {...props} />,
        );
        const output = lastFrame();

        expect(output).toContain(
          'Compression was not beneficial for this history size.',
        );
        expect(output).not.toContain('compressed from');
        unmount();
      }
    });

    it('shows compression failure message for large histories when new tokens >= original tokens', () => {
      const testCases = [
        { original: 50000, new: 50100 }, // At 50k threshold
        { original: 700000, new: 710000 }, // Large history case
        { original: 100000, new: 100000 }, // Large history, same count
      ];

      for (const { original, new: newTokens } of testCases) {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });
        const { lastFrame, unmount } = render(
          <CompressionMessage {...props} />,
        );
        const output = lastFrame();

        expect(output).toContain('compression did not reduce size');
        expect(output).not.toContain('compressed from');
        expect(output).not.toContain('Compression was not beneficial');
        unmount();
      }
    });
  });
});
