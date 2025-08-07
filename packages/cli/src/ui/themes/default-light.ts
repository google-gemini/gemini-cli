/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lightTheme, Theme } from './theme.js';
import { lightSemanticColors } from './semantic-tokens.js';

export const DefaultLight: Theme = new Theme(
  'Default Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: lightTheme.Background,
      color: lightTheme.Foreground,
    },
    'hljs-comment': {
      color: lightTheme.Comment,
    },
    'hljs-quote': {
      color: lightTheme.Comment,
    },
    'hljs-variable': {
      color: lightTheme.Foreground,
    },
    'hljs-keyword': {
      color: lightTheme.AccentBlue,
    },
    'hljs-selector-tag': {
      color: lightTheme.AccentBlue,
    },
    'hljs-built_in': {
      color: lightTheme.AccentBlue,
    },
    'hljs-name': {
      color: lightTheme.AccentBlue,
    },
    'hljs-tag': {
      color: lightTheme.AccentBlue,
    },
    'hljs-string': {
      color: lightTheme.AccentRed,
    },
    'hljs-title': {
      color: lightTheme.AccentRed,
    },
    'hljs-section': {
      color: lightTheme.AccentRed,
    },
    'hljs-attribute': {
      color: lightTheme.AccentRed,
    },
    'hljs-literal': {
      color: lightTheme.AccentRed,
    },
    'hljs-template-tag': {
      color: lightTheme.AccentRed,
    },
    'hljs-template-variable': {
      color: lightTheme.AccentRed,
    },
    'hljs-type': {
      color: lightTheme.AccentRed,
    },
    'hljs-addition': {
      color: lightTheme.AccentGreen,
    },
    'hljs-deletion': {
      color: lightTheme.AccentRed,
    },
    'hljs-selector-attr': {
      color: lightTheme.AccentCyan,
    },
    'hljs-selector-pseudo': {
      color: lightTheme.AccentCyan,
    },
    'hljs-meta': {
      color: lightTheme.AccentCyan,
    },
    'hljs-doctag': {
      color: lightTheme.Gray,
    },
    'hljs-attr': {
      color: lightTheme.AccentRed,
    },
    'hljs-symbol': {
      color: lightTheme.AccentCyan,
    },
    'hljs-bullet': {
      color: lightTheme.AccentCyan,
    },
    'hljs-link': {
      color: lightTheme.AccentCyan,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  lightTheme,
  lightSemanticColors,
);
