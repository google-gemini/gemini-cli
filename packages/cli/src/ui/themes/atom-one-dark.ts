/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { darkTheme, Theme } from './theme.js';

export const AtomOneDark: Theme = new Theme(
  'Atom One Dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: '#abb2bf',
      background: '#282c34',
    },
    'hljs-comment': {
      color: '#5c6370',
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: '#5c6370',
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: '#c678dd',
    },
    'hljs-keyword': {
      color: '#c678dd',
    },
    'hljs-formula': {
      color: '#c678dd',
    },
    'hljs-section': {
      color: '#e06c75',
    },
    'hljs-name': {
      color: '#e06c75',
    },
    'hljs-selector-tag': {
      color: '#e06c75',
    },
    'hljs-deletion': {
      color: '#e06c75',
    },
    'hljs-subst': {
      color: '#e06c75',
    },
    'hljs-literal': {
      color: '#56b6c2',
    },
    'hljs-string': {
      color: '#98c379',
    },
    'hljs-regexp': {
      color: '#98c379',
    },
    'hljs-addition': {
      color: '#98c379',
    },
    'hljs-attribute': {
      color: '#98c379',
    },
    'hljs-meta-string': {
      color: '#98c379',
    },
    'hljs-built_in': {
      color: '#e6c07b',
    },
    'hljs-class .hljs-title': {
      color: '#e6c07b',
    },
    'hljs-attr': {
      color: '#d19a66',
    },
    'hljs-variable': {
      color: '#d19a66',
    },
    'hljs-template-variable': {
      color: '#d19a66',
    },
    'hljs-type': {
      color: '#d19a66',
    },
    'hljs-selector-class': {
      color: '#d19a66',
    },
    'hljs-selector-attr': {
      color: '#d19a66',
    },
    'hljs-selector-pseudo': {
      color: '#d19a66',
    },
    'hljs-number': {
      color: '#d19a66',
    },
    'hljs-symbol': {
      color: '#61aeee',
    },
    'hljs-bullet': {
      color: '#61aeee',
    },
    'hljs-link': {
      color: '#61aeee',
      textDecoration: 'underline',
    },
    'hljs-meta': {
      color: '#61aeee',
    },
    'hljs-selector-id': {
      color: '#61aeee',
    },
    'hljs-title': {
      color: '#61aeee',
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
