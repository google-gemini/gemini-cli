/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import {
  CompressionMessage,
  type CompressionDisplayProps,
} from './CompressionMessage.js';
import { CompressionStatus } from '@google/gemini-cli-core';
import { type CompressionProps } from '../../types.js';
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('<CompressionMessage />', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createCompressionProps = (
    overrides: Partial<CompressionProps> = {},
  ): CompressionDisplayProps => ({
    compression: {
      isPending: false,
      beforePercentage: null,
      afterPercentage: null,
      compressionStatus: CompressionStatus.COMPRESSED,
      isManual: true,
      ...overrides,
    },
  });

  describe('pending state', () => {
    it('renders pending message when compression is in progress', async () => {
      const props = createCompressionProps({ isPending: true });
      const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
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
        beforePercentage: 22,
        afterPercentage: 6,
        compressionStatus: CompressionStatus.COMPRESSED,
        thresholdPercentage: 50,
      });
      const { lastFrame, unmount } = await renderWithProviders(
        <CompressionMessage {...props} />,
      );
      const output = lastFrame();

      expect(output).not.toContain('✦');
      expect(output).toContain(
        'Context compressed (22% → 6%). Adjust threshold (50%) in /settings.',
      );
      unmount();
    });
  });

  describe('skipped compression (tokens increased or same)', () => {
    it('renders skip message when compression would increase token count', async () => {
      const props = createCompressionProps({
        isPending: false,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      });
      const { lastFrame, unmount } = await renderWithProviders(
        <CompressionMessage {...props} />,
      );
      const output = lastFrame();

      expect(output).not.toContain('✦');
      expect(output).toContain(
        'Compression was not beneficial for this history size.',
      );
      unmount();
    });
  });

  describe('failure states', () => {
    it('renders failure message when model returns an empty summary', async () => {
      const props = createCompressionProps({
        isPending: false,
        compressionStatus: CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY,
      });
      const { lastFrame, unmount } = await renderWithProviders(
        <CompressionMessage {...props} />,
      );
      const output = lastFrame();

      expect(output).not.toContain('✦');
      expect(output).toContain(
        'Chat history compression failed: empty summary.',
      );
      unmount();
    });

    it('renders failure message for token count errors', async () => {
      const props = createCompressionProps({
        isPending: false,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      });
      const { lastFrame, unmount } = await renderWithProviders(
        <CompressionMessage {...props} />,
      );
      const output = lastFrame();

      expect(output).toContain(
        'Could not compress chat history due to a token counting error.',
      );
      unmount();
    });
  });
});
