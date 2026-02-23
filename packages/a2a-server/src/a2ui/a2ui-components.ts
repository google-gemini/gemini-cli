/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builder functions for A2UI standard catalog components.
 * These create the component objects that go into updateComponents messages.
 */

import type { A2UIComponent } from './a2ui-extension.js';

// Layout components

export function column(
  id: string,
  children: string[],
  opts?: { align?: string; justify?: string; weight?: number },
): A2UIComponent {
  return {
    id,
    component: 'Column',
    children,
    ...opts,
  };
}

export function row(
  id: string,
  children: string[],
  opts?: { align?: string; justify?: string },
): A2UIComponent {
  return {
    id,
    component: 'Row',
    children,
    ...opts,
  };
}

export function card(
  id: string,
  child: string,
  opts?: Record<string, unknown>,
): A2UIComponent {
  return {
    id,
    component: 'Card',
    child,
    ...opts,
  };
}

// Content components

export function text(
  id: string,
  textContent: string | { path: string },
  opts?: { variant?: string },
): A2UIComponent {
  return {
    id,
    component: 'Text',
    text: textContent,
    ...opts,
  };
}

export function icon(id: string, name: string): A2UIComponent {
  return {
    id,
    component: 'Icon',
    name,
  };
}

export function divider(
  id: string,
  axis: 'horizontal' | 'vertical' = 'horizontal',
): A2UIComponent {
  return {
    id,
    component: 'Divider',
    axis,
  };
}

// Interactive components

export function button(
  id: string,
  child: string,
  action: {
    event?: { name: string; context: Record<string, unknown> };
    functionCall?: { call: string; args: Record<string, unknown> };
  },
  opts?: { variant?: 'primary' | 'borderless' },
): A2UIComponent {
  return {
    id,
    component: 'Button',
    child,
    action,
    ...opts,
  };
}

export function textField(
  id: string,
  label: string,
  valuePath: string,
  opts?: {
    variant?: 'shortText' | 'longText';
    checks?: Array<{
      call: string;
      args: Record<string, unknown>;
      message: string;
    }>;
  },
): A2UIComponent {
  return {
    id,
    component: 'TextField',
    label,
    value: { path: valuePath },
    ...opts,
  };
}

export function checkBox(
  id: string,
  label: string,
  valuePath: string,
): A2UIComponent {
  return {
    id,
    component: 'CheckBox',
    label,
    value: { path: valuePath },
  };
}

export function choicePicker(
  id: string,
  options: Array<{ label: string; value: string }>,
  valuePath: string,
  opts?: { variant?: 'mutuallyExclusive' | 'multiSelect' },
): A2UIComponent {
  return {
    id,
    component: 'ChoicePicker',
    options,
    value: { path: valuePath },
    ...opts,
  };
}
