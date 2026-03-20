/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * This module provides a functional, type-safe DSL for constructing complex LLM prompts.
 * It supports dynamic content generation, conditional snippets, structural formatting (XML, Markdown),
 * and collection iteration, ensuring that prompt logic remains modular and maintainable.
 *
 * Key Features:
 * - **Type Safety**: Prompts are tied to an options interface, ensuring all dynamic data is validated.
 * - **Composition**: Small, reusable snippets can be combined. Templates (`promptTemplate`) ensure that like components have the same required elements, while components (`promptComponent`) are used for constructing the prompt.
 * - **Conditional Logic**: Use `enabledWhen` and `switchOn` to prune or swap prompt sections dynamically.
 * - **Structural Helpers**: `xmlSection` and `section` (Markdown) handle boilerplate formatting and empty-state pruning.
 * - **Iteration**: `each` simplifies rendering lists of tools, rules, or historical context.
 *
 * @example
 * interface SystemOptions {
 *   name: string;
 *   isInteractive: boolean;
 *   rules: string[];
 *   mode: 'fast' | 'creative';
 * }
 *
 * interface SystemTemplate extends PromptTemplateBase<SystemOptions> {
 *   identity: Snippet<SystemOptions>;
 *   constraints: Snippet<SystemOptions>;
 *   capabilities: Snippet<SystemOptions>;
 * }
 *
 * const systemPrompt = promptTemplate<SystemOptions, SystemTemplate>({
 *   identity: (opt) => `Your name is ${opt.name}.`,
 *   constraints: xmlSection("rules", each<SystemOptions, string>("rules", (r) => `- ${r}`)),
 *   capabilities: promptComponent(
 *     switchOn<SystemOptions>("mode", {
 *       fast: "Optimize for speed and brevity.",
 *       creative: "Optimize for detail and exploration."
 *     }),
 *     enabledWhen<SystemOptions>("isInteractive", "You are in a live session; be brief.")
 *   )
 * });
 *
 * const output = renderTemplate({
 *   name: "Gemini CLI",
 *   isInteractive: true,
 *   rules: ["No spoilers", "Be helpful"],
 *   mode: "fast"
 * }, systemPrompt);
 */

/**
 * A function that generates a string snippet based on the provided options.
 *
 * @example
 * interface Options { name: string; }
 * const snippet: DynamicSnippet<Options> = (options) => `Hello, ${options.name}!`;
 */
export type DynamicSnippet<TOption> = (options: TOption) => string;

/**
 * A snippet can be a string, a dynamic snippet function, an array of snippets,
 * or a full prompt template base object.
 *
 * @example
 * interface Options { name: string; }
 * const simple: Snippet<Options> = "Hello World";
 * const dynamic: Snippet<Options> = (opt) => opt.name;
 * const combined: Snippet<Options> = ["Hello ", (opt) => opt.name];
 */
export type Snippet<TOption> =
  | string
  | DynamicSnippet<TOption>
  | Array<Snippet<TOption>>
  | PromptTemplateBase<TOption>;

/**
 * The base interface for a prompt template, where each key is a snippet.
 */
export interface PromptTemplateBase<TOption> {
  [key: string]: Snippet<TOption>;
}

/**
 * Represents a complete prompt template defined by TTemplate.
 */
export type PromptTemplate<
  TOption,
  TTemplate extends PromptTemplateBase<TOption>,
> = TTemplate;

/**
 * Defines a prompt template.
 *
 * @example
 * interface Options { name: string; }
 * interface Template extends PromptTemplateBase<Options> { greeting: Snippet<Options>; }
 * const myTemplate = promptTemplate<Options, Template>({
 *   greeting: (opt) => `Hello ${opt.name}`
 * });
 */
export function promptTemplate<
  TOption,
  TTemplate extends PromptTemplateBase<TOption>,
>(template: TTemplate): PromptTemplate<TOption, TTemplate> {
  return template;
}

/**
 * Combines multiple snippets into a single component.
 *
 * @example
 * interface Options { second: string; }
 * const component = promptComponent<Options>("First part. ", (opt) => opt.second);
 */
