/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isStrictlyApproved,
  isKnownSafeCommand,
  isDangerousCommand,
} from './commandSafety.js';
import * as paths from '../../utils/paths.js';

vi.mock('../../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/paths.js')>();
  return {
    ...actual,
    resolveToRealPath: vi.fn((p: string) => p),
    isTrustedSystemPath: vi.fn(() => false),
  };
});

describe('commandSafety', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('rg specific logic', () => {
    it('should consider rg safe without unsafe args if path is trusted', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/usr/bin/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      // Using isKnownSafeCommand which calls isSafeToCallWithExec under the hood
      expect(isKnownSafeCommand(['/usr/bin/rg', 'pattern', 'file.txt'])).toBe(
        true,
      );
      expect(paths.resolveToRealPath).toHaveBeenCalledWith('/usr/bin/rg');
      expect(paths.isTrustedSystemPath).toHaveBeenCalledWith('/usr/bin/rg');
    });

    it('should not consider bare rg safe (Search Path Interruption prevention)', () => {
      // Bare 'rg' is not an absolute path, so it fails `isTrustedCommandPath`
      expect(isKnownSafeCommand(['rg', 'pattern', 'file.txt'])).toBe(false);
    });

    it('should not consider rg safe with unsafe args even if path is trusted', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/usr/bin/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      expect(
        isKnownSafeCommand(['/usr/bin/rg', '--search-zip', 'pattern']),
      ).toBe(false);
      expect(isKnownSafeCommand(['/usr/bin/rg', '-z', 'pattern'])).toBe(false);
      expect(isKnownSafeCommand(['/usr/bin/rg', '--pre=cat', 'pattern'])).toBe(
        false,
      );
    });

    it('should consider rg dangerous with unsafe args', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/usr/bin/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      expect(
        isDangerousCommand(['/usr/bin/rg', '--search-zip', 'pattern']),
      ).toBe(true);
      expect(isDangerousCommand(['/usr/bin/rg', '--pre=cat', 'pattern'])).toBe(
        true,
      );
    });

    it('should not consider rg safe if path is untrusted', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/tmp/malicious/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(false);

      expect(isKnownSafeCommand(['/tmp/malicious/rg', 'pattern'])).toBe(false);
      expect(paths.resolveToRealPath).toHaveBeenCalledWith('/tmp/malicious/rg');
    });

    it('should not consider rg safe if path resolution throws', () => {
      vi.mocked(paths.resolveToRealPath).mockImplementation(() => {
        throw new Error('Resolution failed');
      });
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      expect(isKnownSafeCommand(['/some/path/rg', 'pattern'])).toBe(false);
    });

    it('should flag untrusted rg as dangerous if it has unsafe args (Paranoid validation)', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/tmp/malicious/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(false);

      // isDangerousCommand relies on isRipgrepCommand, which strictly identifies intent (name)
      // and doesn't care about path safety. So even an untrusted rg will be flagged if it has unsafe args.
      expect(isDangerousCommand(['/tmp/malicious/rg', '--search-zip'])).toBe(
        true,
      );
    });
  });

  describe('isStrictlyApproved', () => {
    it('should approve rg if explicitly in approved tools regardless of path', async () => {
      // In this case, isStrictlyApproved relies on `tools.includes(command)`
      expect(
        await isStrictlyApproved(
          '/tmp/malicious/rg',
          ['pattern'],
          ['/tmp/malicious/rg'],
        ),
      ).toBe(true);
    });

    it('should approve rg if path is trusted', async () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/usr/bin/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      expect(await isStrictlyApproved('/usr/bin/rg', ['pattern'])).toBe(true);
    });

    it('should reject rg if path is untrusted and not explicitly approved', async () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/tmp/malicious/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(false);

      expect(await isStrictlyApproved('/tmp/malicious/rg', ['pattern'])).toBe(
        false,
      );
    });
  });
});
