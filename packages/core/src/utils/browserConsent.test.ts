/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { coreEvents } from './events.js';
import { Storage } from '../config/storage.js';

// Mock fs/promises before importing the module under test
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock Storage to return a predictable directory
vi.mock('../config/storage.js', () => ({
  Storage: {
    getGlobalGeminiDir: vi.fn(),
  },
}));

import { getBrowserConsentIfNeeded } from './browserConsent.js';

describe('browserConsent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(Storage.getGlobalGeminiDir).mockReturnValue('/mock/.gemini');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return true if consent file already exists', async () => {
    // Consent file exists — fs.access resolves
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const result = await getBrowserConsentIfNeeded();

    expect(result).toBe(true);
    // Should not emit a consent request
    const emitSpy = vi.spyOn(coreEvents, 'emitConsentRequest');
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should auto-accept in non-interactive mode (no listeners) without persisting consent', async () => {
    // Consent file does not exist
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    // No listeners registered
    vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(0);

    const result = await getBrowserConsentIfNeeded();

    expect(result).toBe(true);
    // Should NOT persist the consent — an interactive user on the same machine
    // must still see the dialog the first time they use the browser agent.
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should request consent interactively and return true when accepted', async () => {
    // Consent file does not exist
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    // Simulate interactive mode: there is at least one listener
    vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);
    // Mock emitConsentRequest to auto-confirm
    vi.spyOn(coreEvents, 'emitConsentRequest').mockImplementation((payload) => {
      payload.onConfirm(true);
    });

    const result = await getBrowserConsentIfNeeded();

    expect(result).toBe(true);
    expect(coreEvents.emitConsentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Privacy Notice'),
      }),
    );
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should return false when user declines consent', async () => {
    // Consent file does not exist
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    // Simulate interactive mode
    vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);
    // Mock emitConsentRequest to decline
    vi.spyOn(coreEvents, 'emitConsentRequest').mockImplementation((payload) => {
      payload.onConfirm(false);
    });

    const result = await getBrowserConsentIfNeeded();

    expect(result).toBe(false);
    // Should NOT persist consent
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should include privacy policy link in the prompt', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);
    vi.spyOn(coreEvents, 'emitConsentRequest').mockImplementation((payload) => {
      payload.onConfirm(true);
    });

    await getBrowserConsentIfNeeded();

    expect(coreEvents.emitConsentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('policies.google.com/privacy'),
      }),
    );
  });
});
