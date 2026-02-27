/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';

/**
 * Represents the derived capabilities of the terminal.
 */
export interface TerminalCapabilities {
  supportsAltBuffer: boolean;
  supportsMouse: boolean;
  supportsReliableBackbufferClear: boolean;
}

/**
 * Represents the detected terminal environment features.
 */
export interface TerminalEnvironment {
  isTmux: boolean;
  isJetBrains: boolean;
  isWindowsTerminal: boolean;
  isVSCode: boolean;
  isITerm2: boolean;
  isGhostty: boolean;
  isAppleTerminal: boolean;
  isWindows10: boolean;
  supports256Colors: boolean;
  supportsTrueColor: boolean;
}

/**
 * Detects the terminal environment based on environment variables and platform information.
 */
export function detectTerminalEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): TerminalEnvironment {
  const term = env['TERM'] || '';
  const termProgram = env['TERM_PROGRAM'] || '';

  // tmux detection: TERM usually starts with "screen" or "tmux", or TMUX env var is present.
  const isTmux = !!env['TMUX'] || term.includes('tmux');

  // JetBrains detection:
  // - IDEA_INITIAL_DIRECTORY: set when launching from IntelliJ-based IDEs.
  // - JETBRAINS_IDE: generic flag.
  // - TERMINAL_EMULATOR: explicitly set to JetBrains-JediTerm by the built-in terminal.
  const isJetBrains =
    !!env['IDEA_INITIAL_DIRECTORY'] ||
    !!env['JETBRAINS_IDE'] ||
    env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm' ||
    termProgram === 'JetBrains-JediTerm';

  // Windows Terminal detection: WT_SESSION is set in Windows Terminal sessions.
  const isWindowsTerminal = !!env['WT_SESSION'];

  // Trusted/Common terminals: TERM_PROGRAM is a reliable way to detect these.
  const isVSCode = termProgram === 'vscode';
  const isITerm2 = termProgram === 'iTerm.app';
  // Ghostty sets TERM_PROGRAM=ghostty or GHOSTTY_BIN_DIR.
  const isGhostty = termProgram === 'ghostty' || !!env['GHOSTTY_BIN_DIR'];
  // Apple Terminal.app is detected as TERM_PROGRAM=Apple_Terminal.
  const isAppleTerminal = termProgram === 'Apple_Terminal';

  // Windows 10 detection: release version 10.0.x where x < 22000 (Win11 is >= 22000).
  let isWindows10 = false;
  if (process.platform === 'win32') {
    const release = os.release();
    // Windows 10 version starts with 10.0.
    // Windows 11 also starts with 10.0 but build >= 22000.
    const buildMatch = release.match(/10\.0\.(\d+)/);
    if (buildMatch) {
      const build = parseInt(buildMatch[1], 10);
      isWindows10 = build < 22000;
    }
  }

  // Color support detection
  let supports256Colors = false;
  let supportsTrueColor = false;

  // Only check color depth if stdout is a TTY
  if (
    process.stdout.isTTY &&
    process.stdout.getColorDepth &&
    typeof process.stdout.getColorDepth === 'function'
  ) {
    const depth = process.stdout.getColorDepth();
    supports256Colors = depth >= 8;
    supportsTrueColor = depth >= 24;
  }

  if (!supportsTrueColor) {
    if (env['COLORTERM'] === 'truecolor' || env['COLORTERM'] === '24bit') {
      supportsTrueColor = true;
      supports256Colors = true;
    }
  }

  if (!supports256Colors) {
    if (term.includes('256color')) {
      supports256Colors = true;
    }
  }

  return {
    isTmux,
    isJetBrains,
    isWindowsTerminal,
    isVSCode,
    isITerm2,
    isGhostty,
    isAppleTerminal,
    isWindows10,
    supports256Colors,
    supportsTrueColor,
  };
}

/**
 * Derives terminal capabilities from the detected environment and applies overrides.
 */
