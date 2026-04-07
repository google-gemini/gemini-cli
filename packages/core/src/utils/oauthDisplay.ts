/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OauthDisplayMessagePayload } from './events.js';

export function createOauthBrowserDisplayMessage(
  url: string,
): OauthDisplayMessagePayload {
  return {
    heading:
      'Opening your browser for OAuth sign-in...\n' +
      'If the browser does not open, copy and paste this URL into your browser:',
    url,
    footerLines: [
      'TIP: Triple-click to select the entire URL, then copy and paste it into your browser.',
      'Make sure to copy the COMPLETE URL - it may wrap across multiple lines.',
    ],
  };
}
