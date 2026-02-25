/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
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
    it('renders pending message when compression is in progress', async () => {
      const props = createCompressionProps({ isPending: true });
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <CompressionMessage {...props} />,
      );
      await waitUntilReady();
      const output = lastFrame();

      expect(output).toContain('Compressing chat history');
      unmount();
    });
  });

  describe('normal compression (successful token reduction)', () => {
    it('renders success message when tokens are reduced', async () => {
      const props = createCompressionProps({
        isPending: false,
        originalTokenCount: 100,
        newTokenCount: 50,
        compressionStatus: CompressionStatus.COMPRESSED,
      });
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <CompressionMessage {...props} />,
      );
      await waitUntilReady();
      const output = lastFrame();

      expect(output).toContain('✦');
      expect(output).toContain(
        'Chat history compressed from 100 to 50 tokens.',
      );
      unmount();
    });

    it.each([
      { original: 50000, newTokens: 25000 }, // Large compression
      { original: 700000, newTokens: 350000 }, // Very large compression
    ])(
      'renders success message for large successful compression (from $original to $newTokens)',
      async ({ original, newTokens }) => {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
          compressionStatus: CompressionStatus.COMPRESSED,
        });
        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <CompressionMessage {...props} />,
        );
        await waitUntilReady();
        const output = lastFrame();

        expect(output).toContain('✦');
        expect(output).toContain(
          `compressed from ${original} to ${newTokens} tokens`,
        );
        expect(output).not.toContain('Skipping compression');
        expect(output).not.toContain('did not reduce size');
        unmount();
      },
    );
  });

  describe('skipped compression (tokens increased or same)', () => {
    it('renders skip message when compression would increase token count', async () => {
      const props = createCompressionProps({
        isPending: false,
        originalTokenCount: 50,
        newTokenCount: 75,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      });
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <CompressionMessage {...props} />,
      );
      await waitUntilReady();
      const output = lastFrame();

      expect(output).toContain('✦');
      expect(output).toContain(
        'Compression was not beneficial for this history size.',
      );
      unmount();
    });

    it('renders skip message when token counts are equal', async () => {
      const props = createCompressionProps({
        isPending: false,
        originalTokenCount: 50,
        newTokenCount: 50,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      });
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <CompressionMessage {...props} />,
      );
      await waitUntilReady();
      const output = lastFrame();

      expect(output).toContain(
        'Compression was not beneficial for this history size.',
      );
      unmount();
    });
  });

  describe('message content validation', () => {
    it.each([
      {
        original: 200,
        newTokens: 80,
        expected: 'compressed from 200 to 80 tokens',
      },
      {
        original: 500,
        newTokens: 150,
        expected: 'compressed from 500 to 150 tokens',
      },
      {
        original: 1500,
        newTokens: 400,
        expected: 'compressed from 1500 to 400 tokens',
      },
    ])(
      'displays correct compression statistics (from $original to $newTokens)',
      async ({ original, newTokens, expected }) => {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
          compressionStatus: CompressionStatus.COMPRESSED,
        });
        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <CompressionMessage {...props} />,
        );
        await waitUntilReady();
        const output = lastFrame();

        expect(output).toContain(expected);
        unmount();
      },
    );

    it.each([
      { original: 50, newTokens: 60 }, // Increased
      { original: 100, newTokens: 100 }, // Same
      { original: 49999, newTokens: 50000 }, // Just under 50k threshold
    ])(
      'shows skip message for small histories when new tokens >= original tokens ($original -> $newTokens)',
      async ({ original, newTokens }) => {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });
        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <CompressionMessage {...props} />,
        );
        await waitUntilReady();
        const output = lastFrame();

        expect(output).toContain(
          'Compression was not beneficial for this history size.',
        );
        expect(output).not.toContain('compressed from');
        unmount();
      },
    );

    it.each([
      { original: 50000, newTokens: 50100 }, // At 50k threshold
      { original: 700000, newTokens: 710000 }, // Large history case
      { original: 100000, newTokens: 100000 }, // Large history, same count
    ])(
      'shows compression failure message for large histories when new tokens >= original tokens ($original -> $newTokens)',
      async ({ original, newTokens }) => {
        const props = createCompressionProps({
          isPending: false,
          originalTokenCount: original,
          newTokenCount: newTokens,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });
        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <CompressionMessage {...props} />,
        );
        await waitUntilReady();
        const output = lastFrame();

        expect(output).toContain('compression did not reduce size');
        expect(output).not.toContain('compressed from');
        expect(output).not.toContain('Compression was not beneficial');
        unmount();
      },
    );
  });

  describe('failure states', () => {
    it('renders failure message when model returns an empty summary', async () => {
      const props = createCompressionProps({
        isPending: false,
        compressionStatus: CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY,
      });
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <CompressionMessage {...props} />,
      );
      await waitUntilReady();
      const output = lastFrame();

      expect(output).toContain('✦');
      expect(output).toContain(
        'Chat history compression failed: the model returned an empty summary.',
      );
      unmount();
    });

    it('renders failure message for token count errors', async () => {
      const props = createCompressionProps({
        isPending: false,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      });
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <CompressionMessage {...props} />,
      );
      await waitUntilReady();
      const output = lastFrame();

      expect(output).toContain(
        'Could not compress chat history due to a token counting error.',
      );
      unmount();
    });
  });
});