export function getTerminalCapabilities(
  env: TerminalEnvironment,
  processEnv: NodeJS.ProcessEnv = process.env,
  settings: {
    forceAltBuffer?: boolean;
    disableAltBuffer?: boolean;
    disableMouse?: boolean;
    assumeTrustedTerminal?: boolean;
  } = {},
): {
  capabilities: TerminalCapabilities;
  warnings: string[];
  reasons: Partial<Record<keyof TerminalCapabilities, string>>;
} {
  const capabilities: TerminalCapabilities = {
    supportsAltBuffer: true,
    supportsMouse: true,
    supportsReliableBackbufferClear: true,
  };

  const warnings: string[] = [];
  const reasons: Partial<Record<keyof TerminalCapabilities, string>> = {};

  // 1. Initial fallbacks based on environment
  if (env.isJetBrains) {
    capabilities.supportsAltBuffer = false;
    reasons.supportsAltBuffer =
      'JetBrains terminals may have scroll bugs with alternate buffer.';
  }

  if (env.isTmux) {
    // tmux backbuffer clearing is known to be unreliable in some modes
    capabilities.supportsReliableBackbufferClear = false;
    reasons.supportsReliableBackbufferClear =
      'tmux backbuffer clearing is unreliable.';
  }

  if (env.isWindowsTerminal && env.isWindows10) {
    // Windows Terminal on Win10 had some mouse issues in older builds
    capabilities.supportsMouse = false;
    reasons.supportsMouse =
      'Windows Terminal on Windows 10 has unreliable mouse support.';
  }

  // 2. Trusted terminals list (overrides fallbacks unless user explicitly disables)
  const isTrusted =
    env.isGhostty ||
    env.isITerm2 ||
    env.isVSCode ||
    (env.isWindowsTerminal && !env.isWindows10);

  if (isTrusted) {
    capabilities.supportsAltBuffer = true;
    capabilities.supportsMouse = true;
    capabilities.supportsReliableBackbufferClear = true;
    // Clear reasons if it was a trusted terminal
    delete reasons.supportsAltBuffer;
    delete reasons.supportsMouse;
    delete reasons.supportsReliableBackbufferClear;
  }

  // 3. User configuration overrides (Settings > Env Vars)

  // Alternate Buffer Overrides
  const forceAltBuffer =
    settings.forceAltBuffer ||
    processEnv['GEMINI_CLI_FORCE_ALT_BUFFER'] === '1';
  const disableAltBuffer =
    settings.disableAltBuffer ||
    processEnv['GEMINI_CLI_DISABLE_ALT_BUFFER'] === '1';

  if (disableAltBuffer) {
    capabilities.supportsAltBuffer = false;
    reasons.supportsAltBuffer = 'Disabled via configuration.';
  } else if (forceAltBuffer) {
    if (env.isJetBrains && !capabilities.supportsAltBuffer) {
      warnings.push(
        'Warning: Forced alternate buffer in JetBrains terminal. You may experience scroll wheel or momentum bugs.',
      );
    }
    capabilities.supportsAltBuffer = true;
    delete reasons.supportsAltBuffer;
  }

  // Mouse Overrides
  const disableMouse =
    settings.disableMouse || processEnv['GEMINI_CLI_DISABLE_MOUSE'] === '1';
  if (disableMouse) {
    capabilities.supportsMouse = false;
    reasons.supportsMouse = 'Disabled via configuration.';
  }

  // Trusted Terminal Override
  const assumeTrusted =
    settings.assumeTrustedTerminal ||
    processEnv['GEMINI_CLI_ASSUME_TRUSTED_TERMINAL'] === '1';
  if (assumeTrusted) {
    capabilities.supportsAltBuffer = true;
    capabilities.supportsMouse = true;
    capabilities.supportsReliableBackbufferClear = true;
    delete reasons.supportsAltBuffer;
    delete reasons.supportsMouse;
    delete reasons.supportsReliableBackbufferClear;
  }

  return { capabilities, warnings, reasons };
}
