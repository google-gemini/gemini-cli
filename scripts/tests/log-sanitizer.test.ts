/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  findSensitiveContent,
  HOME_PLACEHOLDER,
  sanitizeContent,
  WORKSPACE_PLACEHOLDER,
} from '../utils/log-sanitizer.js';

describe('sanitizeContent path redaction', () => {
  const workspace = '/Users/alice/secret-client-project';

  it.each([
    [`${workspace}, fix it`, `${WORKSPACE_PLACEHOLDER}, fix it`],
    [`${workspace} is the root`, `${WORKSPACE_PLACEHOLDER} is the root`],
    [`see ${workspace}\nnext line`, `see ${WORKSPACE_PLACEHOLDER}\nnext line`],
    [`path: "${workspace}"`, `path: "${WORKSPACE_PLACEHOLDER}"`],
  ])('redacts a delimited workspace path in %j', (content, expected) => {
    expect(
      sanitizeContent(content, {
        workspaceRoot: workspace,
        stripHomePaths: false,
      }),
    ).toBe(expected);
  });

  it('redacts subpaths and an end-of-string path', () => {
    expect(
      sanitizeContent(`${workspace}/src/a.ts`, {
        workspaceRoot: workspace,
        stripHomePaths: false,
      }),
    ).toBe(`${WORKSPACE_PLACEHOLDER}/src/a.ts`);
    expect(
      sanitizeContent(workspace, {
        workspaceRoot: workspace,
        stripHomePaths: false,
      }),
    ).toBe(WORKSPACE_PLACEHOLDER);
  });

  it('does not redact sibling names sharing the workspace prefix', () => {
    for (const sibling of [`${workspace}2/file`, `${workspace}.bak`]) {
      expect(
        sanitizeContent(sibling, {
          workspaceRoot: workspace,
          stripHomePaths: false,
        }),
      ).toBe(sibling);
    }
  });

  it('redacts the home directory mid-sentence', () => {
    expect(sanitizeContent(`config lives in ${os.homedir()} now`)).toBe(
      `config lives in ${HOME_PLACEHOLDER} now`,
    );
  });
});

describe('findSensitiveContent', () => {
  it('flags quoted credentials containing whitespace', () => {
    expect(
      findSensitiveContent('password = "correct horse battery staple"'),
    ).toEqual([{ category: 'credential assignment', line: 1 }]);
    expect(findSensitiveContent("secret: 'my secret value here'")).toEqual([
      { category: 'credential assignment', line: 1 },
    ]);
  });

  it('flags 8-to-15-character unquoted credentials', () => {
    expect(findSensitiveContent('token=abcd1234')).toHaveLength(1);
    expect(findSensitiveContent('API_KEY=abcd1234efgh')).toHaveLength(1);
  });

  it('does not flag very short values or bare words', () => {
    expect(findSensitiveContent('password=abc')).toHaveLength(0);
    expect(findSensitiveContent('the password field is required')).toHaveLength(
      0,
    );
  });

  it('flags Stripe secret and restricted keys', () => {
    expect(findSensitiveContent(`sk_live_${'x'.repeat(24)}`)).toHaveLength(1);
    expect(findSensitiveContent(`rk_test_${'y'.repeat(24)}`)).toHaveLength(1);
  });

  it('reports only the category and line number', () => {
    expect(
      findSensitiveContent(
        'safe line\npassword = "correct horse battery staple"',
      ),
    ).toEqual([{ category: 'credential assignment', line: 2 }]);
  });
});
