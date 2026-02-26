/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLink, linkCommand } from './link.js';

const mockLinkSkill = vi.hoisted(() => vi.fn());
const mockRequestConsentNonInteractive = vi.hoisted(() => vi.fn());
const mockSkillsConsentString = vi.hoisted(() => vi.fn());

vi.mock('../../utils/skillUtils.js', () => ({
  linkSkill: mockLinkSkill,
}));

const { debugLogger } = await vi.hoisted(async () => {
  const { createMockDebugLogger } = await import(
    '../../test-utils/mockDebugLogger.js'
  );
  return createMockDebugLogger({ stripAnsi: false });
});

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger,
}));

vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: mockRequestConsentNonInteractive,
  skillsConsentString: mockSkillsConsentString,
}));

describe('skills link command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  describe('linkCommand', () => {
    it('should have correct command and describe', () => {
      expect(linkCommand.command).toBe('link <path>');
      expect(linkCommand.describe).toContain('Links an agent skill');
    });
  });

  it('should call linkSkill with correct arguments', async () => {
    const sourcePath = '/source/path';
    mockLinkSkill.mockResolvedValue([
      { name: 'test-skill', location: '/dest/path' },
    ]);

    await handleLink({ path: sourcePath, scope: 'user' });

    expect(mockLinkSkill).toHaveBeenCalledWith(
      sourcePath,
      'user',
      expect.any(Function),
      expect.any(Function),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Successfully linked skills'),
    );
  });

  it('should handle linkSkill failure', async () => {
    mockLinkSkill.mockRejectedValue(new Error('Link failed'));

    await handleLink({ path: '/some/path' });

    expect(debugLogger.error).toHaveBeenCalledWith('Link failed');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
