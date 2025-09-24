/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { findLinkedIssue } from '../link-utils.js';

const REPO = 'google-gemini/gemini-cli';

describe('findLinkedIssue', () => {
  it('detects simple #number references', () => {
    expect(findLinkedIssue('Fixes #123', REPO)).toBe('123');
  });

  it('detects full GitHub issue URLs', () => {
    const text = 'Addresses https://github.com/google-gemini/gemini-cli/issues/9876';
    expect(findLinkedIssue(text, REPO)).toBe('9876');
  });

  it('detects owner/repo#number references', () => {
    expect(findLinkedIssue('See google-gemini/gemini-cli#42 for details', REPO)).toBe('42');
  });

  it('detects keyword with issue number without hash', () => {
    expect(findLinkedIssue('Resolves issue 55', REPO)).toBe('55');
  });

  it('detects keyword with issue number including hash', () => {
    expect(findLinkedIssue('Closes issue #789', REPO)).toBe('789');
  });

  it('detects keyword with GH-notation', () => {
    expect(findLinkedIssue('Fixes GH-321', REPO)).toBe('321');
  });

  it('returns empty string when no issue reference exists', () => {
    expect(findLinkedIssue('No issue linked here', REPO)).toBe('');
  });

  it('falls back gracefully when repository is missing', () => {
    expect(findLinkedIssue('Fixes #101', '')).toBe('101');
  });
});
