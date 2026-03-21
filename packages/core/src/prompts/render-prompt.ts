/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SystemPromptOptions } from './snippets.js';

type MaybePromise<T, Sync extends boolean> = Sync extends true
  ? T
  : T | Promise<T>;

export type ContextResolver<C, O, Sync extends boolean = false> =
  | O
  | ((ctx: C) => MaybePromise<O, Sync>);

export type PromptSlot = { slot: string; content?: never };

export type PromptSection<C, Sync extends boolean = false> = {
  /** Add a Markdown heading of appropriate level to this section. */
  heading?: string;
  /** If supplied, wrap this section in an XML tag. */
  tag?: string;
  /** If supplied, add attributes to the XML section tag. */
  attrs?: Record<string, string>;
  /** Formatting of the content inside this section. Defaults to 'block'. */
  format?:
    | 'inline'
    | 'block'
    | 'list'
    | 'lines'
    | ((parts: string[]) => string);

  /** Condition that must evaluate to true for the section to be rendered. */
  condition?: boolean | ((ctx: C) => MaybePromise<boolean, Sync>);
  content: PromptContent<C, Sync>;
  /** Alternate content to render if the primary content resolves to a falsy value. */
  fallback?: PromptContent<C, Sync>;
};

// The core recursive type.
// It wraps your 3 base node shapes (string, section, or array) in the resolver.
export type PromptContent<C, Sync extends boolean = false> = ContextResolver<
  C,
  | string
  | number
  | boolean
  | null
  | undefined
  | PromptSection<C, Sync>
  | PromptSlot
  | Array<PromptContent<C, Sync>>,
  Sync
>;

type BaseContent = string | StaticSection | PromptSlot | BaseContent[];
type StaticSection = Omit<
  PromptSection<unknown, boolean>,
  'condition' | 'content'
> & {
  content: BaseContent;
};

// Helper to stringify XML attributes cleanly
function renderAttributes(attrs?: Record<string, string>): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('');
}

export function p<C = SystemPromptOptions, Sync extends boolean = false>(
  strings: TemplateStringsArray,
  ...values: Array<PromptContent<C, Sync>>
): PromptContent<C, Sync> {
  const content = strings.reduce<Array<PromptContent<C, Sync>>>(
    (acc, str, i) => [...acc, str, values[i] ?? ''],
    [],
  );
  return { format: 'inline', content };
}

export interface RenderPromptOptions<C, Sync extends boolean = false> {
  content: PromptContent<C, Sync> | Array<PromptContent<C, Sync>>;
  contributions?:
    | Record<string, PromptContent<C, Sync>>
    | Array<Record<string, PromptContent<C, Sync>>>;
  context: C;
  options?: { depth?: number };
}

