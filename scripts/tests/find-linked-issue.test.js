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

  it('detects Height task references introduced with link or close keywords', () => {
    expect(findLinkedIssue('Link T-987', REPO)).toBe('T-987');
    expect(findLinkedIssue('Please LINK T 654 before merging', REPO)).toBe('T-654');
    expect(findLinkedIssue('Close T-432 once reviewed', REPO)).toBe('T-432');
    expect(findLinkedIssue('Closes: T210 to wrap up work', REPO)).toBe('T-210');
  });

  it('ignores malformed or partial issue references', () => {
    expect(findLinkedIssue('Fixes #', REPO)).toBe('');
    expect(findLinkedIssue('Closes issue', REPO)).toBe('');
    expect(findLinkedIssue('Addresses issue #', REPO)).toBe('');
  });

  it('does not match non-numeric issue references', () => {
    expect(findLinkedIssue('Fixes #abc', REPO)).toBe('');
    expect(findLinkedIssue('Fixes GH-xyz', REPO)).toBe('');
    expect(findLinkedIssue('See google-gemini/gemini-cli#foo for details', REPO)).toBe('');
    expect(findLinkedIssue('Link T-abc', REPO)).toBe('');
  });

  it('returns empty string when no issue reference exists', () => {
    expect(findLinkedIssue('No issue linked here', REPO)).toBe('');
  });

  it('falls back gracefully when repository is missing', () => {
    expect(findLinkedIssue('Fixes #101', '')).toBe('101');
  });
});
