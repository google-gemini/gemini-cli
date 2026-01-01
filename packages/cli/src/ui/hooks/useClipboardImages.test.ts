/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useClipboardImages } from './useClipboardImages.js';

// Mock the fs module to avoid actual file system operations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake image data')),
  stat: vi.fn().mockResolvedValue({ size: 1024 }), // Default: 1KB (under limit)
}));

describe('useClipboardImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerImage', () => {
    it('should assign sequential IDs to different images', () => {
      const { result } = renderHook(() => useClipboardImages());

      let text1 = '';
      let text2 = '';
      let text3 = '';
      act(() => {
        text1 = result.current.registerImage('/path/to/image1.png');
        text2 = result.current.registerImage('/path/to/image2.png');
        text3 = result.current.registerImage('/path/to/image3.png');
      });

      expect(text1).toBe('[Image #1]');
      expect(text2).toBe('[Image #2]');
      expect(text3).toBe('[Image #3]');
    });

    it('should be idempotent - same path returns same display text', () => {
      const { result } = renderHook(() => useClipboardImages());

      let text1 = '';
      let text2 = '';
      let text3 = '';
      act(() => {
        text1 = result.current.registerImage('/path/to/image.png');
        text2 = result.current.registerImage('/path/to/image.png');
        text3 = result.current.registerImage('/path/to/image.png');
      });

      expect(text1).toBe('[Image #1]');
      expect(text2).toBe('[Image #1]');
      expect(text3).toBe('[Image #1]');
      expect(result.current.images.length).toBe(1);
    });

    it('should handle rapid registrations correctly (simulating drag-drop)', () => {
      const { result } = renderHook(() => useClipboardImages());

      const paths = ['/a.png', '/b.png', '/c.png', '/d.png', '/e.png'];
      const texts: string[] = [];
      act(() => {
        paths.forEach((p) => texts.push(result.current.registerImage(p)));
      });

      expect(texts).toEqual([
        '[Image #1]',
        '[Image #2]',
        '[Image #3]',
        '[Image #4]',
        '[Image #5]',
      ]);
      expect(result.current.images.length).toBe(5);
    });
  });

  describe('clear', () => {
    it('should reset images array and ID counter', () => {
      const { result } = renderHook(() => useClipboardImages());

      act(() => {
        result.current.registerImage('/path/to/image1.png');
        result.current.registerImage('/path/to/image2.png');
      });
      expect(result.current.images.length).toBe(2);

      act(() => {
        result.current.clear();
      });
      expect(result.current.images.length).toBe(0);

      let newText = '';
      act(() => {
        newText = result.current.registerImage('/path/to/new-image.png');
      });
      expect(newText).toBe('[Image #1]');
    });
  });

  describe('getImagePartsForText', () => {
    it('should only return images whose tags are present in text', async () => {
      const { result } = renderHook(() => useClipboardImages());

      act(() => {
        result.current.registerImage('/path/to/image1.png');
        result.current.registerImage('/path/to/image2.png');
        result.current.registerImage('/path/to/image3.png');
      });

      // Only mention Image #1 and #3 in text (user deleted #2)
      const { parts } = await result.current.getImagePartsForText(
        'Hello [Image #1] and [Image #3]',
      );

      expect(parts.length).toBe(2);
    });

    it('should return empty array when user deletes all image tags', async () => {
      const { result } = renderHook(() => useClipboardImages());

      act(() => {
        result.current.registerImage('/path/to/image1.png');
        result.current.registerImage('/path/to/image2.png');
      });

      // User deleted all [Image #N] tags from their message
      const { parts } = await result.current.getImagePartsForText(
        'Hello world, no images here',
      );

      expect(parts).toEqual([]);
    });

    it('should skip images exceeding 20MB size limit', async () => {
      const fs = await import('node:fs/promises');
      const statMock = vi.mocked(fs.stat);

      // First image: 25MB (over limit), Second image: 1KB (under limit)
      statMock
        .mockResolvedValueOnce({ size: 25 * 1024 * 1024 } as Awaited<
          ReturnType<typeof fs.stat>
        >)
        .mockResolvedValueOnce({ size: 1024 } as Awaited<
          ReturnType<typeof fs.stat>
        >);

      const { result } = renderHook(() => useClipboardImages());

      act(() => {
        result.current.registerImage('/path/to/huge-image.png');
        result.current.registerImage('/path/to/small-image.png');
      });

      const { parts } = await result.current.getImagePartsForText(
        '[Image #1] [Image #2]',
      );

      // Only the small image should be included
      expect(parts.length).toBe(1);
    });
  });

  describe('validateImage', () => {
    it('should return valid for supported image under size limit', async () => {
      const fs = await import('node:fs/promises');
      const statMock = vi.mocked(fs.stat);
      statMock.mockResolvedValueOnce({ size: 1024 } as Awaited<
        ReturnType<typeof fs.stat>
      >);

      const { result } = renderHook(() => useClipboardImages());
      const validation =
        await result.current.validateImage('/path/to/image.png');

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should return error for unsupported image format', async () => {
      const { result } = renderHook(() => useClipboardImages());
      const validation =
        await result.current.validateImage('/path/to/image.gif');

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Unsupported image format');
    });

    it('should return error for image exceeding 20MB', async () => {
      const fs = await import('node:fs/promises');
      const statMock = vi.mocked(fs.stat);
      statMock.mockResolvedValueOnce({ size: 25 * 1024 * 1024 } as Awaited<
        ReturnType<typeof fs.stat>
      >);

      const { result } = renderHook(() => useClipboardImages());
      const validation =
        await result.current.validateImage('/path/to/huge.png');

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('exceeds 20MB limit');
    });

    it('should return error when file cannot be read', async () => {
      const fs = await import('node:fs/promises');
      const statMock = vi.mocked(fs.stat);
      statMock.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      const { result } = renderHook(() => useClipboardImages());
      const validation = await result.current.validateImage(
        '/path/to/missing.png',
      );

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Cannot read image');
    });
  });
});
