/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shades of Purple Theme — for Highlight.js.
 * @author Ahmad Awais <https://twitter.com/mrahmadawais/>
 */
import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const shadesOfPurpleColors: ColorsTheme = {
  type: 'dark',
  // Required colors for ColorsTheme interface
  Background: '#2d2b57', // Main background
  Foreground: '#e3dfff', // Default text color (hljs, hljs-subst)
  LightBlue: '#847ace', // Light blue/purple accent
  AccentBlue: '#a599e9', // Borders, secondary blue
  AccentPurple: '#ac65ff', // Comments (main purple)
  AccentCyan: '#a1feff', // Names
  AccentGreen: '#A5FF90', // Strings and many others
  AccentYellow: '#fad000', // Title, main yellow
  AccentRed: '#ff628c', // Error/deletion accent
  DiffAdded: '#383E45',
  DiffRemoved: '#572244',
  Comment: '#B362FF', // Comment color (same as AccentPurple)
  Gray: '#726c86', // Gray color
  GradientColors: ['#4d21fc', '#847ace', '#ff628c'],
};

// Additional colors from CSS that don't fit in the ColorsTheme interface
const additionalColors = {
  AccentYellowAlt: '#f8d000', // Attr yellow (slightly different)
  AccentOrange: '#fb9e00', // Keywords, built_in, meta
  AccentPink: '#fa658d', // Numbers, literals
  AccentLightPurple: '#c991ff', // For params and properties
  AccentDarkPurple: '#6943ff', // For operators
  AccentTeal: '#2ee2fa', // For special constructs
};

