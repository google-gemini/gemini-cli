/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Prompt } from './prompter.js';

describe('Prompt', () => {
  it('renders a simple string', async () => {
    const prompt = new Prompt('Hello world');
    expect(await prompt.render({})).toBe('Hello world');
  });

  it('renders a function content resolving dynamically', async () => {
    const prompt = new Prompt<{ name: string }>((ctx) => `Hello ${ctx.name}`);
    expect(await prompt.render({ name: 'Alice' })).toBe('Hello Alice');
  });

  it('renders an array of contents', async () => {
    const prompt = new Prompt(['Part 1', 'Part 2']);
    expect(await prompt.render({})).toBe('Part 1\n\nPart 2');
  });

  it('renders a section with heading', async () => {
    const prompt = new Prompt({
      heading: 'My Section',
      content: 'This is the body',
    });
    expect(await prompt.render({})).toBe('# My Section\n\nThis is the body');
  });

  it('renders a section with tag and attrs', async () => {
    const prompt = new Prompt({
      tag: 'foo',
      attrs: { bar: 'baz' },
      content: 'Hello',
    });
    expect(await prompt.render({})).toBe('<foo bar="baz">\nHello\n</foo>');
  });

  it('allows adding content via .add()', async () => {
    const prompt = new Prompt('Original');
    prompt.add('Added later');
    expect(await prompt.render({})).toBe('Original\n\nAdded later');
  });

  it('conditionally omits rendering a section based on condition', async () => {
    const prompt = new Prompt<{ shouldRender: boolean }>(
      {
        heading: 'Conditional',
        condition: (ctx) => ctx.shouldRender,
        content: 'This might not appear',
      },
      'Always appears',
    );
    expect(await prompt.render({ shouldRender: false })).toBe('Always appears');
    expect(await prompt.render({ shouldRender: true })).toBe(
      '# Conditional\n\nThis might not appear\n\nAlways appears',
    );
  });

  it('conditionally omits rendering a section based on an async condition', async () => {
    const prompt = new Prompt<{ shouldRender: boolean }>(
      {
        heading: 'Conditional',
        condition: async (ctx) => ctx.shouldRender,
        content: 'This might not appear',
      },
      'Always appears',
    );
    expect(await prompt.render({ shouldRender: false })).toBe('Always appears');
    expect(await prompt.render({ shouldRender: true })).toBe(
      '# Conditional\n\nThis might not appear\n\nAlways appears',
    );
  });

  it('allows dynamic contributions via .contribute()', async () => {
    const prompt = new Prompt(
      {
        id: 'target',
        heading: 'Target Section',
        content: ['Initial content'],
      },
      {
        id: 'other',
        content: 'Other content',
      },
    );

    prompt.contribute({
      target: 'Contributed content',
      missing: 'Should be ignored',
    });

    const result = await prompt.render({});
    expect(result).toBe(
      '# Target Section\n\nInitial content\n\nContributed content\n\nOther content',
    );
  });

  it('converts single content into an array when contributing', async () => {
    const prompt = new Prompt({
      id: 'target',
      heading: 'Target Section',
      content: 'Initial content', // String, not array
    });

    prompt.contribute({
      target: 'Contributed content',
    });

    const result = await prompt.render({});
    expect(result).toBe(
      '# Target Section\n\nInitial content\n\nContributed content',
    );
  });

  it('skips rendering headings and tags if the content is empty', async () => {
    const prompt = new Prompt(
      {
        heading: 'Empty Section',
        tag: 'empty',
        content: '', // Empty string
      },
      {
        heading: 'Empty Array Section',
        content: [], // Empty array
      },
      {
        heading: 'Function resolving to empty',
        content: () => '',
      },
      'Visible content',
    );

    expect(await prompt.render({})).toBe('Visible content');
  });

  it('handles nested structures properly in contribute', async () => {
    const prompt = new Prompt({
      heading: 'Outer',
      content: [
        {
          id: 'inner',
          heading: 'Inner',
          content: 'Inner content',
        },
      ],
    });

    prompt.contribute({
      inner: 'Injected into inner',
    });

    const result = await prompt.render({});
    expect(result).toBe(
      '# Outer\n\n## Inner\n\nInner content\n\nInjected into inner',
    );
  });
});
