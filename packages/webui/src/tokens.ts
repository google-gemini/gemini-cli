/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Material Design 3 Design Tokens
 * Based on https://m3.material.io/foundations
 */

// ─────────────────────────────────────────────────────────────────────────────
// MD3 COLOR ROLES
// ─────────────────────────────────────────────────────────────────────────────

export interface MD3ColorScheme {
  // Primary colors
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  // Secondary colors
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  // Tertiary colors
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  // Error colors
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  // Background colors
  background: string;
  onBackground: string;

  // Surface colors
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceTint: string;
  surfaceContainer: string;
  surfaceContainerLow: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  // Outline colors
  outline: string;
  outlineVariant: string;

  // Other
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;

  // Shadow & scrim
  shadow: string;
  scrim: string;
}

// Dark theme color scheme (Gemini CLI default)
export const darkColorScheme: MD3ColorScheme = {
  // Primary - Cyan/Blue accent
  primary: '#8dd3ff',
  onPrimary: '#003547',
  primaryContainer: '#004d66',
  onPrimaryContainer: '#c2e8ff',

  // Secondary - Teal
  secondary: '#82d6a2',
  onSecondary: '#003822',
  secondaryContainer: '#005233',
  onSecondaryContainer: '#9df4bc',

  // Tertiary - Purple/Magenta
  tertiary: '#d0bcff',
  onTertiary: '#381d72',
  tertiaryContainer: '#4f378b',
  onTertiaryContainer: '#e9ddff',

  // Error
  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',

  // Background
  background: '#0c1117',
  onBackground: '#e1e6ec',

  // Surface
  surface: '#111823',
  onSurface: '#e1e6ec',
  surfaceVariant: '#223046',
  onSurfaceVariant: '#c1c7cf',
  surfaceTint: '#8dd3ff',
  surfaceContainer: '#182231',
  surfaceContainerLow: '#141d29',
  surfaceContainerHigh: '#1e2a3a',
  surfaceContainerHighest: '#283545',

  // Outline
  outline: 'rgba(141, 211, 255, 0.22)',
  outlineVariant: 'rgba(141, 211, 255, 0.12)',

  // Inverse
  inverseSurface: '#e1e6ec',
  inverseOnSurface: '#2d353f',
  inversePrimary: '#00668a',

  // Shadow & scrim
  shadow: 'rgba(0, 0, 0, 0.38)',
  scrim: 'rgba(0, 0, 0, 0.64)',
};

// Light theme color scheme
export const lightColorScheme: MD3ColorScheme = {
  // Primary
  primary: '#00668a',
  onPrimary: '#ffffff',
  primaryContainer: '#c2e8ff',
  onPrimaryContainer: '#001d2c',

  // Secondary
  secondary: '#006c43',
  onSecondary: '#ffffff',
  secondaryContainer: '#9df4bc',
  onSecondaryContainer: '#002111',

  // Tertiary
  tertiary: '#6750a4',
  onTertiary: '#ffffff',
  tertiaryContainer: '#e9ddff',
  onTertiaryContainer: '#22005d',

  // Error
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#410002',

  // Background
  background: '#f8fafc',
  onBackground: '#191c1f',

  // Surface
  surface: '#ffffff',
  onSurface: '#191c1f',
  surfaceVariant: '#dce3e9',
  onSurfaceVariant: '#41474d',
  surfaceTint: '#00668a',
  surfaceContainer: '#f0f3f5',
  surfaceContainerLow: '#f5f7f9',
  surfaceContainerHigh: '#eaeef1',
  surfaceContainerHighest: '#e4e8eb',

  // Outline
  outline: 'rgba(0, 102, 138, 0.24)',
  outlineVariant: 'rgba(0, 102, 138, 0.12)',

  // Inverse
  inverseSurface: '#2d353f',
  inverseOnSurface: '#eff1f3',
  inversePrimary: '#8dd3ff',

  // Shadow & scrim
  shadow: 'rgba(0, 0, 0, 0.14)',
  scrim: 'rgba(0, 0, 0, 0.32)',
};

