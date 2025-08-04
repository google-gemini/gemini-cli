/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@dbx-cli/core';
import {
  CommandContext,
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { SettingScope, loadEnvironment } from '../../config/settings.js';

// Constants
const MIN_PAT_LENGTH = 10;
const MASKED_CHAR_COUNT = 6;

/**
 * Masks a Personal Access Token (PAT) for secure display.
 * Shows first 4 and last 3 characters, masking the middle.
 */
function maskPat(pat: string): string {
  if (!pat || pat.length < MIN_PAT_LENGTH) {
    return pat;
  }
  const start = pat.substring(0, 4);
  const end = pat.substring(pat.length - 3);
  return `${start}${'*'.repeat(MASKED_CHAR_COUNT)}${end}`;
}

/**
 * Validates that a URL is properly formatted and uses HTTP/HTTPS protocol.
 */
function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Validates that a PAT meets minimum length requirements.
 */
function validatePat(pat: string): boolean {
  return !!pat && pat.length >= MIN_PAT_LENGTH;
}

/**
 * Parses command-line style arguments into key-value pairs.
 * Supports both --key=value and --key value formats, with optional quotes.
 */
function parseArguments(args: string): Record<string, string> {
  const params: Record<string, string> = {};
  const parts = tokenizeArguments(args);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.startsWith('--')) {
      const { key, value, consumed } = extractKeyValue(parts, i);
      if (key) {
        params[key] = value;
        i += consumed - 1; // Adjust index for consumed parts
      }
    }
  }

  return params;
}

/**
 * Tokenizes an argument string, preserving quoted strings as single tokens.
 */
function tokenizeArguments(args: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (const char of args) {
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current.trim()) {
        parts.push(current.trim());
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Extracts a key-value pair from tokenized arguments.
 * Returns the key, value, and number of tokens consumed.
 */
function extractKeyValue(
  parts: string[],
  index: number,
): { key: string; value: string; consumed: number } {
  const part = parts[index];
  const keyValue = part.substring(2); // Remove --
  const eqIndex = keyValue.indexOf('=');

  if (eqIndex > 0) {
    // --key=value format
    const key = keyValue.substring(0, eqIndex);
    const value = removeQuotes(keyValue.substring(eqIndex + 1));
    return { key, value, consumed: 1 };
  } else {
    // --key value format
    const key = keyValue;
    if (index + 1 < parts.length && !parts[index + 1].startsWith('--')) {
      const value = removeQuotes(parts[index + 1]);
      return { key, value, consumed: 2 };
    }
    return { key: '', value: '', consumed: 1 };
  }
}

/**
 * Removes surrounding quotes from a string if present.
 */
function removeQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.substring(1, value.length - 1);
  }
  return value;
}

// Subcommand handlers
const subcommandHandlers: Record<
  string,
  (context: CommandContext, args: string) => SlashCommandActionReturn
> = {
  show: handleShow,
  set: handleSet,
  clear: handleClear,
  enable: handleEnable,
};

export const databricksCommand: SlashCommand = {
  name: 'databricks',
  altNames: ['dbx', 'db'],
  description: 'Configure Databricks connection settings',
  kind: CommandKind.BUILT_IN,

  action: async (context, args): Promise<SlashCommandActionReturn> => {
    // Load environment to ensure we have latest values
    loadEnvironment();

    const subcommand = args.split(/\s+/)[0] || '';
    const remainingArgs = args.substring(subcommand.length).trim();

    const handler = subcommandHandlers[subcommand];
    if (handler) {
      return handler(context, remainingArgs);
    }

    if (subcommand === '') {
      return showHelp();
    }

    return {
      type: 'message',
      messageType: 'error',
      content: `Unknown subcommand: ${subcommand}`,
    };
  },
};

function handleShow(
  _context: CommandContext,
  _args: string,
): SlashCommandActionReturn {
  const url = process.env.DATABRICKS_URL;
  const pat = process.env.DBX_PAT;

  if (!url && !pat) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'Databricks is not configured.\nUse `/databricks set --url=<URL> --pat=<PAT>` to configure.',
    };
  }

  const urlDisplay = url || 'not set';
  const patDisplay = pat ? maskPat(pat) : 'not set';

  return {
    type: 'message',
    messageType: 'info',
    content: `Current Databricks configuration:\nURL: ${urlDisplay}\nPAT: ${patDisplay}`,
  };
}