export function promptComponent<TOption>(
  ...snippets: Array<Snippet<TOption>>
): Snippet<TOption> {
  return snippets;
}

/**
 * Conditionally includes a snippet if a specific option is truthy.
 *
 * @example
 * interface Options { verbose: boolean; }
 * const conditional = enabledWhen<Options>("verbose", "Running in verbose mode.");
 */
export function enabledWhen<TOption>(
  optionName: keyof TOption,
  snippet: Snippet<TOption>,
): Snippet<TOption> {
  return (option: TOption) =>
    option[optionName] ? renderSnippet(option, snippet) : '';
}

/**
 * Wraps a snippet in XML tags.
 *
 * @example
 * interface Options { content: string; }
 * const xml = xmlSection<Options>("details", (opt) => opt.content);
 * // Output: <details>\nSome content\n</details>
 */
export function xmlSection<TOption>(
  name: string,
  snippet: Snippet<TOption>,
): Snippet<TOption> {
  return (options: TOption) => {
    const content = renderSnippet(options, snippet);
    return content ? `<${name}>\n${content}\n</${name}>` : '';
  };
}

/**
 * Options for a markdown section.
 */
export interface SectionOptions {
  /** The level of the markdown header (default is 1). */
  headerLevel?: number;
}

/**
 * Creates a markdown-style section with a header.
 *
 * @example
 * interface Options { title: string; }
 * const mdSection = section<Options>("Introduction", "This is the content.", { headerLevel: 2 });
 * // Output: ## Introduction\n\nThis is the content.
 */
export function section<TOption>(
  name: string,
  snippet: Snippet<TOption>,
  sectionOptions?: SectionOptions,
): Snippet<TOption> {
  return (options: TOption) => {
    const content = renderSnippet(options, snippet);
    const level = sectionOptions?.headerLevel ?? 1;
    const hashes = '#'.repeat(level);
    return content ? `${hashes} ${name}\n\n${content}` : '';
  };
}

/**
 * Iterates over an array in the options and renders a snippet for each item.
 *
 * @example
 * interface Options { items: string[]; }
 * const list = each<Options, string>("items", (item) => `- ${item}`);
 */
export function each<TOption, TItem = unknown>(
  optionName: keyof TOption,
  snippet: Snippet<TItem>,
  separator = '\n',
): Snippet<TOption> {
  return (options: TOption) => {
    const items = options[optionName];
    if (Array.isArray(items)) {
      return items
        .map((item: TItem) => renderSnippet(item, snippet))
        .join(separator);
    }
    return '';
  };
}

/**
 * Renders a snippet based on the value of a specific option.
 *
 * @example
 * interface Options { mode: 'a' | 'b'; }
 * const router = switchOn<Options>("mode", {
 *   a: "Mode A selected",
 *   b: "Mode B selected"
 * });
 */
export function switchOn<TOption>(
  optionName: keyof TOption,
  cases: Record<string, Snippet<TOption>>,
): Snippet<TOption> {
  return (options: TOption) => {
    const value = String(options[optionName]);
    const caseSnippet = cases[value];
    return caseSnippet ? renderSnippet(options, caseSnippet) : '';
  };
}

/**
 * Renders an entire template into a single string.
 */
export function renderTemplate<
  TOption,
  TTemplate extends PromptTemplateBase<TOption>,
>(options: TOption, implementation: TTemplate): string {
  return Object.values(implementation)
    .map((eachSnippet) => renderSnippet<TOption>(options, eachSnippet))
    .join();
}

/**
 * Renders a snippet into a string.
 */
export function renderSnippet<TOption>(
  options: TOption,
  snippet: Snippet<TOption>,
): string {
  if (typeof snippet === 'string') {
    return snippet;
  } else if (Array.isArray(snippet)) {
    return snippet
      .map((eachSnippet) => renderSnippet<TOption>(options, eachSnippet))
      .join();
  } else if (typeof snippet === 'function') {
    return snippet(options);
  } else {
    return Object.values(snippet)
      .map((eachSnippet) => renderSnippet<TOption>(options, eachSnippet))
      .join();
  }
}