// Ocean theme color scheme
export const oceanColorScheme: MD3ColorScheme = {
  // Primary - Ocean blue
  primary: '#66c7ff',
  onPrimary: '#00344d',
  primaryContainer: '#004c6d',
  onPrimaryContainer: '#c2e8ff',

  // Secondary
  secondary: '#72d8b3',
  onSecondary: '#003826',
  secondaryContainer: '#00513a',
  onSecondaryContainer: '#8ff6cf',

  // Tertiary
  tertiary: '#8dd3ff',
  onTertiary: '#00344d',
  tertiaryContainer: '#004c6d',
  onTertiaryContainer: '#c2e8ff',

  // Error
  error: '#ff9e8c',
  onError: '#5f1200',
  errorContainer: '#7d2600',
  onErrorContainer: '#ffdbcd',

  // Background
  background: '#07141f',
  onBackground: '#e1e8f0',

  // Surface
  surface: '#0b1b29',
  onSurface: '#e1e8f0',
  surfaceVariant: '#18354d',
  onSurfaceVariant: '#b8c5d0',
  surfaceTint: '#66c7ff',
  surfaceContainer: '#102437',
  surfaceContainerLow: '#0c1e2e',
  surfaceContainerHigh: '#142b3f',
  surfaceContainerHighest: '#1e3548',

  // Outline
  outline: 'rgba(102, 199, 255, 0.28)',
  outlineVariant: 'rgba(102, 199, 255, 0.14)',

  // Inverse
  inverseSurface: '#e1e8f0',
  inverseOnSurface: '#1a232c',
  inversePrimary: '#00638f',

  // Shadow & scrim
  shadow: 'rgba(0, 0, 0, 0.42)',
  scrim: 'rgba(0, 0, 0, 0.64)',
};

// Forest theme color scheme
export const forestColorScheme: MD3ColorScheme = {
  // Primary - Forest green
  primary: '#8ed39b',
  onPrimary: '#002d12',
  primaryContainer: '#004420',
  onPrimaryContainer: '#a9f1b5',

  // Secondary
  secondary: '#7fc6b4',
  onSecondary: '#003228',
  secondaryContainer: '#004a3c',
  onSecondaryContainer: '#9ce2d0',

  // Tertiary
  tertiary: '#d4e48e',
  onTertiary: '#373c00',
  tertiaryContainer: '#4e5400',
  onTertiaryContainer: '#f0ffaa',

  // Error
  error: '#ff9f84',
  onError: '#5f1000',
  errorContainer: '#7d2600',
  onErrorContainer: '#ffdbcd',

  // Background
  background: '#0d1510',
  onBackground: '#e1e8e3',

  // Surface
  surface: '#121d16',
  onSurface: '#e1e8e3',
  surfaceVariant: '#24392c',
  onSurfaceVariant: '#b8c5bc',
  surfaceTint: '#8ed39b',
  surfaceContainer: '#1a2a20',
  surfaceContainerLow: '#152319',
  surfaceContainerHigh: '#203528',
  surfaceContainerHighest: '#2a3f30',

  // Outline
  outline: 'rgba(142, 211, 155, 0.28)',
  outlineVariant: 'rgba(142, 211, 155, 0.14)',

  // Inverse
  inverseSurface: '#e1e8e3',
  inverseOnSurface: '#1a211c',
  inversePrimary: '#00522a',

  // Shadow & scrim
  shadow: 'rgba(0, 0, 0, 0.38)',
  scrim: 'rgba(0, 0, 0, 0.64)',
};

// ─────────────────────────────────────────────────────────────────────────────
// MD3 TYPE SCALE
// ─────────────────────────────────────────────────────────────────────────────

export interface MD3TypeScale {
  // Display
  displayLarge: string;
  displayMedium: string;
  displaySmall: string;

  // Headline
  headlineLarge: string;
  headlineMedium: string;
  headlineSmall: string;

  // Title
  titleLarge: string;
  titleMedium: string;
  titleSmall: string;

  // Body
  bodyLarge: string;
  bodyMedium: string;
  bodySmall: string;

  // Label
  labelLarge: string;
  labelMedium: string;
  labelSmall: string;
}

