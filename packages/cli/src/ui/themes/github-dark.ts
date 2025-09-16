/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const githubDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#24292e',
  Foreground: '#c0c4c8',
  LightBlue: '#79B8FF',
  AccentBlue: '#79B8FF',
  AccentPurple: '#B392F0',
  AccentCyan: '#9ECBFF',
  AccentGreen: '#85E89D',
  AccentYellow: '#FFAB70',
  AccentRed: '#F97583',
  DiffAdded: '#3C4636',
  DiffRemoved: '#502125',
  Comment: '#6A737D',
  Gray: '#6A737D',
  GradientColors: ['#79B8FF', '#85E89D'],
};

export const GitHubDark: Theme = new Theme(
  'GitHub',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: githubDarkColors.Foreground,
      background: githubDarkColors.Background,
    },
    'hljs-comment': {
      color: githubDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: githubDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: githubDarkColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: githubDarkColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-subst': {
      color: githubDarkColors.Foreground,
    },
    'hljs-number': {
      color: githubDarkColors.LightBlue,
    },
    'hljs-literal': {
      color: githubDarkColors.LightBlue,
    },
    'hljs-variable': {
      color: githubDarkColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: githubDarkColors.AccentYellow,
    },
    'hljs-tag .hljs-attr': {
      color: githubDarkColors.AccentYellow,
    },
    'hljs-string': {
      color: githubDarkColors.AccentCyan,
    },
    'hljs-doctag': {
      color: githubDarkColors.AccentCyan,
    },
    'hljs-title': {
      color: githubDarkColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: githubDarkColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-id': {
      color: githubDarkColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: githubDarkColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-class .hljs-title': {
      color: githubDarkColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-tag': {
      color: githubDarkColors.AccentGreen,
    },
    'hljs-name': {
      color: githubDarkColors.AccentGreen,
    },
    'hljs-attribute': {
      color: githubDarkColors.LightBlue,
    },
    'hljs-regexp': {
      color: githubDarkColors.AccentCyan,
    },
    'hljs-link': {
      color: githubDarkColors.AccentCyan,
    },
    'hljs-symbol': {
      color: githubDarkColors.AccentPurple,
    },
    'hljs-bullet': {
      color: githubDarkColors.AccentPurple,
    },
    'hljs-built_in': {
      color: githubDarkColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: githubDarkColors.LightBlue,
    },
    'hljs-meta': {
      color: githubDarkColors.LightBlue,
      fontWeight: 'bold',
    },
    'hljs-deletion': {
      background: '#86181D',
      color: githubDarkColors.AccentRed,
    },
    'hljs-addition': {
      background: '#144620',
      color: githubDarkColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  githubDarkColors,
);
