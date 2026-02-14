/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { type SemanticColors } from './semantic-tokens.js';

const solarizedDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#002b36',
  Foreground: '#839496',
  LightBlue: '#268bd2',
  AccentBlue: '#268bd2',
  AccentPurple: '#6c71c4',
  AccentCyan: '#2aa198',
  AccentGreen: '#859900',
  AccentYellow: '#d0b000',
  AccentRed: '#dc322f',
  DiffAdded: '#859900',
  DiffRemoved: '#dc322f',
  Comment: '#586e75',
  Gray: '#586e75',
  DarkGray: '#073642',
  GradientColors: ['#268bd2', '#2aa198'],
};

const semanticColors: SemanticColors = {
  text: {
    primary: '#839496',
    secondary: '#586e75',
    link: '#268bd2',
    accent: '#268bd2',
    response: '#839496',
  },
  background: {
    primary: '#002b36',
    diff: {
      added: '#00382f',
      removed: '#3d0115',
    },
  },
  border: {
    default: '#073642',
    focused: '#586e75',
  },
  ui: {
    comment: '#586e75',
    symbol: '#93a1a1',
    dark: '#073642',
    gradient: ['#268bd2', '#2aa198'],
  },
  status: {
    success: '#859900',
    warning: '#d0b000',
    error: '#dc322f',
  },
};

export const SolarizedDark: Theme = new Theme(
  'Solarized Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: solarizedDarkColors.Background,
      color: solarizedDarkColors.Foreground,
    },
    'hljs-keyword': {
      color: solarizedDarkColors.AccentBlue,
    },
    'hljs-literal': {
      color: solarizedDarkColors.AccentBlue,
    },
    'hljs-symbol': {
      color: solarizedDarkColors.AccentBlue,
    },
    'hljs-name': {
      color: solarizedDarkColors.AccentBlue,
    },
    'hljs-link': {
      color: solarizedDarkColors.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: solarizedDarkColors.AccentCyan,
    },
    'hljs-type': {
      color: solarizedDarkColors.AccentCyan,
    },
    'hljs-number': {
      color: solarizedDarkColors.AccentGreen,
    },
    'hljs-class': {
      color: solarizedDarkColors.AccentGreen,
    },
    'hljs-string': {
      color: solarizedDarkColors.AccentYellow,
    },
    'hljs-meta-string': {
      color: solarizedDarkColors.AccentYellow,
    },
    'hljs-regexp': {
      color: solarizedDarkColors.AccentRed,
    },
    'hljs-template-tag': {
      color: solarizedDarkColors.AccentRed,
    },
    'hljs-subst': {
      color: solarizedDarkColors.Foreground,
    },
    'hljs-function': {
      color: solarizedDarkColors.Foreground,
    },
    'hljs-title': {
      color: solarizedDarkColors.Foreground,
    },
    'hljs-params': {
      color: solarizedDarkColors.Foreground,
    },
    'hljs-formula': {
      color: solarizedDarkColors.Foreground,
    },
    'hljs-comment': {
      color: solarizedDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: solarizedDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: solarizedDarkColors.Comment,
    },
    'hljs-meta': {
      color: solarizedDarkColors.Gray,
    },
    'hljs-meta-keyword': {
      color: solarizedDarkColors.Gray,
    },
    'hljs-tag': {
      color: solarizedDarkColors.Gray,
    },
    'hljs-variable': {
      color: solarizedDarkColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: solarizedDarkColors.AccentPurple,
    },
    'hljs-attr': {
      color: solarizedDarkColors.LightBlue,
    },
    'hljs-attribute': {
      color: solarizedDarkColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: solarizedDarkColors.LightBlue,
    },
    'hljs-section': {
      color: solarizedDarkColors.AccentYellow,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: solarizedDarkColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: solarizedDarkColors.AccentYellow,
    },
    'hljs-selector-id': {
      color: solarizedDarkColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: solarizedDarkColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: solarizedDarkColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: solarizedDarkColors.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: '#00382f',
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: '#3d0115',
      display: 'inline-block',
      width: '100%',
    },
  },
  solarizedDarkColors,
  semanticColors,
);