export const ShadesOfPurple = new Theme(
  'Shades Of Purple',
  'dark',
  {
    // Base styles
    hljs: {
      display: 'block',
      overflowX: 'auto',
      background: shadesOfPurpleColors.Background,
      color: shadesOfPurpleColors.Foreground,
    },

    // Title elements
    'hljs-title': {
      color: shadesOfPurpleColors.AccentYellow,
      fontWeight: 'normal',
    },

    // Names
    'hljs-name': {
      color: shadesOfPurpleColors.AccentCyan,
      fontWeight: 'normal',
    },

    // Tags
    'hljs-tag': {
      color: shadesOfPurpleColors.Foreground,
    },

    // Attributes
    'hljs-attr': {
      color: additionalColors.AccentYellowAlt,
      fontStyle: 'italic',
    },

    // Built-ins, selector tags, sections
    'hljs-built_in': {
      color: additionalColors.AccentOrange,
    },
    'hljs-selector-tag': {
      color: additionalColors.AccentOrange,
      fontWeight: 'normal',
    },
    'hljs-section': {
      color: additionalColors.AccentOrange,
    },

    // Keywords
    'hljs-keyword': {
      color: additionalColors.AccentOrange,
      fontWeight: 'normal',
    },

    // Default text and substitutions
    'hljs-subst': {
      color: shadesOfPurpleColors.Foreground,
    },

    // Strings and related elements (all green)
    'hljs-string': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-attribute': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-symbol': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-bullet': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-addition': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-code': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-regexp': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-selector-class': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-selector-attr': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-selector-pseudo': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-template-tag': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-quote': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-deletion': {
      color: shadesOfPurpleColors.AccentRed,
    },

    // Meta elements
    'hljs-meta': {
      color: additionalColors.AccentOrange,
    },
    'hljs-meta-string': {
      color: additionalColors.AccentOrange,
    },

    // Comments
    'hljs-comment': {
      color: shadesOfPurpleColors.AccentPurple,
    },

    // Literals and numbers
    'hljs-literal': {
      color: additionalColors.AccentPink,
      fontWeight: 'normal',
    },
    'hljs-number': {
      color: additionalColors.AccentPink,
    },

    // Emphasis and strong
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },

    // Diff-specific classes
    'hljs-diff': {
      color: shadesOfPurpleColors.Foreground,
    },
    'hljs-meta.hljs-diff': {
      color: shadesOfPurpleColors.AccentBlue,
    },
    'hljs-ln': {
      color: shadesOfPurpleColors.Gray,
    },

    // Additional elements that might be needed
    'hljs-type': {
      color: shadesOfPurpleColors.AccentYellow,
      fontWeight: 'normal',
    },
    'hljs-variable': {
      color: shadesOfPurpleColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: shadesOfPurpleColors.AccentGreen,
    },
    'hljs-function .hljs-keyword': {
      color: additionalColors.AccentOrange,
    },
    'hljs-link': {
      color: shadesOfPurpleColors.LightBlue,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },

    // Function parameters
    'hljs-params': {
      color: additionalColors.AccentLightPurple,
      fontStyle: 'italic',
    },

    // Class definitions
    'hljs-class': {
      color: shadesOfPurpleColors.AccentCyan,
      fontWeight: 'bold',
    },

    // Function definitions
    'hljs-function': {
      color: shadesOfPurpleColors.AccentCyan,
    },

    // Object properties
    'hljs-property': {
      color: shadesOfPurpleColors.AccentBlue,
    },

    // Operators
    'hljs-operator': {
      color: additionalColors.AccentDarkPurple,
    },

    // Punctuation (if supported by the parser)
    'hljs-punctuation': {
      color: shadesOfPurpleColors.Gray,
    },

    // CSS ID selectors
    'hljs-selector-id': {
      color: shadesOfPurpleColors.AccentYellow,
      fontWeight: 'bold',
    },

    // Character literals
    'hljs-char': {
      color: shadesOfPurpleColors.AccentGreen,
    },

    // Escape sequences
    'hljs-escape': {
      color: additionalColors.AccentPink,
      fontWeight: 'bold',
    },

    // Meta keywords
    'hljs-meta-keyword': {
      color: additionalColors.AccentOrange,
      fontWeight: 'bold',
    },

    // Built-in names
    'hljs-builtin-name': {
      color: additionalColors.AccentTeal,
    },

    // Modules
    'hljs-module': {
      color: shadesOfPurpleColors.AccentCyan,
    },

    // Namespaces
    'hljs-namespace': {
      color: shadesOfPurpleColors.LightBlue,
    },

    // Important annotations
    'hljs-important': {
      color: shadesOfPurpleColors.AccentRed,
      fontWeight: 'bold',
    },

    // Formulas (for LaTeX, etc.)
    'hljs-formula': {
      color: shadesOfPurpleColors.AccentCyan,
      fontStyle: 'italic',
    },

    // Language-specific additions
    // Python decorators
    'hljs-decorator': {
      color: additionalColors.AccentTeal,
      fontWeight: 'bold',
    },

    // Ruby symbols
    'hljs-symbol.ruby': {
      color: additionalColors.AccentPink,
    },

    // SQL keywords
    'hljs-keyword.sql': {
      color: additionalColors.AccentOrange,
      textTransform: 'uppercase',
    },

    // Markdown specific
    'hljs-section.markdown': {
      color: shadesOfPurpleColors.AccentYellow,
      fontWeight: 'bold',
    },

    // JSON keys
    'hljs-attr.json': {
      color: shadesOfPurpleColors.AccentCyan,
    },

    // XML/HTML specific
    'hljs-tag .hljs-name': {
      color: shadesOfPurpleColors.AccentRed,
    },
    'hljs-tag .hljs-attr': {
      color: additionalColors.AccentYellowAlt,
    },

    // Line highlighting (if line numbers are enabled)
    'hljs.hljs-line-numbers': {
      borderRight: `1px solid ${shadesOfPurpleColors.Gray}`,
    },
    'hljs.hljs-line-numbers .hljs-ln-numbers': {
      color: shadesOfPurpleColors.Gray,
      paddingRight: '1em',
    },
    'hljs.hljs-line-numbers .hljs-ln-code': {
      paddingLeft: '1em',
    },

    // Selection styling
    'hljs::selection': {
      background: shadesOfPurpleColors.AccentBlue + '40', // 40 = 25% opacity
    },
    'hljs ::-moz-selection': {
      background: shadesOfPurpleColors.AccentBlue + '40',
    },

    // Highlighted lines (for emphasis)
    'hljs .hljs-highlight': {
      background: shadesOfPurpleColors.AccentPurple + '20', // 20 = 12.5% opacity
      display: 'block',
      width: '100%',
    },
  },
  shadesOfPurpleColors,
  darkSemanticColors,
);
