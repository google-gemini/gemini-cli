/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lightTheme, Theme } from './theme.js';

export const AyuLight: Theme = new Theme(
  'Ayu Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: '#f8f9fa',
      color: '#5c6166',
    },
    'hljs-comment': {
      color: '#787b80',
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: '#4cbf99',
      fontStyle: 'italic',
    },
    'hljs-string': {
      color: '#86b300',
    },
    'hljs-constant': {
      color: '#4cbf99',
    },
    'hljs-number': {
      color: '#a37acc',
    },
    'hljs-keyword': {
      color: '#fa8d3e',
    },
    'hljs-selector-tag': {
      color: '#fa8d3e',
    },
    'hljs-attribute': {
      color: '#f2ae49',
    },
    'hljs-variable': {
      color: '#5c6166',
    },
    'hljs-variable.language': {
      color: '#55b4d4',
      fontStyle: 'italic',
    },
    'hljs-title': {
      color: '#399ee6',
    },
    'hljs-section': {
      color: '#86b300',
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: '#55b4d4',
    },
    'hljs-class .hljs-title': {
      color: '#399ee6',
    },
    'hljs-tag': {
      color: '#55b4d4',
    },
    'hljs-name': {
      color: '#399ee6',
    },
    'hljs-builtin-name': {
      color: '#f2ae49',
    },
    'hljs-meta': {
      color: '#e6ba7e',
    },
    'hljs-symbol': {
      color: '#f07171',
    },
    'hljs-bullet': {
      color: '#f2ae49',
    },
    'hljs-regexp': {
      color: '#4cbf99',
    },
    'hljs-link': {
      color: '#55b4d4',
    },
    'hljs-deletion': {
      color: '#ff7383',
    },
    'hljs-addition': {
      color: '#6cbf43',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: '#4cbf99',
    },
    'hljs-built_in': {
      color: '#f07171',
    },
    'hljs-doctag': {
      color: '#d14',
    },
    'hljs-template-variable': {
      color: '#008080',
    },
    'hljs-selector-id': {
      color: '#900',
    },
  },
  lightTheme,
);
