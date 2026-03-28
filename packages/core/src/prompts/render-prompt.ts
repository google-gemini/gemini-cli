/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SystemPromptOptions } from './snippets.js';

export type ContextResolver<C, O> = O | ((ctx: C) => O | Promise<O>);

export type PromptSlot = { slot: string; content?: never };

export type PromptSection<C> = {
  /** Add a Markdown heading of appropriate level to this section. */
  heading?: string;
  /** Explicitly set the markdown heading depth (1 = #, 2 = ##), overriding tree depth.
   * 0 is valid and will render as # while setting children to level 1. */
  level?: number;
  /** If supplied, wrap this section in an XML tag. */
  tag?: string;
  /** If supplied, add attributes to the XML section tag. */
  attrs?: Record<string, ContextResolver<C, string>>;
  /** Formatting of the content inside this section. Defaults to 'block'. */
  format?:
    | 'inline'
    | 'block'
    | 'list'
    | 'lines'
    | ((parts: string[]) => string);

  /** Condition that must evaluate to true for the section to be rendered. */
  condition?: boolean | ((ctx: C) => boolean | Promise<boolean>);
  content: PromptContent<C>;
  /** Alternate content to render if the primary content resolves to a falsy value. */
  fallback?: PromptContent<C>;
};

// The core recursive type.
// It wraps your 3 base node shapes (string, section, or array) in the resolver.
export type PromptContent<C> = ContextResolver<
  C,
  | string
  | number
  | boolean
  | null
  | undefined
  | PromptSection<C>
  | PromptSlot
  | Array<PromptContent<C>>
>;

type BaseContent = string | StaticSection | PromptSlot | BaseContent[];
type StaticSection = Omit<
  PromptSection<unknown>,
  'condition' | 'content' | 'attrs'
> & {
  attrs?: Record<string, string>;
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
  const currentDepth = section.level ?? depth;
  const sectionFormat = section.format || 'block';
  const innerContent = formatBasic(
    section.content,
    currentDepth + 1,
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
    const headingLevel = Math.max(1, Math.min(currentDepth, 6));
    result = `\n\n${'#'.repeat(headingLevel)} ${section.heading}\n\n${result.trim()}`;
  }

  return result;
};

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
      let resolvedAttrs: Record<string, string> | undefined = undefined;
      if (section.attrs) {
        resolvedAttrs = {};
        for (const [key, value] of Object.entries(section.attrs)) {
          resolvedAttrs[key] =
            typeof value === 'function' ? await value(context) : value;
        }
      }

      return {
        heading: section.heading,
        level: section.level,
        tag: section.tag,
        attrs: resolvedAttrs,
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

export function prompt<C = SystemPromptOptions>(
  ...content: Array<PromptContent<C>>
): PromptContent<C> {
  return content.length === 1 ? content[0] : content;
}

type Resolver<C, T> = (ctx: C) => T | Promise<T>;

/**
 * Creates a memoized selector that caches its result per context instance.
 * Ideal for efficiently sharing derived state across a prompt tree.
 */
export function memoize<C extends object, T>(
  resolver: Resolver<C, T>,
): (ctx: C) => T | Promise<T> {
  const cache = new WeakMap<C, T | Promise<T>>();

  return (ctx: C) => {
    if (cache.has(ctx)) {
      return cache.get(ctx)!;
    }
    const result = resolver(ctx);
    cache.set(ctx, result);
    return result;
  };
}

/**
 * Parses a string containing placeholders like `${slotName}` into a PromptContent array.
 * Interleaves literal string segments with `{ slot: 'slotName' }` objects.
 */
export function parseSlots<C>(template: string): Array<PromptContent<C>> {
  if (!template) return [];

  const regex = /\$\{([^}]+)\}/g;
  const parts: Array<PromptContent<C>> = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      parts.push(template.slice(lastIndex, match.index));
    }
    parts.push({ slot: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < template.length) {
    parts.push(template.slice(lastIndex));
  }

  return parts;
}
