/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { darkTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

export const DefaultDark: Theme = new Theme(
  'Default',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: darkTheme.Background,
      color: darkTheme.Foreground,
    },
    'hljs-keyword': {
      color: darkTheme.AccentBlue,
    },
    'hljs-literal': {
      color: darkTheme.AccentBlue,
    },
    'hljs-symbol': {
      color: darkTheme.AccentBlue,
    },
    'hljs-name': {
      color: darkTheme.AccentBlue,
    },
    'hljs-link': {
      color: darkTheme.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: darkTheme.AccentCyan,
    },
    'hljs-type': {
      color: darkTheme.AccentCyan,
    },
    'hljs-number': {
      color: darkTheme.AccentGreen,
    },
    'hljs-class': {
      color: darkTheme.AccentGreen,
    },
    'hljs-string': {
      color: darkTheme.AccentYellow,
    },
    'hljs-meta-string': {
      color: darkTheme.AccentYellow,
    },
    'hljs-regexp': {
      color: darkTheme.AccentRed,
    },
    'hljs-template-tag': {
      color: darkTheme.AccentRed,
    },
    'hljs-subst': {
      color: darkTheme.Foreground,
    },
    'hljs-function': {
      color: darkTheme.Foreground,
    },
    'hljs-title': {
      color: darkTheme.Foreground,
    },
    'hljs-params': {
      color: darkTheme.Foreground,
    },
    'hljs-formula': {
      color: darkTheme.Foreground,
    },
    'hljs-comment': {
      color: darkTheme.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: darkTheme.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: darkTheme.Comment,
    },
    'hljs-meta': {
      color: darkTheme.Gray,
    },
    'hljs-meta-keyword': {
      color: darkTheme.Gray,
    },
    'hljs-tag': {
      color: darkTheme.Gray,
    },
    'hljs-variable': {
      color: darkTheme.AccentPurple,
    },
    'hljs-template-variable': {
      color: darkTheme.AccentPurple,
    },
    'hljs-attr': {
      color: darkTheme.LightBlue,
    },
    'hljs-attribute': {
      color: darkTheme.LightBlue,
    },
    'hljs-builtin-name': {
      color: darkTheme.LightBlue,
    },
    'hljs-section': {
      color: darkTheme.AccentYellow,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: darkTheme.AccentYellow,
    },
    'hljs-selector-tag': {
      color: darkTheme.AccentYellow,
    },
    'hljs-selector-id': {
      color: darkTheme.AccentYellow,
    },
    'hljs-selector-class': {
      color: darkTheme.AccentYellow,
    },
    'hljs-selector-attr': {
      color: darkTheme.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: darkTheme.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: '#144212',
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: '#600',
      display: 'inline-block',
      width: '100%',
    },
  },
  darkTheme,
  darkSemanticColors,
);