function normalizeResult(rawResult: string): string {
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

const formatBasic = (
  c: BaseContent | null,
  depth: number,
  format: 'inline' | 'block' | 'list' | 'lines' | ((parts: string[]) => string),
  resolvedContributions: Record<string, BaseContent[]>,
): string => {
  if (c === null) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    const parts = c
      .map((item) => formatBasic(item, depth, format, resolvedContributions))
      .filter((p) => p !== '');
    if (typeof format === 'function') {
      return format(parts);
    }
    if (format === 'list') {
      return parts.map((p) => '- ' + p).join('\n');
    }
    if (format === 'lines') {
      return parts.join('\n');
    }
    return parts.join(format === 'inline' ? '' : '\n\n');
  }
  if ('slot' in c) {
    const slotContributions = resolvedContributions[c.slot];
    if (!slotContributions || slotContributions.length === 0) return '';
    return formatBasic(slotContributions, depth, format, resolvedContributions);
  }

  const section = c;
  const sectionFormat = section.format || 'block';
  const innerContent = formatBasic(
    section.content,
    depth + 1,
    sectionFormat,
    resolvedContributions,
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

export async function renderPrompt<C = SystemPromptOptions>({
  content,
  contributions,
  context,
  options,
}: RenderPromptOptions<C, false>): Promise<string> {
  const contents = Array.isArray(content) ? content : [content];
  const _contributions: Record<string, Array<PromptContent<C, false>>> = {};

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
    c: PromptContent<C, false>,
  ): Promise<BaseContent | null> => {
    if (c === undefined || c === null) return null;
    if (typeof c === 'function') {
      const resolved = await c(context);
      return resolveToBasic(resolved);
    }
    if (typeof c === 'boolean') {
      return null;
    }
    if (typeof c === 'string' || typeof c === 'number') {
      const val = String(c);
      return val === '' ? null : val;
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
      if (section.condition !== undefined) {
        const shouldRender =
          typeof section.condition === 'function'
            ? await section.condition(context)
            : section.condition;
        if (!shouldRender) return null;
      }
      let resolvedInner = await resolveToBasic(section.content);

      if (
        resolvedInner === null ||
        resolvedInner === '' ||
        (Array.isArray(resolvedInner) && resolvedInner.length === 0)
      ) {
        if (section.fallback !== undefined) {
          resolvedInner = await resolveToBasic(section.fallback);
        }
      }

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

  const parts = resolvedContents
    .map((c) =>
      formatBasic(c, options?.depth ?? 1, 'block', resolvedContributions),
    )
    .filter((p) => p !== null && p !== '');

  const rawResult = parts.join('\n\n').trim();
  return normalizeResult(rawResult);
}

export function renderPromptSync<C = SystemPromptOptions>({
  content,
  contributions,
  context,
  options,
}: RenderPromptOptions<C, true>): string {
  const contents = Array.isArray(content) ? content : [content];
  const _contributions: Record<string, Array<PromptContent<C, true>>> = {};

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

  const resolveToBasicSync = (
    c: PromptContent<C, true>,
  ): BaseContent | null => {
    if (c === undefined || c === null) return null;
    if (typeof c === 'function') {
      const resolved = c(context);
      // Extra safety check at runtime for JS users
      if (resolved instanceof Promise) {
        throw new Error(
          'renderPromptSync encountered a Promise from a resolver function.',
        );
      }
      return resolveToBasicSync(resolved);
    }
    if (typeof c === 'boolean') {
      return null;
    }
    if (typeof c === 'string' || typeof c === 'number') {
      const val = String(c);
      return val === '' ? null : val;
    }
    if (Array.isArray(c)) {
      const resolved = c.map((item) => resolveToBasicSync(item));
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
      if (section.condition !== undefined) {
        let shouldRender;
        if (typeof section.condition === 'function') {
          shouldRender = section.condition(context);
          if ((shouldRender as unknown) instanceof Promise) {
            throw new Error(
              'renderPromptSync encountered a Promise from a condition function.',
            );
          }
        } else {
          shouldRender = section.condition;
        }
        if (!shouldRender) return null;
      }
      let resolvedInner = resolveToBasicSync(section.content);

      if (
        resolvedInner === null ||
        resolvedInner === '' ||
        (Array.isArray(resolvedInner) && resolvedInner.length === 0)
      ) {
        if (section.fallback !== undefined) {
          resolvedInner = resolveToBasicSync(section.fallback);
        }
      }

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

  const resolvedContents = contents.map((c) => resolveToBasicSync(c));

  const resolvedContributions: Record<string, BaseContent[]> = {};
  for (const [slot, slotContributions] of Object.entries(_contributions)) {
    const resolved = slotContributions.map((c) => resolveToBasicSync(c));
    resolvedContributions[slot] = resolved.filter(
      (c): c is BaseContent => c !== null,
    );
  }

  const parts = resolvedContents
    .map((c) =>
      formatBasic(c, options?.depth ?? 1, 'block', resolvedContributions),
    )
    .filter((p) => p !== null && p !== '');

  const rawResult = parts.join('\n\n').trim();
  return normalizeResult(rawResult);
}

export function prompt<C = SystemPromptOptions, Sync extends boolean = false>(
  ...content: Array<PromptContent<C, Sync>>
): PromptContent<C, Sync> {
  return content.length === 1 ? content[0] : content;
}
