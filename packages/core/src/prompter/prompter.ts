/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SystemPromptOptions } from 'src/prompts/snippets.js';
import type { PromptContent, PromptSection } from './types.js';

// Helper to stringify XML attributes cleanly
function renderAttributes(attrs?: Record<string, string>): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('');
}

export class Prompt<C = SystemPromptOptions> {
  private contents: Array<PromptContent<C>>;

  constructor(...contents: Array<PromptContent<C>>) {
    this.contents = contents;
  }

  add(content: PromptContent<C>): void {
    this.contents.push(content);
  }

  contribute(contributions: Record<string, PromptContent<C>>): void {
    const traverse = (node: PromptContent<C>) => {
      if (Array.isArray(node)) {
        node.forEach(traverse);
      } else if (typeof node === 'object' && node !== null) {
        // In this branch, node is a PromptSection<C>
        const section = node;
        const contribution = contributions[section.id ?? ''];
        if (section.id && contribution) {
          const content = section.content;
          if (Array.isArray(content)) {
            content.push(contribution);
          } else {
            section.content = [content, contribution];
          }
        }
        traverse(section.content);
      }
    };

    this.contents.forEach(traverse);
  }

  async render(context: C, options?: { depth?: number }): Promise<string> {
    const parts = await Promise.all(
      this.contents.map((item) => Prompt.renderContent(context, item, options)),
    );
    return parts.filter((part) => part.length > 0).join('\n\n');
  }

  private static async renderContent<C>(
    context: C,
    content: PromptContent<C>,
    options?: { depth?: number },
  ): Promise<string> {
    // 1. if function: run function with context and process result
    if (typeof content === 'function') {
      const resolved = await content(context);
      // keep passing options down so depth isn't lost
      return Prompt.renderContent(context, resolved, options);
    }

    // 2. if string: simple string append
    if (typeof content === 'string') {
      return content;
    }

    // 3. if array: process and concatenate each item in the array
    if (Array.isArray(content)) {
      const parts = await Promise.all(
        content.map((item) => Prompt.renderContent(context, item, options)),
      );
      // Filter out empty strings to prevent huge gaps, then separate with double newline
      return parts.filter((part) => part.length > 0).join('\n\n');
    }

    // 4. if object: process as section
    if (typeof content === 'object' && content !== null) {
      if (content.condition) {
        const shouldRender = await content.condition(context);
        if (!shouldRender) {
          return '';
        }
      }
      return Prompt.renderSection(context, content, options);
    }

    return '';
  }

  private static async renderSection<C>(
    context: C,
    section: PromptSection<C>,
    options?: { depth?: number },
  ): Promise<string> {
    const depth = options?.depth ?? 1;
    // Standard Markdown headings max out at h6 (######)
    const headingLevel = Math.min(depth, 6);

    // Pass context and increment depth for nested sections
    // section.content is an array, which renderPrompt already knows how to handle
    const innerContent = await Prompt.renderContent(context, section.content, {
      depth: depth + 1,
    });

    if (!innerContent) {
      return '';
    }

    let result = '';

    if (section.heading) {
      result += `${'#'.repeat(headingLevel)} ${section.heading}\n\n`;
    }

    if (section.tag) {
      const attrs = renderAttributes(section.attrs);
      result += `<${section.tag}${attrs}>\n${innerContent}\n</${section.tag}>`;
    } else {
      result += innerContent;
    }

    return result.trim();
  }
}

export function prompt(
  content: PromptContent<SystemPromptOptions>,
): PromptContent<SystemPromptOptions> {
  return content;
}
