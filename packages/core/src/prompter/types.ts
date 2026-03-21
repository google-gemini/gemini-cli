/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ContextResolver<C, O> = O | ((ctx: C) => O | Promise<O>);

export type PromptSlot = { slot: string; content?: never };

export type PromptSection<C> = {
  /** Add a Markdown heading of appropriate level to this section. */
  heading?: string;
  /** If supplied, wrap this section in an XML tag. */
  tag?: string;
  /** If supplied, add attributes to the XML section tag. */
  attrs?: Record<string, string>;
  /** Formatting of the content inside this section. Defaults to 'block'. */
  format?: 'inline' | 'block';

  /** Condition that must evaluate to true for the section to be rendered. */
  condition?: (ctx: C) => boolean | Promise<boolean>;
  content: PromptContent<C>;
};

// The core recursive type.
// It wraps your 3 base node shapes (string, section, or array) in the resolver.
export type PromptContent<C> = ContextResolver<
  C,
  | string
  | number
  | boolean
  | PromptSection<C>
  | PromptSlot
  | Array<PromptContent<C>>
>;
