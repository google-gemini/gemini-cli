/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ContextResolver<C, O> = O | ((ctx: C) => O | Promise<O>);

export type PromptSection<C> = {
  /** Unique identifier for the section if it can receive contributions. */
  id?: string;
  /** Add a Markdown heading of appropriate level to this section. */
  heading?: string;
  /** If supplied, wrap this section in an XML tag. */
  tag?: string;
  /** If supplied, add attributes to the XML section tag. */
  attrs?: Record<string, string>;

  /** Condition that must evaluate to true for the section to be rendered. */
  condition?: (ctx: C) => boolean | Promise<boolean>;

  // Notice we use the generic <C> here so the children know about the context
  content: PromptContent<C>;
};

// The core recursive type.
// It wraps your 3 base node shapes (string, section, or array) in the resolver.
export type PromptContent<C> = ContextResolver<
  C,
  string | PromptSection<C> | Array<PromptContent<C>>
>;
