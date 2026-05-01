/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { promptComponent, promptTemplate, renderSnippet, renderTemplate, enabledWhen, section, xmlSection, each, switchOn, type Snippet, type PromptTemplateBase } from './promptTemplating.js';

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

const eachPrompt = each<{ items: string[] }, string>('items', (item: string) => `Item: ${item}`);

const eachCustomSeparatorPrompt = each<{ items: string[] }, string>('items', (item: string) => item, ', ');

const switchOnPrompt = switchOn<{ mode: string | number }>('mode', {
  fast: 'Speed is key',
  safe: 'Safety first',
  1: 'Mode one',
});

// A high-level template.
interface SystemPromptOptions { name: string }
interface SystemPromptTemplate extends PromptTemplateBase<SystemPromptOptions> {
  identity: Snippet<SystemPromptOptions>;
  instructions: Snippet<SystemPromptOptions>;
}

const mainTemplate = promptTemplate<SystemPromptOptions, SystemPromptTemplate>({
  identity: (opt: SystemPromptOptions) => `Your name is ${opt.name}`,
  instructions: 'Be helpful',
});

describe('promptTemplating', () => {
  it('should take variadic arguments', () => {
    expect(renderSnippet({}, variadicPrompt)).toBe('A,B,C');
  });

  it('should handle nested arrays (variadic with arrays)', () => {
    expect(renderSnippet({}, nestedVariadicPrompt)).toBe('A,B,C,D');
  });

  it('should handle enabledWhen', () => {
    expect(renderSnippet({ show: true }, enabledWhenPrompt)).toBe('Always,Sometimes');
    expect(renderSnippet({ show: false }, enabledWhenPrompt)).toBe('Always,');
  });

  it('should handle xmlSection', () => {
    expect(renderSnippet({}, xmlPrompt)).toBe('<rules>\nBe helpful\n</rules>');
  });

  it('should return empty string for xmlSection if content is empty', () => {
    expect(renderSnippet({}, emptyXmlPrompt)).toBe('');
  });

  it('should handle markdown section with default header', () => {
    expect(renderSnippet({}, markdownPrompt)).toBe('# Rules\n\nBe helpful');
  });

  it('should return empty string for markdown section if content is empty', () => {
    expect(renderSnippet({}, emptyMarkdownPrompt)).toBe('');
  });

  it('should handle markdown section with custom header level', () => {
    expect(renderSnippet({}, customHeaderMarkdownPrompt)).toBe('### Rules\n\nBe helpful');
  });

  it('should handle each', () => {
    const options = { items: ['A', 'B'] };
    expect(renderSnippet(options, eachPrompt)).toBe('Item: A\nItem: B');
  });

  it('should handle switchOn', () => {
    expect(renderSnippet({ mode: 'fast' }, switchOnPrompt)).toBe('Speed is key');
    expect(renderSnippet({ mode: 'safe' }, switchOnPrompt)).toBe('Safety first');
    expect(renderSnippet({ mode: 'unknown' }, switchOnPrompt)).toBe('');
  });

  it('should handle switchOn with numeric values', () => {
    expect(renderSnippet({ mode: 1 }, switchOnPrompt)).toBe('Mode one');
  });

  it('should handle each with custom separator', () => {
    const options = { items: ['A', 'B'] };
    expect(renderSnippet(options, eachCustomSeparatorPrompt)).toBe('A, B');
  });

  it('should handle each with non-array value', () => {
    const options = { items: 'not an array' as unknown as string[] };
    expect(renderSnippet(options, eachPrompt)).toBe('');
  });

  it('should handle section with different header levels', () => {
    const h2Section = section('Level 2', 'Content', { headerLevel: 2 });
    const h6Section = section('Level 6', 'Content', { headerLevel: 6 });
    expect(renderSnippet({}, h2Section)).toBe('## Level 2\n\nContent');
    expect(renderSnippet({}, h6Section)).toBe('###### Level 6\n\nContent');
  });

  it('should handle toPrompt with basic types', () => {
    expect(renderSnippet({}, 'just a string')).toBe('just a string');
    expect(renderSnippet({ name: 'test' }, (opt: { name: string }) => opt.name)).toBe('test');
  });

  it('should handle toPrompt with empty array or object', () => {
    expect(renderSnippet({}, [])).toBe('');
    expect(renderSnippet({}, {})).toBe('');
  });

  it('should handle renderTemplate with a record of snippets (implements required members)', () => {
    const options = {
      name: 'Gemini CLI',
    };
    expect(renderTemplate(options, mainTemplate)).toBe('Your name is Gemini CLI,Be helpful');
  });

  it('should output correctly for mainPrompt', () => {
    const text = renderSnippet({ isInteractive: true }, mainPrompt);
    expect(text).toContain('Your name is Gemini CLI and you are a coding agent');
    expect(text).toContain('You are operating in an interactive session');
  });
});
