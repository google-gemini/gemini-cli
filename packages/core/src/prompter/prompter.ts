/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SystemPromptOptions } from 'src/prompts/snippets.js';
import type { PromptContent, PromptSlot } from './types.js';

type BaseContent = string | BaseSection | PromptSlot | BaseContent[];
type BaseSection = {
  heading?: string;
  tag?: string;
  attrs?: Record<string, string>;
  format?: 'inline' | 'block';
  content: BaseContent;
};

// Helper to stringify XML attributes cleanly
function renderAttributes(attrs?: Record<string, string>): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('');
}

export function p<C = SystemPromptOptions>(
  strings: TemplateStringsArray,
  ...values: Array<PromptContent<C>>
): PromptContent<C> {
  const content = strings.reduce<Array<PromptContent<C>>>(
    (acc, str, i) => [...acc, str, values[i] ?? ''],
    [],
  );
  return { format: 'inline', content };
}

export interface RenderPromptOptions<C> {
  content: PromptContent<C> | Array<PromptContent<C>>;
  contributions?:
    | Record<string, PromptContent<C>>
    | Array<Record<string, PromptContent<C>>>;
  context: C;
  options?: { depth?: number };
}

export async function renderPrompt<C = SystemPromptOptions>({
  content,
  contributions,
  context,
  options,
}: RenderPromptOptions<C>): Promise<string> {
  const contents = Array.isArray(content) ? content : [content];
  const _contributions: Record<string, Array<PromptContent<C>>> = {};

  if (contributions) {
    const batches = Array.isArray(contributions)
      ? contributions
      : [contributions];
    for (const batch of batches) {
      for (const [slot, c] of Object.entries(batch)) {
        _contributions[slot] = _contributions[slot] || [];
        _contributions[slot].push(c);
      }
    }
  }

  const resolveToBasic = async (
    c: PromptContent<C>,
  ): Promise<BaseContent | null> => {
    if (typeof c === 'function') {
      const resolved = await c(context);
      return resolveToBasic(resolved);
    }
    if (
      typeof c === 'string' ||
      typeof c === 'number' ||
      typeof c === 'boolean'
    ) {
      return String(c);
    }
    if (Array.isArray(c)) {
      const resolved = await Promise.all(c.map((item) => resolveToBasic(item)));
      const filtered = resolved.filter(
        (item): item is BaseContent => item !== null,
      );
      if (filtered.length === 0) return null;
      return filtered;
    }
    if (typeof c === 'object' && c !== null) {
      if ('slot' in c) {
        return c;
      }

      const section = c;
      if (section.condition) {
        const shouldRender = await section.condition(context);
        if (!shouldRender) return null;
      }
      const resolvedInner = await resolveToBasic(section.content);
      if (
        resolvedInner === null ||
        resolvedInner === '' ||
        (Array.isArray(resolvedInner) && resolvedInner.length === 0)
      ) {
        return null;
      }
      return {
        heading: section.heading,
        tag: section.tag,
        attrs: section.attrs,
        format: section.format,
        content: resolvedInner,
      };
    }
    return null;
  };

  const resolvedContents = await Promise.all(
    contents.map((c) => resolveToBasic(c)),
  );

  const resolvedContributions: Record<string, BaseContent[]> = {};
  for (const [slot, slotContributions] of Object.entries(_contributions)) {
    const resolved = await Promise.all(
      slotContributions.map((c) => resolveToBasic(c)),
    );
    resolvedContributions[slot] = resolved.filter(
      (c): c is BaseContent => c !== null,
    );
  }

  const formatBasic = (
    c: BaseContent | null,
    depth: number,
    format: 'inline' | 'block',
  ): string => {
    if (c === null) return '';
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .map((item) => formatBasic(item, depth, format))
        .join(format === 'inline' ? '' : '\n\n');
    }
    if ('slot' in c) {
      const slotContributions = resolvedContributions[c.slot];
      if (!slotContributions || slotContributions.length === 0) return '';
      return formatBasic(slotContributions, depth, format);
    }

    const section = c;
    const sectionFormat = section.format || 'block';
    const innerContent = formatBasic(
      section.content,
      depth + 1,
      sectionFormat,
    ).trim();
    if (!innerContent) return '';

    let result = innerContent;

    if (section.tag) {
      const attrs = renderAttributes(section.attrs);
      result = `\n<${section.tag}${attrs}>\n${result}\n</${section.tag}>\n`;
    }

    if (section.heading) {
      const headingLevel = Math.min(depth, 6);
      result = `\n\n${'#'.repeat(headingLevel)} ${section.heading}\n\n${result.trim()}`;
    }

    return result;
  };

  const parts = resolvedContents
    .map((c) => formatBasic(c, options?.depth ?? 1, 'block'))
    .filter((p) => p !== null && p !== '');

  const rawResult = parts.join('\n\n').trim();

  // Normalize newlines: collapse 3+ consecutive newlines into exactly 2
  // but skip content inside markdown code fences (```)
  const segments = rawResult.split(/(```[\s\S]*?```)/);
  return segments
    .map((segment, index) => {
      // Even indices are outside code fences, odd indices are inside
      if (index % 2 === 0) {
        return segment.replace(/\n{3,}/g, '\n\n');
      }
      return segment;
    })
    .join('');
}

export function prompt(
  ...content: Array<PromptContent<SystemPromptOptions>>
): PromptContent<SystemPromptOptions> {
  return content.length === 1 ? content[0] : content;
}
