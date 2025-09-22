/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { RenderInline } from './InlineMarkdownRenderer.js';

const stripAnsi = (str: string) =>
  str.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]?[0-9]{1,4}(?:;[0-9]{0,4})*[0-9A-ORZcf-nqry=><]/g,
    '',
  );

describe('RenderInline', () => {
  it('renders a markdown https link as text', () => {
    const { lastFrame } = render(
      <RenderInline text="This is a [link](https://example.com)." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a markdown javascript URI as text', () => {
    const { lastFrame } = render(
      <RenderInline text="This is a [malicious link](javascript:alert(1))." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a markdown mailto link as text', () => {
    const { lastFrame } = render(
      <RenderInline text="Contact us at [email](mailto:team@example.com)." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a markdown ftp link as text', () => {
    const { lastFrame } = render(
      <RenderInline text="Download from [ftp](ftp://example.com/file)." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a bare http link as text with its URL', () => {
    const { lastFrame } = render(
      <RenderInline text="Go to https://example.com for more info." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a bare ftp link as text with its URL', () => {
    const { lastFrame } = render(
      <RenderInline text="Go to ftp://example.com/file for the file." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });

  it('renders a bare mailto link as text with its URL', () => {
    const { lastFrame } = render(
      <RenderInline text="Contact mailto:team@example.com for details." />,
    );
    const output = stripAnsi(lastFrame()!).trim();
    expect(output).toMatchSnapshot();
  });
});