export const typeScale: MD3TypeScale = {
  // Display - Hero headlines
  displayLarge: '57px/64px', // 57px, -0.25px tracking
  displayMedium: '45px/52px', // 45px, 0
  displaySmall: '36px/44px', // 36px, 0

  // Headline - Section headers
  headlineLarge: '32px/40px', // 32px, 0
  headlineMedium: '28px/36px', // 28px, 0
  headlineSmall: '24px/32px', // 24px, 0

  // Title - Component titles
  titleLarge: '22px/28px', // 22px, 0
  titleMedium: '16px/24px', // 16px, 0.15px tracking, weight 500
  titleSmall: '14px/20px', // 14px, 0.1px tracking, weight 500

  // Body - Content text
  bodyLarge: '16px/24px', // 16px, 0.5px tracking
  bodyMedium: '14px/20px', // 14px, 0.25px tracking
  bodySmall: '12px/16px', // 12px, 0.4px tracking

  // Label - Captions, buttons
  labelLarge: '14px/20px', // 14px, 0.1px tracking, weight 500
  labelMedium: '12px/16px', // 12px, 0.5px tracking, weight 500
  labelSmall: '11px/16px', // 11px, 0.5px tracking, weight 500
};

// ─────────────────────────────────────────────────────────────────────────────
// MD3 SHAPE TOKENS
// ─────────────────────────────────────────────────────────────────────────────

export interface MD3ShapeTokens {
  // Corner shapes (border-radius values)
  cornerNone: string;
  cornerExtraSmall: string;
  cornerSmall: string;
  cornerMedium: string;
  cornerLarge: string;
  cornerExtraLarge: string;
  cornerFull: string;

  // Shape families
  shapeExtraSmall: string;
  shapeSmall: string;
  shapeMedium: string;
  shapeLarge: string;
  shapeExtraLarge: string;
}

export const shapeTokens: MD3ShapeTokens = {
  // Corner radii
  cornerNone: '0px',
  cornerExtraSmall: '4px',
  cornerSmall: '8px',
  cornerMedium: '12px',
  cornerLarge: '16px',
  cornerExtraLarge: '28px',
  cornerFull: '9999px',

  // Shape families (top-left top-right bottom-right bottom-left)
  shapeExtraSmall: '4px',
  shapeSmall: '8px',
  shapeMedium: '12px',
  shapeLarge: '16px',
  shapeExtraLarge: '28px',
};

// ─────────────────────────────────────────────────────────────────────────────
// MD3 ELEVATION TOKENS
// ─────────────────────────────────────────────────────────────────────────────

export interface MD3ElevationTokens {
  level0: string;
  level1: string;
  level2: string;
  level3: string;
  level4: string;
  level5: string;
}

export const elevationTokens: MD3ElevationTokens = {
  level0: 'none',
  level1: '0px 1px 3px 1px rgba(0, 0, 0, 0.15), 0px 1px 2px rgba(0, 0, 0, 0.3)',
  level2: '0px 2px 6px 2px rgba(0, 0, 0, 0.15), 0px 1px 2px rgba(0, 0, 0, 0.3)',
  level3: '0px 4px 8px 3px rgba(0, 0, 0, 0.15), 0px 1px 3px rgba(0, 0, 0, 0.3)',
  level4:
    '0px 6px 10px 4px rgba(0, 0, 0, 0.15), 0px 2px 3px rgba(0, 0, 0, 0.3)',
  level5:
    '0px 8px 12px 6px rgba(0, 0, 0, 0.15), 0px 4px 4px rgba(0, 0, 0, 0.3)',
};

// ─────────────────────────────────────────────────────────────────────────────
// MD3 MOTION TOKENS
// ─────────────────────────────────────────────────────────────────────────────

export interface MD3MotionTokens {
  // Duration
  durationShort1: string;
  durationShort2: string;
  durationShort3: string;
  durationShort4: string;
  durationMedium1: string;
  durationMedium2: string;
  durationMedium3: string;
  durationMedium4: string;
  durationLong1: string;
  durationLong2: string;
  durationLong3: string;
  durationLong4: string;

  // Easing
  easingStandard: string;
  easingStandardAccelerate: string;
  easingStandardDecelerate: string;
  easingEmphasized: string;
  easingEmphasizedAccelerate: string;
  easingEmphasizedDecelerate: string;
  easingLinear: string;
}

export const motionTokens: MD3MotionTokens = {
  // Duration (in ms)
  durationShort1: '50ms',
  durationShort2: '100ms',
  durationShort3: '150ms',
  durationShort4: '200ms',
  durationMedium1: '250ms',
  durationMedium2: '300ms',
  durationMedium3: '350ms',
  durationMedium4: '400ms',
  durationLong1: '450ms',
  durationLong2: '500ms',
  durationLong3: '550ms',
  durationLong4: '600ms',

  // Easing
  easingStandard: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
  easingStandardAccelerate: 'cubic-bezier(0.3, 0.0, 1, 1)',
  easingStandardDecelerate: 'cubic-bezier(0.0, 0.0, 0, 1)',
  easingEmphasized: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
  easingEmphasizedAccelerate: 'cubic-bezier(0.3, 0.0, 0.8, 0.15)',
  easingEmphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1.0)',
  easingLinear: 'linear',
};

