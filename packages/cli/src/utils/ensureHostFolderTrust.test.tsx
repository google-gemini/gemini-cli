/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink';
import { isHeadlessMode } from '@google/gemini-cli-core';
import { createMockSettings } from '../test-utils/settings.js';
import {
  FolderTrustChoice,
  FolderTrustDialog,
} from '../ui/components/FolderTrustDialog.js';
import {
  isFolderTrustEnabled,
  isWorkspaceTrusted,
  TrustLevel,
} from '../config/trustedFolders.js';
import { persistHostTrust } from './sandboxTrust.js';
import { ensureHostFolderTrust } from './ensureHostFolderTrust.js';

vi.mock('ink', () => ({
  render: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isHeadlessMode: vi.fn(),
  };
});

vi.mock('../config/trustedFolders.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../config/trustedFolders.js')>();
  return {
    ...actual,
    isFolderTrustEnabled: vi.fn(),
    isWorkspaceTrusted: vi.fn(),
  };
});

vi.mock('./sandboxTrust.js', () => ({
  persistHostTrust: vi.fn(() => Promise.resolve()),
}));

function findOnSelect(
  node: unknown,
): ((choice: FolderTrustChoice) => void) | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  const el = node as { props?: { onSelect?: unknown; children?: unknown } };
  if (typeof el.props?.onSelect === 'function') {
    return el.props.onSelect as (choice: FolderTrustChoice) => void;
  }
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findOnSelect(child);
      if (found) {
        return found;
      }
    }
  } else if (children) {
    return findOnSelect(children);
  }
  return undefined;
}

describe('ensureHostFolderTrust', () => {
  const cwd = '/tmp/untrusted-project';
  const settings = createMockSettings();
  const mockUnmount = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isHeadlessMode).mockReturnValue(false);
    vi.mocked(isFolderTrustEnabled).mockReturnValue(true);
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    vi.mocked(render).mockReturnValue({
      unmount: mockUnmount,
    } as unknown as ReturnType<typeof render>);
  });

  it('does nothing when folder trust is disabled', async () => {
    vi.mocked(isFolderTrustEnabled).mockReturnValue(false);

    await ensureHostFolderTrust(settings, cwd);

    expect(render).not.toHaveBeenCalled();
    expect(persistHostTrust).not.toHaveBeenCalled();
  });

  it('does nothing when the workspace trust is already decided', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });

    await ensureHostFolderTrust(settings, cwd);

    expect(render).not.toHaveBeenCalled();
    expect(persistHostTrust).not.toHaveBeenCalled();
  });

  it('does nothing in headless mode', async () => {
    vi.mocked(isHeadlessMode).mockReturnValue(true);

    await ensureHostFolderTrust(settings, cwd);

    expect(render).not.toHaveBeenCalled();
    expect(persistHostTrust).not.toHaveBeenCalled();
  });

  it.each([
    [FolderTrustChoice.TRUST_FOLDER, TrustLevel.TRUST_FOLDER],
    [FolderTrustChoice.TRUST_PARENT, TrustLevel.TRUST_PARENT],
    [FolderTrustChoice.DO_NOT_TRUST, TrustLevel.DO_NOT_TRUST],
  ] as const)(
    'persists %s on the host and unmounts the dialog',
    async (choice, level) => {
      const promise = ensureHostFolderTrust(settings, cwd);

      expect(render).toHaveBeenCalledTimes(1);
      const element = vi.mocked(render).mock.calls[0][0];
      const onSelect = findOnSelect(element);
      expect(onSelect).toBeTypeOf('function');

      onSelect!(choice);
      await promise;

      expect(mockUnmount).toHaveBeenCalled();
      expect(persistHostTrust).toHaveBeenCalledWith(cwd, level);
    },
  );

  it('renders FolderTrustDialog with explicit terminal dimensions', async () => {
    const promise = ensureHostFolderTrust(settings, cwd);
    const element = vi.mocked(render).mock.calls[0][0];
    const dialog = findDialogElement(element);

    expect(dialog?.type).toBe(FolderTrustDialog);
    expect(dialog?.props).toEqual(
      expect.objectContaining({
        isRestarting: false,
        constrainHeight: true,
        terminalHeight: expect.any(Number),
        terminalWidth: expect.any(Number),
      }),
    );

    findOnSelect(element)!(FolderTrustChoice.TRUST_FOLDER);
    await promise;
  });
});

function findDialogElement(node: unknown): {
  type: unknown;
  props: Record<string, unknown>;
} | null {
  if (!node || typeof node !== 'object') {
    return null;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === FolderTrustDialog) {
    return { type: el.type, props: el.props ?? {} };
  }
  const children = el.props?.['children'];
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findDialogElement(child);
      if (found) {
        return found;
      }
    }
  } else if (children) {
    return findDialogElement(children);
  }
  return null;
}
