/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lightTheme, Theme } from './theme.js';

export const GitHubLight: Theme = new Theme(
  'GitHub Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: '#24292E',
      background: '#f8f8f8',
    },
    'hljs-comment': {
      color: '#998',
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: '#998',
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: '#333',
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: '#333',
      fontWeight: 'bold',
    },
    'hljs-subst': {
      color: '#333',
      fontWeight: 'normal',
    },
    'hljs-number': {
      color: '#008080',
    },
    'hljs-literal': {
      color: '#008080',
    },
    'hljs-variable': {
      color: '#008080',
    },
    'hljs-template-variable': {
      color: '#008080',
    },
    'hljs-tag .hljs-attr': {
      color: '#008080',
    },
    'hljs-string': {
      color: '#d14',
    },
    'hljs-doctag': {
      color: '#d14',
    },
    'hljs-title': {
      color: '#900',
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: '#900',
      fontWeight: 'bold',
    },
    'hljs-selector-id': {
      color: '#900',
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: '#458',
      fontWeight: 'bold',
    },
    'hljs-class .hljs-title': {
      color: '#458',
      fontWeight: 'bold',
    },
    'hljs-tag': {
      color: '#000080',
      fontWeight: 'normal',
    },
    'hljs-name': {
      color: '#000080',
      fontWeight: 'normal',
    },
    'hljs-attribute': {
      color: '#000080',
      fontWeight: 'normal',
    },
    'hljs-regexp': {
      color: '#009926',
    },
    'hljs-link': {
      color: '#009926',
    },
    'hljs-symbol': {
      color: '#990073',
    },
    'hljs-bullet': {
      color: '#990073',
    },
    'hljs-built_in': {
      color: '#0086b3',
    },
    'hljs-builtin-name': {
      color: '#0086b3',
    },
    'hljs-meta': {
      color: '#999',
      fontWeight: 'bold',
    },
    'hljs-deletion': {
      background: '#fdd',
    },
    'hljs-addition': {
      background: '#dfd',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  lightTheme,
);
