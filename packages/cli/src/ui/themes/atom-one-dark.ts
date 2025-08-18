/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const atomOneDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#282c34',
  Foreground: '#abb2bf',
  LightBlue: '#61aeee',
  AccentBlue: '#61aeee',
  AccentPurple: '#c678dd',
  AccentCyan: '#56b6c2',
  AccentGreen: '#98c379',
  AccentYellow: '#e6c07b',
  AccentRed: '#e06c75',
  DiffAdded: '#39544E',
  DiffRemoved: '#562B2F',
  Comment: '#5c6370',
  Gray: '#5c6370',
  GradientColors: ['#61aeee', '#98c379'],
};

export const AtomOneDark: Theme = new Theme(
  'Atom One',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: atomOneDarkColors.Foreground,
      background: atomOneDarkColors.Background,
    },
    'hljs-comment': {
      color: atomOneDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: atomOneDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: atomOneDarkColors.AccentPurple,
    },
    'hljs-keyword': {
      color: atomOneDarkColors.AccentPurple,
    },
    'hljs-formula': {
      color: atomOneDarkColors.AccentPurple,
    },
    'hljs-section': {
      color: atomOneDarkColors.AccentRed,
    },
    'hljs-name': {
      color: atomOneDarkColors.AccentRed,
    },
    'hljs-selector-tag': {
      color: atomOneDarkColors.AccentRed,
    },
    'hljs-deletion': {
      color: atomOneDarkColors.AccentRed,
    },
    'hljs-subst': {
      color: atomOneDarkColors.AccentRed,
    },
    'hljs-literal': {
      color: atomOneDarkColors.AccentCyan,
    },
    'hljs-string': {
      color: atomOneDarkColors.AccentGreen,
    },
    'hljs-regexp': {
      color: atomOneDarkColors.AccentGreen,
    },
    'hljs-addition': {
      color: atomOneDarkColors.AccentGreen,
    },
    'hljs-attribute': {
      color: atomOneDarkColors.AccentGreen,
    },
    'hljs-meta-string': {
      color: atomOneDarkColors.AccentGreen,
    },
    'hljs-built_in': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-class .hljs-title': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-attr': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-variable': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-type': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-number': {
      color: atomOneDarkColors.AccentYellow,
    },
    'hljs-symbol': {
      color: atomOneDarkColors.AccentBlue,
    },
    'hljs-bullet': {
      color: atomOneDarkColors.AccentBlue,
    },
    'hljs-link': {
      color: atomOneDarkColors.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-meta': {
      color: atomOneDarkColors.AccentBlue,
    },
    'hljs-selector-id': {
      color: atomOneDarkColors.AccentBlue,
    },
    'hljs-title': {
      color: atomOneDarkColors.AccentBlue,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  atomOneDarkColors,
  darkSemanticColors,
);
