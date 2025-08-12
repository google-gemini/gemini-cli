/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolResult, ToolCallConfirmationDetails, ToolLocation } from './tools.js';
import { BaseTool, Icon } from './tools.js';
import type { Config } from '../config/config.js';
import { Type } from '@google/genai';
import { detectIde, getIdeDisplayName, DetectedIde } from '../ide/detect-ide.js';
import { getIdeInstaller } from '../ide/ide-installer.js';

export type InstallVSCodeCompanionParams = Record<string, never>;

/**
 * Tool for installing the Gemini CLI VS Code companion extension.
 */
export class InstallVSCodeCompanionTool extends BaseTool<
  InstallVSCodeCompanionParams,
  ToolResult
> {
  static readonly Name = 'install_vscode_companion';

  constructor(private readonly config: Config) {
    super(
      InstallVSCodeCompanionTool.Name,
      'Install VS Code Companion',
  'Installs or updates the Gemini CLI VS Code companion extension for tighter IDE integration.',
  Icon.Hammer,
  { type: Type.OBJECT, properties: {} },
    );
  }

  validateToolParams(_params: InstallVSCodeCompanionParams): string | null {
    return null;
  }

  getDescription(_params: InstallVSCodeCompanionParams): string {
    return `Install or update the Gemini CLI IDE companion extension`;
    }

  async shouldConfirmExecute(
    _params: InstallVSCodeCompanionParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    const ide = detectIde();
    const ideName = ide ? getIdeDisplayName(ide) : 'VS Code family';
    return {
      type: 'info',
      title: 'Install IDE Companion',
      prompt: `This will install the Gemini CLI companion extension for ${ideName}. Do you want to continue?`,
      onConfirm: async () => {},
    };
  }

  toolLocations(_params: InstallVSCodeCompanionParams): ToolLocation[] {
    return [];
  }

  async execute(
    _params: InstallVSCodeCompanionParams,
  ): Promise<ToolResult> {
    const ide = detectIde();
  const target = ide ?? DetectedIde.VSCode;
    const installer = getIdeInstaller(target);
    if (!installer) {
      return {
        llmContent: 'No compatible IDE detected for installation.',
        returnDisplay: '❌ No compatible IDE detected for installation.',
      };
    }

    const result = await installer.install();
    if (result.success) {
      return {
        llmContent: result.message,
        returnDisplay: `✅ ${result.message}`,
      };
    }
    return {
      llmContent: result.message,
      returnDisplay: `❌ ${result.message}`,
    };
  }
}
