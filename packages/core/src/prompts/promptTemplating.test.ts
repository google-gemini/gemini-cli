/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { promptComponent, toPrompt, enabledWhen, section, xmlSection, each, switchOn } from './promptTemplating.js';

// Sample prompt components.
type MainPromptOptions = { isInteractive: boolean };

const identity = promptComponent('Your name is Gemini CLI and you are a coding agent');

const interactive = promptComponent<MainPromptOptions>(
  enabledWhen('isInteractive', 'You are operating in an interactive session')
);

const mainPrompt = promptComponent<MainPromptOptions>(identity, interactive);

const variadicPrompt = promptComponent('A', 'B', 'C');

const nestedVariadicPrompt = promptComponent('A', ['B', 'C'], 'D');

const enabledWhenPrompt = promptComponent<Record<string, boolean>>(
  'Always',
  enabledWhen('show', 'Sometimes')
);

const xmlPrompt = xmlSection('rules', 'Be helpful');

const emptyXmlPrompt = xmlSection('rules', '');

const markdownPrompt = section('Rules', 'Be helpful');

const emptyMarkdownPrompt = section('Rules', '');

const customHeaderMarkdownPrompt = section('Rules', 'Be helpful', { headerLevel: 3 });

const eachPrompt = each<{ items: string[] }>('items', (item) => `Item: ${item}`);

const switchOnPrompt = switchOn<{ mode: string }>('mode', {
  fast: 'Speed is key',
  safe: 'Safety first',
});

describe('promptTemplating', () => {
  it('should take variadic arguments', () => {
    expect(toPrompt({}, variadicPrompt)).toBe('A,B,C');
  });

  it('should handle nested arrays (variadic with arrays)', () => {
    expect(toPrompt({}, nestedVariadicPrompt)).toBe('A,B,C,D');
  });

  it('should handle enabledWhen', () => {
    expect(toPrompt({ show: true }, enabledWhenPrompt)).toBe('Always,Sometimes');
    expect(toPrompt({ show: false }, enabledWhenPrompt)).toBe('Always,');
  });

  it('should handle xmlSection', () => {
    expect(toPrompt({}, xmlPrompt)).toBe('<rules>\nBe helpful\n</rules>');
  });

  it('should return empty string for xmlSection if content is empty', () => {
    expect(toPrompt({}, emptyXmlPrompt)).toBe('');
  });

  it('should handle markdown section with default header', () => {
    expect(toPrompt({}, markdownPrompt)).toBe('# Rules\n\nBe helpful');
  });

  it('should return empty string for markdown section if content is empty', () => {
    expect(toPrompt({}, emptyMarkdownPrompt)).toBe('');
  });

  it('should handle markdown section with custom header level', () => {
    expect(toPrompt({}, customHeaderMarkdownPrompt)).toBe('### Rules\n\nBe helpful');
  });

  it('should handle each', () => {
    const options = { items: ['A', 'B'] };
    expect(toPrompt(options, eachPrompt)).toBe('Item: A\nItem: B');
  });

  it('should handle switchOn', () => {
    expect(toPrompt({ mode: 'fast' }, switchOnPrompt)).toBe('Speed is key');
    expect(toPrompt({ mode: 'safe' }, switchOnPrompt)).toBe('Safety first');
    expect(toPrompt({ mode: 'unknown' }, switchOnPrompt)).toBe('');
  });

  it('should output correctly for mainPrompt', () => {
    const text = toPrompt({ isInteractive: true }, mainPrompt);
    expect(text).toContain('Your name is Gemini CLI and you are a coding agent');
    expect(text).toContain('You are operating in an interactive session');
  });
});