function handleSet(
  context: CommandContext,
  args: string,
): SlashCommandActionReturn {
  const params = parseArguments(args);

  if (!params.url && !params.pat) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'At least one parameter (--url or --pat) is required.',
    };
  }

  // Validate URL if provided
  if (params.url && !validateUrl(params.url)) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Invalid URL format. Please provide a valid HTTP/HTTPS URL.',
    };
  }

  // Validate PAT if provided
  if (params.pat && !validatePat(params.pat)) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Invalid PAT format. PAT must be at least ${MIN_PAT_LENGTH} characters long.`,
    };
  }

  // Save to settings
  if (params.url) {
    context.services.settings.setValue(
      SettingScope.User,
      'databricksUrl',
      params.url,
    );
    process.env.DATABRICKS_URL = params.url;
  }

  if (params.pat) {
    context.services.settings.setValue(
      SettingScope.User,
      'databricksPat',
      params.pat,
    );
    process.env.DBX_PAT = params.pat;
  }

  // If both URL and PAT are now configured, automatically enable Databricks
  const hasUrl = process.env.DATABRICKS_URL || params.url;
  const hasPat = process.env.DBX_PAT || params.pat;

  if (hasUrl && hasPat) {
    // Automatically enable Databricks authentication
    context.services.settings.setValue(
      SettingScope.User,
      'selectedAuthType',
      AuthType.USE_DATABRICKS,
    );

    return {
      type: 'message',
      messageType: 'info',
      content:
        'Databricks configuration updated and authentication enabled successfully.',
    };
  }

  return {
    type: 'message',
    messageType: 'info',
    content: 'Databricks configuration updated successfully.',
  };
}

function handleClear(
  context: CommandContext,
  _args: string,
): SlashCommandActionReturn {
  // Clear from settings
  context.services.settings.setValue(
    SettingScope.User,
    'databricksUrl',
    undefined,
  );
  context.services.settings.setValue(
    SettingScope.User,
    'databricksPat',
    undefined,
  );

  // Clear from environment
  delete process.env.DATABRICKS_URL;
  delete process.env.DBX_PAT;

  return {
    type: 'message',
    messageType: 'info',
    content: 'Databricks configuration cleared.',
  };
}

function handleEnable(
  context: CommandContext,
  _args: string,
): SlashCommandActionReturn {
  // Reload environment to ensure we have latest values
  loadEnvironment();

  // Also check settings directly in case they haven't been loaded to env yet
  const settings = context.services.settings.merged;
  const urlFromSettings = settings.databricksUrl;
  const patFromSettings = settings.databricksPat;

  // Ensure environment variables are set from settings if needed
  if (urlFromSettings && !process.env.DATABRICKS_URL) {
    process.env.DATABRICKS_URL = urlFromSettings;
  }
  if (patFromSettings && !process.env.DBX_PAT) {
    process.env.DBX_PAT = patFromSettings;
  }

  // Check if configuration exists (either in env or settings)
  if (!process.env.DATABRICKS_URL || !process.env.DBX_PAT) {
    return {
      type: 'message',
      messageType: 'error',
      content:
        'Cannot enable Databricks: configuration is incomplete.\nUse `/databricks set --url=<URL> --pat=<PAT>` first.',
    };
  }

  // Set auth type to Databricks
  context.services.settings.setValue(
    SettingScope.User,
    'selectedAuthType',
    AuthType.USE_DATABRICKS,
  );

  return {
    type: 'message',
    messageType: 'info',
    content: 'Databricks authentication enabled.',
  };
}

function showHelp(): SlashCommandActionReturn {
  return {
    type: 'message',
    messageType: 'info',
    content:
      'Available subcommands:\n• show - Display current configuration\n• set - Set configuration values\n• clear - Clear configuration\n• enable - Enable Databricks authentication',
  };
}
