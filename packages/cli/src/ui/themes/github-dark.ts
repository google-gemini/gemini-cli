/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { darkTheme, Theme } from './theme.js';

export const GitHubDark: Theme = new Theme(
  'GitHub',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: '#d1d5da',
      background: '#24292e',
    },
    'hljs-comment': {
      color: '#6A737D',
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: '#6A737D',
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: '#F97583',
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: '#F97583',
      fontWeight: 'bold',
    },
    'hljs-subst': {
      color: '#e1e4e8',
    },
    'hljs-number': {
      color: '#79B8FF',
    },
    'hljs-literal': {
      color: '#79B8FF',
    },
    'hljs-variable': {
      color: '#FFAB70',
    },
    'hljs-template-variable': {
      color: '#FFAB70',
    },
    'hljs-tag .hljs-attr': {
      color: '#FFAB70',
    },
    'hljs-string': {
      color: '#9ECBFF',
    },
    'hljs-doctag': {
      color: '#9ECBFF',
    },
    'hljs-title': {
      color: '#B392F0',
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: '#B392F0',
      fontWeight: 'bold',
    },
    'hljs-selector-id': {
      color: '#B392F0',
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: '#85E89D',
      fontWeight: 'bold',
    },
    'hljs-class .hljs-title': {
      color: '#85E89D',
      fontWeight: 'bold',
    },
    'hljs-tag': {
      color: '#85E89D',
    },
    'hljs-name': {
      color: '#85E89D',
    },
    'hljs-attribute': {
      color: '#79B8FF',
    },
    'hljs-regexp': {
      color: '#DBEDFF',
    },
    'hljs-link': {
      color: '#DBEDFF',
    },
    'hljs-symbol': {
      color: '#990073',
    },
    'hljs-bullet': {
      color: '#990073',
    },
    'hljs-built_in': {
      color: '#79B8FF',
    },
    'hljs-builtin-name': {
      color: '#79B8FF',
    },
    'hljs-meta': {
      color: '#79B8FF',
      fontWeight: 'bold',
    },
    'hljs-deletion': {
      background: '#86181D',
      color: '#FDAEB7',
    },
    'hljs-addition': {
      background: '#144620',
      color: '#85E89D',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  darkTheme,
);
