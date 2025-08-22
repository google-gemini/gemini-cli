/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolResult,
  ToolCallConfirmationDetails,
  ToolLocation,
  ToolInvocation,
} from './tools.js';
import { BaseDeclarativeTool, Kind } from './tools.js';

import { Type } from '@google/genai';
import { detectIde, DetectedIde, getIdeInfo } from '../ide/detect-ide.js';
import { getIdeInstaller } from '../ide/ide-installer.js';

export type InstallVSCodeCompanionParams = Record<string, never>;

/**
 * Tool for installing the Gemini CLI VS Code companion extension.
 */
export class InstallVSCodeCompanionTool extends BaseDeclarativeTool<
  InstallVSCodeCompanionParams,
  ToolResult
> {
  static readonly Name = 'install_vscode_companion';

  constructor() {
    super(
      InstallVSCodeCompanionTool.Name,
      'Install VS Code Companion',
      'Installs or updates the Gemini CLI VS Code companion extension for tighter IDE integration.',
      Kind.Other,
      { type: Type.OBJECT, properties: {} },
    );
  }

  protected override validateToolParamValues(
    _params: InstallVSCodeCompanionParams,
  ): string | null {
    return null;
  }

  protected createInvocation(
    params: InstallVSCodeCompanionParams,
  ): ToolInvocation<InstallVSCodeCompanionParams, ToolResult> {
    return new InstallVSCodeCompanionInvocation(params);
  }
}

class InstallVSCodeCompanionInvocation
  implements ToolInvocation<InstallVSCodeCompanionParams, ToolResult>
{
  constructor(readonly params: InstallVSCodeCompanionParams) {}

  getDescription(): string {
    return `Install or update the Gemini CLI IDE companion extension`;
  }

  async shouldConfirmExecute(): Promise<ToolCallConfirmationDetails | false> {
    const ide = detectIde();
    const ideName = ide ? getIdeInfo(ide).displayName : 'VS Code family';
    return {
      type: 'info',
      title: 'Install IDE Companion',
      prompt: `This will install the Gemini CLI companion extension for ${ideName}. Do you want to continue?`,
      onConfirm: async () => {},
    };
  }

  toolLocations(): ToolLocation[] {
    return [];
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
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
