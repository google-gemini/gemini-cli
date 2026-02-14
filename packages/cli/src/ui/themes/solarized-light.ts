/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { type SemanticColors } from './semantic-tokens.js';

const solarizedLightColors: ColorsTheme = {
  type: 'light',
  Background: '#fdf6e3',
  Foreground: '#657b83',
  LightBlue: '#268bd2',
  AccentBlue: '#268bd2',
  AccentPurple: '#6c71c4',
  AccentCyan: '#2aa198',
  AccentGreen: '#859900',
  AccentYellow: '#d0b000',
  AccentRed: '#dc322f',
  DiffAdded: '#859900',
  DiffRemoved: '#dc322f',
  Comment: '#93a1a1',
  Gray: '#93a1a1',
  DarkGray: '#eee8d5',
  GradientColors: ['#268bd2', '#2aa198'],
};

const semanticColors: SemanticColors = {
  text: {
    primary: '#657b83',
    secondary: '#93a1a1',
    link: '#268bd2',
    accent: '#268bd2',
    response: '#657b83',
  },
  background: {
    primary: '#fdf6e3',
    diff: {
      added: '#d7f2d7',
      removed: '#f2d7d7',
    },
  },
  border: {
    default: '#eee8d5',
    focused: '#93a1a1',
  },
  ui: {
    comment: '#93a1a1',
    symbol: '#586e75',
    dark: '#eee8d5',
    gradient: ['#268bd2', '#2aa198'],
  },
  status: {
    success: '#859900',
    warning: '#d0b000',
    error: '#dc322f',
  },
};

export const SolarizedLight: Theme = new Theme(
  'Solarized Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: solarizedLightColors.Background,
      color: solarizedLightColors.Foreground,
    },
    'hljs-keyword': {
      color: solarizedLightColors.AccentBlue,
    },
    'hljs-literal': {
      color: solarizedLightColors.AccentBlue,
    },
    'hljs-symbol': {
      color: solarizedLightColors.AccentBlue,
    },
    'hljs-name': {
      color: solarizedLightColors.AccentBlue,
    },
    'hljs-link': {
      color: solarizedLightColors.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: solarizedLightColors.AccentCyan,
    },
    'hljs-type': {
      color: solarizedLightColors.AccentCyan,
    },
    'hljs-number': {
      color: solarizedLightColors.AccentGreen,
    },
    'hljs-class': {
      color: solarizedLightColors.AccentGreen,
    },
    'hljs-string': {
      color: solarizedLightColors.AccentYellow,
    },
    'hljs-meta-string': {
      color: solarizedLightColors.AccentYellow,
    },
    'hljs-regexp': {
      color: solarizedLightColors.AccentRed,
    },
    'hljs-template-tag': {
      color: solarizedLightColors.AccentRed,
    },
    'hljs-subst': {
      color: solarizedLightColors.Foreground,
    },
    'hljs-function': {
      color: solarizedLightColors.Foreground,
    },
    'hljs-title': {
      color: solarizedLightColors.Foreground,
    },
    'hljs-params': {
      color: solarizedLightColors.Foreground,
    },
    'hljs-formula': {
      color: solarizedLightColors.Foreground,
    },
    'hljs-comment': {
      color: solarizedLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: solarizedLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: solarizedLightColors.Comment,
    },
    'hljs-meta': {
      color: solarizedLightColors.Gray,
    },
    'hljs-meta-keyword': {
      color: solarizedLightColors.Gray,
    },
    'hljs-tag': {
      color: solarizedLightColors.Gray,
    },
    'hljs-variable': {
      color: solarizedLightColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: solarizedLightColors.AccentPurple,
    },
    'hljs-attr': {
      color: solarizedLightColors.LightBlue,
    },
    'hljs-attribute': {
      color: solarizedLightColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: solarizedLightColors.LightBlue,
    },
    'hljs-section': {
      color: solarizedLightColors.AccentYellow,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: solarizedLightColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: solarizedLightColors.AccentYellow,
    },
    'hljs-selector-id': {
      color: solarizedLightColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: solarizedLightColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: solarizedLightColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: solarizedLightColors.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: '#d7f2d7',
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: '#f2d7d7',
      display: 'inline-block',
      width: '100%',
    },
  },
  solarizedLightColors,
  semanticColors,
);