// ─────────────────────────────────────────────────────────────────────────────
// MD3 STATE LAYERS
// ─────────────────────────────────────────────────────────────────────────────

export interface MD3StateLayers {
  hover: string; // 8% opacity
  focus: string; // 12% opacity
  press: string; // 12% opacity
  dragged: string; // 16% opacity
  disabled: string; // 38% opacity
  disabledContainer: string; // 12% opacity
}

export const stateLayers: MD3StateLayers = {
  hover: '0.08',
  focus: '0.12',
  press: '0.12',
  dragged: '0.16',
  disabled: '0.38',
  disabledContainer: '0.12',
};

// ─────────────────────────────────────────────────────────────────────────────
// CSS GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export function generateMD3CSSVariables(scheme: MD3ColorScheme): string {
  return `
  /* MD3 Color Tokens */
  --md-sys-color-primary: ${scheme.primary};
  --md-sys-color-on-primary: ${scheme.onPrimary};
  --md-sys-color-primary-container: ${scheme.primaryContainer};
  --md-sys-color-on-primary-container: ${scheme.onPrimaryContainer};
  
  --md-sys-color-secondary: ${scheme.secondary};
  --md-sys-color-on-secondary: ${scheme.onSecondary};
  --md-sys-color-secondary-container: ${scheme.secondaryContainer};
  --md-sys-color-on-secondary-container: ${scheme.onSecondaryContainer};
  
  --md-sys-color-tertiary: ${scheme.tertiary};
  --md-sys-color-on-tertiary: ${scheme.onTertiary};
  --md-sys-color-tertiary-container: ${scheme.tertiaryContainer};
  --md-sys-color-on-tertiary-container: ${scheme.onTertiaryContainer};
  
  --md-sys-color-error: ${scheme.error};
  --md-sys-color-on-error: ${scheme.onError};
  --md-sys-color-error-container: ${scheme.errorContainer};
  --md-sys-color-on-error-container: ${scheme.onErrorContainer};
  
  --md-sys-color-background: ${scheme.background};
  --md-sys-color-on-background: ${scheme.onBackground};
  
  --md-sys-color-surface: ${scheme.surface};
  --md-sys-color-on-surface: ${scheme.onSurface};
  --md-sys-color-surface-variant: ${scheme.surfaceVariant};
  --md-sys-color-on-surface-variant: ${scheme.onSurfaceVariant};
  --md-sys-color-surface-tint: ${scheme.surfaceTint};
  --md-sys-color-surface-container: ${scheme.surfaceContainer};
  --md-sys-color-surface-container-low: ${scheme.surfaceContainerLow};
  --md-sys-color-surface-container-high: ${scheme.surfaceContainerHigh};
  --md-sys-color-surface-container-highest: ${scheme.surfaceContainerHighest};
  
  --md-sys-color-outline: ${scheme.outline};
  --md-sys-color-outline-variant: ${scheme.outlineVariant};
  
  --md-sys-color-inverse-surface: ${scheme.inverseSurface};
  --md-sys-color-inverse-on-surface: ${scheme.inverseOnSurface};
  --md-sys-color-inverse-primary: ${scheme.inversePrimary};
  
  --md-sys-color-shadow: ${scheme.shadow};
  --md-sys-color-scrim: ${scheme.scrim};
  
  /* MD3 Shape Tokens */
  --md-sys-shape-corner-none: ${shapeTokens.cornerNone};
  --md-sys-shape-corner-extra-small: ${shapeTokens.cornerExtraSmall};
  --md-sys-shape-corner-small: ${shapeTokens.cornerSmall};
  --md-sys-shape-corner-medium: ${shapeTokens.cornerMedium};
  --md-sys-shape-corner-large: ${shapeTokens.cornerLarge};
  --md-sys-shape-corner-extra-large: ${shapeTokens.cornerExtraLarge};
  --md-sys-shape-corner-full: ${shapeTokens.cornerFull};
  
  /* MD3 Elevation Tokens */
  --md-sys-elevation-level0: ${elevationTokens.level0};
  --md-sys-elevation-level1: ${elevationTokens.level1};
  --md-sys-elevation-level2: ${elevationTokens.level2};
  --md-sys-elevation-level3: ${elevationTokens.level3};
  --md-sys-elevation-level4: ${elevationTokens.level4};
  --md-sys-elevation-level5: ${elevationTokens.level5};
  
  /* MD3 Motion Tokens */
  --md-sys-motion-duration-short1: ${motionTokens.durationShort1};
  --md-sys-motion-duration-short2: ${motionTokens.durationShort2};
  --md-sys-motion-duration-short3: ${motionTokens.durationShort3};
  --md-sys-motion-duration-short4: ${motionTokens.durationShort4};
  --md-sys-motion-duration-medium1: ${motionTokens.durationMedium1};
  --md-sys-motion-duration-medium2: ${motionTokens.durationMedium2};
  --md-sys-motion-duration-medium3: ${motionTokens.durationMedium3};
  --md-sys-motion-duration-medium4: ${motionTokens.durationMedium4};
  --md-sys-motion-easing-standard: ${motionTokens.easingStandard};
  --md-sys-motion-easing-emphasized: ${motionTokens.easingEmphasized};
  
  /* MD3 State Layer Opacities */
  --md-sys-state-hover-opacity: ${stateLayers.hover};
  --md-sys-state-focus-opacity: ${stateLayers.focus};
  --md-sys-state-press-opacity: ${stateLayers.press};
  --md-sys-state-dragged-opacity: ${stateLayers.dragged};
  --md-sys-state-disabled-opacity: ${stateLayers.disabled};
  --md-sys-state-disabled-container-opacity: ${stateLayers.disabledContainer};
  
  /* MD3 Type Scale */
  --md-sys-typescale-display-large: ${typeScale.displayLarge};
  --md-sys-typescale-display-medium: ${typeScale.displayMedium};
  --md-sys-typescale-display-small: ${typeScale.displaySmall};
  --md-sys-typescale-headline-large: ${typeScale.headlineLarge};
  --md-sys-typescale-headline-medium: ${typeScale.headlineMedium};
  --md-sys-typescale-headline-small: ${typeScale.headlineSmall};
  --md-sys-typescale-title-large: ${typeScale.titleLarge};
  --md-sys-typescale-title-medium: ${typeScale.titleMedium};
  --md-sys-typescale-title-small: ${typeScale.titleSmall};
  --md-sys-typescale-body-large: ${typeScale.bodyLarge};
  --md-sys-typescale-body-medium: ${typeScale.bodyMedium};
  --md-sys-typescale-body-small: ${typeScale.bodySmall};
  --md-sys-typescale-label-large: ${typeScale.labelLarge};
  --md-sys-typescale-label-medium: ${typeScale.labelMedium};
  --md-sys-typescale-label-small: ${typeScale.labelSmall};
`;
}

