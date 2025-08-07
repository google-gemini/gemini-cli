/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const darkModernColors: ColorsTheme = {
  type: 'dark',
  Background: '#1F1F1F',        // editor.background
  Foreground: '#CCCCCC',        // foreground
  LightBlue: '#4daafc',         // textLink.foreground
  AccentBlue: '#0078D4',        // button.background, focusBorder
  AccentPurple: '#85B6FF',      // chat.slashCommandForeground
  AccentCyan: '#8be9fd',        // Keep cyan from dracula for variety
  AccentGreen: '#2EA043',       // editorGutter.addedBackground
  AccentYellow: '#E2C08D',      // chat.editedFileForeground
  AccentRed: '#F85149',         // errorForeground, editorGutter.deletedBackground
  Comment: '#6E7681',           // editorLineNumber.foreground
  Gray: '#9D9D9D',              // descriptionForeground
  GradientColors: ['#0078D4', '#85B6FF'],
};

export const DarkModern: Theme = new Theme(
  'Dark Modern',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: darkModernColors.Background,
      color: darkModernColors.Foreground,
    },
    'hljs-keyword': {
      color: darkModernColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: darkModernColors.AccentBlue,
    },
    'hljs-symbol': {
      color: darkModernColors.AccentBlue,
    },
    'hljs-name': {
      color: darkModernColors.AccentBlue,
    },
    'hljs-link': {
      color: darkModernColors.LightBlue,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: darkModernColors.AccentCyan,
    },
    'hljs-type': {
      color: darkModernColors.AccentCyan,
    },
    'hljs-number': {
      color: darkModernColors.AccentGreen,
    },
    'hljs-class': {
      color: darkModernColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-string': {
      color: darkModernColors.AccentYellow,
    },
    'hljs-meta-string': {
      color: darkModernColors.AccentYellow,
    },
    'hljs-regexp': {
      color: darkModernColors.AccentRed,
    },
    'hljs-template-tag': {
      color: darkModernColors.AccentPurple,
    },
    'hljs-subst': {
      color: darkModernColors.Foreground,
    },
    'hljs-function': {
      color: darkModernColors.AccentPurple,
    },
    'hljs-title': {
      color: darkModernColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-params': {
      color: darkModernColors.Foreground,
    },
    'hljs-formula': {
      color: darkModernColors.Foreground,
    },
    'hljs-comment': {
      color: darkModernColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: darkModernColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: darkModernColors.Comment,
    },
    'hljs-meta': {
      color: darkModernColors.Gray,
    },
    'hljs-meta-keyword': {
      color: darkModernColors.AccentBlue,
    },
    'hljs-tag': {
      color: darkModernColors.AccentBlue,
    },
    'hljs-variable': {
      color: darkModernColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: darkModernColors.AccentPurple,
    },
    'hljs-attr': {
      color: darkModernColors.LightBlue,
    },
    'hljs-attribute': {
      color: darkModernColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: darkModernColors.AccentCyan,
    },
    'hljs-section': {
      color: darkModernColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: darkModernColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: darkModernColors.AccentBlue,
    },
    'hljs-selector-id': {
      color: darkModernColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: darkModernColors.AccentGreen,
    },
    'hljs-selector-attr': {
      color: darkModernColors.AccentPurple,
    },
    'hljs-selector-pseudo': {
      color: darkModernColors.AccentPurple,
    },
    'hljs-addition': {
      color: darkModernColors.AccentGreen,
      backgroundColor: '#26352F',
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      color: darkModernColors.AccentRed,
      backgroundColor: '#3D1E1E',
      display: 'inline-block',
      width: '100%',
    },
  },
  darkModernColors,
); 