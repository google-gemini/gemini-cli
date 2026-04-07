/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from '../../../test-utils/render.js';
import { AuthUrlMessage } from './AuthUrlMessage.js';

const authUrls = [
  'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=https%3A%2F%2Fcodeassist.google.com%2Fauthcode&response_type=code&scope=openid%20email%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform&state=test-state-value&code_challenge=test-code-challenge&code_challenge_method=S256',
  'https://login.example.com/oauth2/authorize?client_id=gemini-cli&response_type=code&scope=scope.one%20scope.two%20scope.three&audience=https%3A%2F%2Fapi.example.com&resource=https%3A%2F%2Fapi.example.com%2Fv1%2Foauth%2Fcallback&state=state-with-repeated===equals&&double-ampersand=true',
  'https://auth.example.com/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A7777%2Foauth%2Fcallback&response_type=code&scope=profile%20email%20offline_access&prompt=consent&login_hint=test.user%40example.com&state=abcdefghijklmnopqrstuvwxyz0123456789',
];

function extractRenderedUrl(frame: string): string {
  const lines = frame.replace(/\n$/, '').split('\n');
  const urlStart = lines.findIndex((line) => line.includes('https://'));

  if (urlStart === -1) {
    throw new Error(`No auth URL found in rendered output:\n${frame}`);
  }

  const urlLines: string[] = [];
  for (let i = urlStart; i < lines.length; i++) {
    const line = lines[i];
    if (
      i > urlStart &&
      (line.trim() === '' ||
        line.startsWith('TIP:') ||
        line.startsWith('Make sure to'))
    ) {
      break;
    }
    urlLines.push(line);
  }

  return urlLines.join('');
}

describe('AuthUrlMessage', () => {
  const widths = [60, 50, 40];
  const cases = widths.flatMap((width) =>
    authUrls.map((url, index) => ({ width, url, index })),
  );

  it.each(cases)(
    'preserves the exact auth URL at width $width for case $index',
    async ({ width, url }) => {
      const { lastFrame, unmount } = await render(
        <AuthUrlMessage
          heading="Opening your browser for OAuth sign-in..."
          url={url}
          footerLines={[
            'TIP: Triple-click to select the entire URL, then copy and paste it into your browser.',
            'Make sure to copy the COMPLETE URL - it may wrap across multiple lines.',
          ]}
        />,
        width,
      );

      const output = lastFrame();
      expect(extractRenderedUrl(output)).toBe(url);
      unmount();
    },
  );
});