// Legacy compatibility aliases (map old variables to MD3)
export function generateLegacyAliases(): string {
  return `
  /* Legacy Compatibility Aliases */
  --primary: var(--md-sys-color-primary);
  --primary-strong: var(--md-sys-color-primary-container);
  --on-primary: var(--md-sys-color-on-primary);
  --bg: var(--md-sys-color-background);
  --bg-low: var(--md-sys-color-surface-container-low);
  --bg-mid: var(--md-sys-color-surface-container);
  --bg-high: var(--md-sys-color-surface-container-high);
  --bg-top: var(--md-sys-color-surface-container-highest);
  --panel: var(--md-sys-color-surface-variant);
  --panel-strong: var(--md-sys-color-surface-container-high);
  --panel-soft: var(--md-sys-color-surface-container-low);
  --txt: var(--md-sys-color-on-background);
  --muted: var(--md-sys-color-on-surface-variant);
  --muted-2: var(--md-sys-color-outline);
  --green: var(--md-sys-color-secondary);
  --red: var(--md-sys-color-error);
  --blue: var(--md-sys-color-primary);
  --outline: var(--md-sys-color-outline-variant);
  --outline-strong: var(--md-sys-color-outline);
  --shadow: var(--md-sys-elevation-level3);
  --radius-xl: var(--md-sys-shape-corner-extra-large);
  --radius-lg: var(--md-sys-shape-corner-large);
  --radius-md: var(--md-sys-shape-corner-medium);
  --radius-sm: var(--md-sys-shape-corner-small);
  --t: var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
`;
}
