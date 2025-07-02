/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme, ColorsTheme } from './theme.js';

const noColorColorsTheme: ColorsTheme = {
  type: 'ansi',
  Background: '',
  Foreground: '',
  LightBlue: '',
  AccentBlue: '',
  AccentPurple: '',
  AccentCyan: '',
  AccentGreen: '',
  AccentYellow: '',
  AccentRed: '',
  Comment: '',
  Gray: '',
};

export const NoColorTheme: Theme = new Theme(
  'No Color',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
    },
    'hljs-keyword': {},
    'hljs-literal': {},
    'hljs-symbol': {},
    'hljs-name': {},
    'hljs-link': {
      textDecoration: 'underline',
    },
    'hljs-built_in': {},
    'hljs-type': {},
    'hljs-number': {},
    'hljs-class': {},
    'hljs-string': {},
    'hljs-meta-string': {},
    'hljs-regexp': {},
    'hljs-template-tag': {},
    'hljs-subst': {},
    'hljs-function': {},
    'hljs-title': {},
    'hljs-params': {},
    'hljs-formula': {},
    'hljs-comment': {
      fontStyle: 'italic',
    },
    'hljs-quote': {
      fontStyle: 'italic',
    },
    'hljs-doctag': {},
    'hljs-meta': {},
    'hljs-meta-keyword': {},
    'hljs-tag': {},
    'hljs-variable': {},
    'hljs-template-variable': {},
    'hljs-attr': {},
    'hljs-attribute': {},
    'hljs-builtin-name': {},
    'hljs-section': {},
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {},
    'hljs-selector-tag': {},
    'hljs-selector-id': {},
    'hljs-selector-class': {},
    'hljs-selector-attr': {},
    'hljs-selector-pseudo': {},
    'hljs-addition': {
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      display: 'inline-block',
      width: '100%',
    },
  },
  noColorColorsTheme,
);
