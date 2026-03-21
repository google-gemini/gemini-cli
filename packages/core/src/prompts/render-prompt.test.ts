/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderPrompt, renderPromptSync, p } from './render-prompt.js';
import type { PromptContent } from './render-prompt.js';

type TestContext = { name?: string; shouldRender?: boolean };

type TestCase = {
  desc: string;
  content: PromptContent<TestContext> | Array<PromptContent<TestContext>>;
  context: TestContext;
  contributions?:
    | Record<string, PromptContent<TestContext>>
    | Array<Record<string, PromptContent<TestContext>>>;
  expect: string;
};

const tests: TestCase[] = [
  {
    desc: 'renders a simple string',
    content: 'Hello world',
    context: {},
    expect: 'Hello world',
  },
  {
    desc: 'renders a function content resolving dynamically',
    content: (ctx) => `Hello ${ctx.name}`,
    context: { name: 'Alice' },
    expect: 'Hello Alice',
  },
  {
    desc: 'renders an array of contents with block spacing',
    content: [['Part 1', 'Part 2']],
    context: {},
    expect: 'Part 1\n\nPart 2',
  },
  {
    desc: 'p tag renders inline spacing',
    content: p`Part ${1} and Part ${2}`,
    context: {},
    expect: 'Part 1 and Part 2',
  },
  {
    desc: 'renders a section with heading',
    content: {
      heading: 'My Section',
      content: 'This is the body',
    },
    context: {},
    expect: '# My Section\n\nThis is the body',
  },
  {
    desc: 'renders a section with tag and attrs',
    content: {
      tag: 'foo',
      attrs: { bar: 'baz' },
      content: 'Hello',
    },
    context: {},
    expect: '<foo bar="baz">\nHello\n</foo>',
  },
  {
    desc: 'conditionally omits rendering a section based on condition',
    content: [
      {
        heading: 'Conditional',
        condition: (ctx) => ctx.shouldRender ?? false,
        content: 'This might not appear',
      },
      'Always appears',
    ],
    context: { shouldRender: false },
    expect: 'Always appears',
  },
  {
    desc: 'conditionally includes rendering a section based on condition',
    content: [
      {
        heading: 'Conditional',
        condition: (ctx) => ctx.shouldRender ?? false,
        content: 'This might not appear',
      },
      'Always appears',
    ],
    context: { shouldRender: true },
    expect: '# Conditional\n\nThis might not appear\n\nAlways appears',
  },
  {
    desc: 'conditionally omits rendering a section based on an async condition',
    content: [
      {
        heading: 'Conditional',
        condition: async (ctx) => ctx.shouldRender ?? false,
        content: 'This might not appear',
      },
      'Always appears',
    ],
    context: { shouldRender: false },
    expect: 'Always appears',
  },
  {
    desc: 'allows dynamic contributions via .contribute() to {slot}',
    content: [
      {
        heading: 'Target Section',
        content: ['Initial content', { slot: 'target' }],
      },
      {
        heading: 'Other Section',
        content: 'Other content',
      },
    ],
    contributions: {
      target: 'Contributed content',
      missing: 'Should be ignored',
    },
    context: {},
    expect:
      '# Target Section\n\nInitial content\n\nContributed content\n\n# Other Section\n\nOther content',
  },
  {
    desc: 'handles slot contribution even when missing',
    content: {
      heading: 'Target Section',
      content: ['Initial content', { slot: 'target' }],
    },
    context: {},
    expect: '# Target Section\n\nInitial content',
  },
  {
    desc: 'skips rendering headings and tags if the content is empty',
    content: [
      {
        heading: 'Empty Section',
        tag: 'empty',
        content: '',
      },
      {
        heading: 'Empty Array Section',
        content: [],
      },
      {
        heading: 'Function resolving to empty',
        content: () => '',
      },
      'Visible content',
    ],
    context: {},
    expect: 'Visible content',
  },
  {
    desc: 'handles nested structures properly in contribute',
    content: {
      heading: 'Outer',
      content: [
        {
          heading: 'Inner',
          content: ['Inner content', { slot: 'inner' }],
        },
      ],
    },
    contributions: {
      inner: 'Injected into inner',
    },
    context: {},
    expect: '# Outer\n\n## Inner\n\nInner content\n\nInjected into inner',
  },
  {
    desc: 'resolves recursive async functions correctly before filling slots',
    content: {
      heading: 'Async Section',
      content: async () => [
        'Content from async function',
        { slot: 'async_slot' },
      ],
    },
    contributions: {
      async_slot: async () => 'Contributed async content',
    },
    context: {},
    expect:
      '# Async Section\n\nContent from async function\n\nContributed async content',
  },
  {
    desc: 'collapses 3+ newlines into 2',
    content: ['First', '\n\n\n\n\n', 'Second'],
    context: {},
    expect: 'First\n\nSecond',
  },
  {
    desc: 'does not collapse 3+ newlines inside markdown code fences',
    content: ['First', '```\n\n\n\n\n```', 'Second'],
    context: {},
    expect: 'First\n\n```\n\n\n\n\n```\n\nSecond',
  },
  {
    desc: 'appends multiple contributions to the same slot',
    content: {
      heading: 'Multi Section',
      content: [{ slot: 'multi' }],
    },
    contributions: [{ multi: 'First' }, { multi: 'Second' }],
    context: {},
    expect: '# Multi Section\n\nFirst\n\nSecond',
  },
  {
    desc: 'appends multiple contributions to an inline slot',
    content: p`Prefix: ${{ slot: 'inline_multi' }}`,
    contributions: [{ inline_multi: 'First' }, { inline_multi: 'Second' }],
    context: {},
    expect: 'Prefix: FirstSecond',
  },
  {
    desc: 'conditionally omits items when null or undefined are present',
    content: [
      'Item 1',
      null,
      'Item 2',
      undefined,
      {
        heading: 'Optional Section',
        content: null,
      },
      'Item 3',
    ],
    context: {},
    expect: 'Item 1\n\nItem 2\n\nItem 3',
  },
  {
    desc: 'renders lists with dashes',
    content: {
      heading: 'My List',
      format: 'list',
      content: ['Apple', 'Banana', null, 'Cherry'],
    },
    context: {},
    expect: '# My List\n\n- Apple\n- Banana\n- Cherry',
  },
  {
    desc: 'supports custom format functions',
    content: {
      heading: 'Custom Format',
      format: (parts) => parts.join(' | '),
      content: ['A', 'B', undefined, 'C'],
    },
    context: {},
    expect: '# Custom Format\n\nA | B | C',
  },
  {
    desc: 'filters out boolean values',
    content: ['First', true, 'Second', false, 'Third'],
    context: {},
    expect: 'First\n\nSecond\n\nThird',
  },
  {
    desc: 'supports static condition booleans',
    content: [
      {
        heading: 'Shown',
        condition: true,
        content: 'This should show',
      },
      {
        heading: 'Hidden',
        condition: false,
        content: 'This should hide',
      },
    ],
    context: {},
    expect: '# Shown\n\nThis should show',
  },
  {
    desc: 'supports lines format',
    content: {
      heading: 'Lines List',
      format: 'lines',
      content: ['Line 1', 'Line 2', 'Line 3'],
    },
    context: {},
    expect: '# Lines List\n\nLine 1\nLine 2\nLine 3',
  },
  {
    desc: 'renders fallback when content is falsy (boolean)',
    content: {
      heading: 'Fallback Boolean',
      content: false,
      fallback: 'This is the fallback',
    },
    context: {},
    expect: '# Fallback Boolean\n\nThis is the fallback',
  },
  {
    desc: 'renders fallback when content is falsy (empty string via short-circuit)',
    content: {
      heading: 'Fallback Empty String',
      content: String('') && 'something',
      fallback: 'Fallback for empty string',
    },
    context: {},
    expect: '# Fallback Empty String\n\nFallback for empty string',
  },
  {
    desc: 'renders fallback when content is an array that filters down to empty',
    content: {
      heading: 'Fallback Empty Array',
      content: [false, null, '', undefined],
      fallback: 'Fallback for empty array',
    },
    context: {},
    expect: '# Fallback Empty Array\n\nFallback for empty array',
  },
  {
    desc: 'renders normal content and ignores fallback when content is present',
    content: {
      heading: 'No Fallback',
      content: 'Primary content',
      fallback: 'Should not see this',
    },
    context: {},
    expect: '# No Fallback\n\nPrimary content',
  },
  {
    desc: 'does not render section if both content and fallback are falsy',
    content: [
      'Visible start',
      {
        heading: 'Double Falsy',
        content: '',
        fallback: null,
      },
      'Visible end',
    ],
    context: {},
    expect: 'Visible start\n\nVisible end',
  },
];

describe('renderPrompt', () => {
  it.each(tests)('$desc', async (test) => {
    const result = await renderPrompt({
      content: test.content,
      contributions: test.contributions,
      context: test.context,
    });
    expect(result).toBe(test.expect);
  });
});

describe('renderPromptSync', () => {
  const syncTests = tests.filter(
    (t) =>
      !t.desc.includes('async') &&
      !t.desc.includes('Promise') &&
      !t.desc.includes('resolves recursive async functions') &&
      !t.desc.includes('async condition'),
  );

  it.each(syncTests)('$desc', (test) => {
    const result = renderPromptSync({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: test.content as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contributions: test.contributions as any,
      context: test.context,
    });
    expect(result).toBe(test.expect);
  });
});
