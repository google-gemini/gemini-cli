/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { darkTheme, Theme } from './theme.js';

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
      color: darkTheme.AccentPurple,
    },
    'hljs-built_in': {
      color: darkTheme.AccentCyan,
    },
    'hljs-type': {
      color: darkTheme.AccentCyan,
    },
    'hljs-literal': {
      color: darkTheme.AccentBlue,
    },
    'hljs-number': {
      color: darkTheme.AccentGreen,
    },
    'hljs-string': {
      color: darkTheme.AccentYellow,
    },
    'hljs-regexp': {
      color: darkTheme.AccentRed,
    },
    'hljs-variable': {
      color: darkTheme.LightBlue,
    },
    'hljs-template-variable': {
      color: darkTheme.LightBlue,
    },
    'hljs-attr': {
      color: darkTheme.LightBlue,
    },
    'hljs-attribute': {
      color: darkTheme.LightBlue,
    },
    'hljs-property': {
      color: darkTheme.LightBlue,
    },
    'hljs-meta': {
      color: darkTheme.AccentBlue,
    },
    'hljs-meta-keyword': {
      color: darkTheme.AccentBlue,
    },
    'hljs-tag': {
      color: darkTheme.AccentBlue,
    },
    'hljs-name': {
      color: darkTheme.AccentBlue,
    },
    'hljs-selector-tag': {
      color: darkTheme.AccentBlue,
    },
    'hljs-function': {
      color: darkTheme.AccentGreen,
    },
    'hljs-title': {
      color: darkTheme.AccentGreen,
    },
    'hljs-class': {
      color: darkTheme.AccentGreen,
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
    'hljs-link': {
      color: darkTheme.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-subst': {
      color: darkTheme.Foreground,
    },
    'hljs-params': {
      color: darkTheme.Foreground,
    },
    'hljs-formula': {
      color: darkTheme.Foreground,
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
    'hljs-selector-id': {
      color: darkTheme.AccentRed,
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
    'hljs-template-tag': {
      color: darkTheme.AccentBlue,
    },
    'hljs-addition': {
      color: darkTheme.AccentGreen,
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      color: darkTheme.AccentRed,
      display: 'inline-block',
      width: '100%',
    },
  },
  darkTheme,
);
