/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { InfoMessage } from './InfoMessage.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import stripAnsi from 'strip-ansi';

describe('InfoMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with the correct default prefix and text', async () => {
    const { lastFrame, unmount } = await render(
      <InfoMessage text="Just so you know" />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders with a custom icon', async () => {
    const { lastFrame, unmount } = await render(
      <InfoMessage text="Custom icon test" icon="★" />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders multiline info messages', async () => {
    const message = 'Info line 1\nInfo line 2';
    const { lastFrame, unmount } = await render(<InfoMessage text={message} />);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('correctly wraps long URLs without dropping characters', async () => {
    // Literal long URL following the pattern in bugCommand.ts
    const longUrl =
      'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title=Layout%20bug%20in%20InfoMessage&info=%0A*%20**CLI%20Version%3A**%200.35.0-nightly.20260313.bb060d7a9%0A*%20**Git%20Commit%3A**%2064c50d32a%0A*%20**Session%20ID%3A**%2020762d7d-368c-4926-bcdd-ad25abd9ae18%0A*%20**Operating%20System%3A**%20linux%20v22.22.0%0A*%20**Sandbox%20Environment%3A**%20no%20sandbox%0A*%20**Model%20Version%3A**%20auto-gemini-3%0A*%20**Auth%20Type%3A**%20gemini-api-key%0A*%20**Memory%20Usage%3A**%20222.9%20MB%0A*%20**Terminal%20Name%3A**%20ghostty%201.2.3%0A*%20**Terminal%20Background%3A**%20%23282c34%0A*%20**Kitty%20Keyboard%20Protocol%3A**%20Supported%0A&problem=I%20encountered%20a%20layout%20issue%20when%20rendering%20long%20URLs%20in%20the%20terminal.%20The%20characters%20seem%20to%20be%20dropped%20at%20the%20wrap%20boundaries%20when%20using%20nested%20Text%20components%20in%20Ink.';
    const text = `To submit your bug report, please open the following URL in your browser:\n${longUrl}`;

    // We use a fixed terminal width of 80 to force the URL to wrap across multiple lines
    const { lastFrame, lastFrameRaw, unmount } = await render(
      <InfoMessage text={text} />,
      80,
    );

    // Verify layout with a readable snapshot
    expect(lastFrame()).toMatchSnapshot();

    // Strip ANSI codes and remove whitespace to verify string integrity
    const cleanOutput = stripAnsi(lastFrameRaw()).replace(/\s+/g, '');
    const cleanExpectedUrl = longUrl.replace(/\s+/g, '');

    // Check that the URL is fully intact!
    expect(cleanOutput).toContain(cleanExpectedUrl);

    unmount();
  });
});
