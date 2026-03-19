/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type DynamicSnippet<TOption> = (options: TOption) => string;

export type Snippet<TOption> = string | DynamicSnippet<TOption> | Array<Snippet<TOption>>;

export function promptComponent<TOption>(...snippets: Array<Snippet<TOption>>): Snippet<TOption> {
  return snippets;
}

export function enabledWhen<TOption>(optionName: keyof TOption, snippet: Snippet<TOption>): Snippet<TOption> {
  return (option: TOption) => option[optionName] ? toPrompt(option, snippet) : '';
}

export function xmlSection<TOption>(name: string, snippet: Snippet<TOption>): Snippet<TOption> {
  return (options: TOption) => {
    const content = toPrompt(options, snippet);
    return content ? `<${name}>\n${content}\n</${name}>` : '';
  };
}

export interface SectionOptions {
  headerLevel?: number;
}

export function section<TOption>(name: string, snippet: Snippet<TOption>, sectionOptions?: SectionOptions): Snippet<TOption> {
  return (options: TOption) => {
    const content = toPrompt(options, snippet);
    const level = sectionOptions?.headerLevel ?? 1;
    const hashes = '#'.repeat(level);
    return content ? `${hashes} ${name}\n\n${content}` : '';
  };
}

export function each<TOption>(
  optionName: keyof TOption,
  snippet: Snippet<TOption>,
  separator = '\n'
): Snippet<TOption> {
  return (options: TOption) => {
    const items = options[optionName];
    if (Array.isArray(items)) {
      return items.map((item: any) => toPrompt(item, snippet)).join(separator);
    }
    return '';
  };
}

export function switchOn<TOption>(
  optionName: keyof TOption,
  cases: Record<string, Snippet<TOption>>
): Snippet<TOption> {
  return (options: TOption) => {
    const value = String(options[optionName]);
    const caseSnippet = cases[value];
    return caseSnippet ? toPrompt(options, caseSnippet) : '';
  };
}

export function toPrompt<TOption>(options: TOption, snippet: Snippet<TOption>): string {
  if (typeof snippet === 'string') {
    return snippet;
  } else if (Array.isArray(snippet)) {
    return snippet.map(eachSnippet => toPrompt<TOption>(options, eachSnippet)).join();
  } else {
    return snippet(options);
  }
}
