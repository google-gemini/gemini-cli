/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const ansiColors: ColorsTheme = {
  type: 'dark',
  Background: 'black',
  Foreground: 'white',
  LightBlue: 'bluebright',
  AccentBlue: 'blue',
  AccentPurple: 'magenta',
  AccentCyan: 'cyan',
  AccentGreen: 'green',
  AccentYellow: 'yellow',
  AccentRed: 'red',
  Comment: 'gray',
  Gray: 'gray',
  GradientColors: ['cyan', 'green'],
};

export const ANSI: Theme = new Theme(
  'ANSI',
  'dark', // Consistent with its color palette base
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: 'black', // Mapped from #1E1E1E
      color: 'white', // Mapped from #DCDCDC
    },
    'hljs-keyword': {
      color: 'blue', // Mapped from #569CD6
    },
    'hljs-literal': {
      color: 'blue', // Mapped from #569CD6
    },
    'hljs-symbol': {
      color: 'blue', // Mapped from #569CD6
    },
    'hljs-name': {
      color: 'blue', // Mapped from #569CD6
    },
    'hljs-link': {
      color: 'blue', // Mapped from #569CD6
      // textDecoration is ignored by Theme class
    },
    'hljs-built_in': {
      color: 'cyan', // Mapped from #4EC9B0
    },
    'hljs-type': {
      color: 'cyan', // Mapped from #4EC9B0
    },
    'hljs-number': {
      color: 'green', // Mapped from #B8D7A3
    },
    'hljs-class': {
      color: 'green', // Mapped from #B8D7A3
    },
    'hljs-string': {
      color: 'yellow', // Mapped from #D69D85
    },
    'hljs-meta-string': {
      color: 'yellow', // Mapped from #D69D85
    },
    'hljs-regexp': {
      color: 'red', // Mapped from #9A5334
    },
    'hljs-template-tag': {
      color: 'red', // Mapped from #9A5334
    },
    'hljs-subst': {
      color: 'white', // Mapped from #DCDCDC
    },
    'hljs-function': {
      color: 'white', // Mapped from #DCDCDC
    },
    'hljs-title': {
      color: 'white', // Mapped from #DCDCDC
    },
    'hljs-params': {
      color: 'white', // Mapped from #DCDCDC
    },
    'hljs-formula': {
      color: 'white', // Mapped from #DCDCDC
    },
    'hljs-comment': {
      color: 'green', // Mapped from #57A64A
      // fontStyle is ignored by Theme class
    },
    'hljs-quote': {
      color: 'green', // Mapped from #57A64A
      // fontStyle is ignored by Theme class
    },
    'hljs-doctag': {
      color: 'green', // Mapped from #608B4E
    },
    'hljs-meta': {
      color: 'gray', // Mapped from #9B9B9B
    },
    'hljs-meta-keyword': {
      color: 'gray', // Mapped from #9B9B9B
    },
    'hljs-tag': {
      color: 'gray', // Mapped from #9B9B9B
    },
    'hljs-variable': {
      color: 'magenta', // Mapped from #BD63C5
    },
    'hljs-template-variable': {
      color: 'magenta', // Mapped from #BD63C5
    },
    'hljs-attr': {
      color: 'bluebright', // Mapped from #9CDCFE
    },
    'hljs-attribute': {
      color: 'bluebright', // Mapped from #9CDCFE
    },
    'hljs-builtin-name': {
      color: 'bluebright', // Mapped from #9CDCFE
    },
    'hljs-section': {
      color: 'yellow', // Mapped from gold
    },
    'hljs-emphasis': {
      // fontStyle is ignored by Theme class
    },
    'hljs-strong': {
      // fontWeight is ignored by Theme class
    },
    'hljs-bullet': {
      color: 'yellow', // Mapped from #D7BA7D
    },
    'hljs-selector-tag': {
      color: 'yellow', // Mapped from #D7BA7D
    },
    'hljs-selector-id': {
      color: 'yellow', // Mapped from #D7BA7D
    },
    'hljs-selector-class': {
      color: 'yellow', // Mapped from #D7BA7D
    },
    'hljs-selector-attr': {
      color: 'yellow', // Mapped from #D7BA7D
    },
    'hljs-selector-pseudo': {
      color: 'yellow', // Mapped from #D7BA7D
    },
  },
  ansiColors,
);
