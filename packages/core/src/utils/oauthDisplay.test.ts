/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createOauthBrowserDisplayMessage } from './oauthDisplay.js';

describe('createOauthBrowserDisplayMessage', () => {
  it('returns a structured payload with a plain auth URL', () => {
    const url =
      'https://accounts.example.com/oauth2/auth?response_type=code&scope=openid%20email&state=test-state';

    expect(createOauthBrowserDisplayMessage(url)).toEqual({
      heading:
        'Opening your browser for OAuth sign-in...\n' +
        'If the browser does not open, copy and paste this URL into your browser:',
      url,
      footerLines: [
        'TIP: Triple-click to select the entire URL, then copy and paste it into your browser.',
        'Make sure to copy the COMPLETE URL - it may wrap across multiple lines.',
      ],
    });
  });
});
