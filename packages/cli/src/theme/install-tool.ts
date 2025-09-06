/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolLocation,
  ToolInvocation,
} from '@google/gemini-cli-core';
import { 
  BaseDeclarativeTool, 
  BaseToolInvocation, 
  Kind,
  getErrorMessage 
} from '@google/gemini-cli-core';

import type {
  InstallVSCodeThemeToolParams,
  VSCodeTheme,
} from './types.js';
import { convertVSCodeThemeToCustomTheme } from './converter.js';
import { createDefaultTheme, generateThemeWithAI } from './generator.js';
import {
  extractExtensionId,
  downloadVsix,
  extractThemeFromVsix,
} from './extractor.js';
import { saveThemeToFile } from './storage.js';
import { createSimpleColorPreview } from './display.js';

/**
 * Tool for installing VS Code themes from marketplace URLs
 */
class InstallVSCodeThemeToolInvocation extends BaseToolInvocation<
  InstallVSCodeThemeToolParams,
  ToolResult
> {
  constructor(
    params: InstallVSCodeThemeToolParams,
    private readonly config: Config | undefined,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Install VS Code theme from marketplace URL: ${this.params.marketplaceUrl}`;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return {
      type: 'info',
      title: 'Install VS Code Theme',
      prompt: `This will install a VS Code theme from the marketplace URL: ${this.params.marketplaceUrl}\n\nThe theme will be downloaded, converted to Gemini CLI format, and added to your custom themes.\n\nDo you want to proceed?`,
      onConfirm: async () => {},
    };
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: '~/.gemini/themes' }];
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const params = this.params;
    try {
      const extensionId = extractExtensionId(params.marketplaceUrl);
      if (!extensionId) {
        return {
          llmContent:
            'Error: Could not extract extension ID from marketplace URL',
          returnDisplay:
            '❌ **Error**: Could not extract extension ID from the marketplace URL. Please ensure the URL is valid.',
        };
      }

      const vsixUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${extensionId.publisher}/vsextensions/${extensionId.name}/latest/vspackage`;
      const vsixBuffer = await downloadVsix(vsixUrl, signal);

      let themeData: VSCodeTheme | null = null;
      let extractionMethod = '';

      console.log(
        `Attempting to extract theme from VSIX for ${extensionId.name}...`,
      );
      themeData = await extractThemeFromVsix(
        vsixBuffer,
        signal,
        extensionId.name,
      );
      if (themeData) {
        extractionMethod = 'VSIX Extraction';
        console.log(
          `✅ Successfully extracted theme from VSIX: ${themeData.name}`,
        );
      } else {
        console.log(`⚠️ VSIX extraction failed. Attempting AI generation...`);
        const defaultTemplate = createDefaultTheme(extensionId.name);
        let aiTheme: VSCodeTheme | null = null;
        try {
          aiTheme = await generateThemeWithAI(
            extensionId.name,
            signal,
            this.config,
          );
        } catch (e) {
          console.warn(
            '⚠️ AI generation threw error, falling back to default theme.',
            e,
          );
        }
        if (aiTheme) {
          // Heuristic: if aiTheme matches default template exactly, we assume fallback not true AI.
          const isDefault =
            JSON.stringify(aiTheme.colors) ===
              JSON.stringify(defaultTemplate.colors) &&
            JSON.stringify(aiTheme.tokenColors) ===
              JSON.stringify(defaultTemplate.tokenColors);
          themeData = aiTheme;
          extractionMethod = isDefault
            ? 'Default Theme Fallback'
            : 'AI Generated';
          console.log(`📦 Using ${extractionMethod}: ${themeData.name}`);
        } else {
          themeData = defaultTemplate;
          extractionMethod = 'Default Theme Fallback (AI unavailable)';
          console.log(`📦 Using default theme fallback: ${themeData.name}`);
        }
      }

      if (!themeData) {
        return {
          llmContent: 'Error: Could not extract theme data',
          returnDisplay:
            '❌ **Error**: Could not extract theme data. VSIX extraction failed and no fallback theme could be created.',
        };
      }

      const customTheme = convertVSCodeThemeToCustomTheme(themeData);
      // Persist theme
      await saveThemeToFile(customTheme);
      const colorPalettePreview = createSimpleColorPreview(customTheme);

      return {
        llmContent: `Successfully installed VS Code theme "${customTheme.name}" from ${params.marketplaceUrl}`,
        returnDisplay: `✅ Theme Installed Successfully!\n\n🎨 Theme Name: ${customTheme.name}\n📦 Source: ${params.marketplaceUrl}\n🔧 Method: ${extractionMethod}\n\n${colorPalettePreview}\n\nThe theme has been saved to your dedicated theme files and is now available for selection.\n\nTo use the theme:\n1. Type /theme to open the theme selection dialog\n2. Look for "${customTheme.name}" in the custom themes section\n3. Select it to apply the theme\n\nThe theme will be automatically saved to your theme directory and will persist across sessions.`,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error installing VS Code theme: ${errorMessage}`,
        returnDisplay: `❌ Error Installing Theme\n\n${errorMessage}\n\nPlease check that:\n- The URL is a valid VS Code marketplace theme extension\n- You have internet connectivity\n- The extension contains a valid theme`,
      };
    }
  }
}

export class InstallVSCodeThemeTool extends BaseDeclarativeTool<
  InstallVSCodeThemeToolParams,
  ToolResult
> {
  static readonly Name: string = 'install_vscode_theme';

  constructor(private readonly config: Config) {
    super(
      InstallVSCodeThemeTool.Name,
      'Install VS Code Theme',
      'Downloads and installs VS Code themes from marketplace URLs, extracting color schemes and creating custom Gemini CLI themes.',
      Kind.Other,
      {
        properties: {
          marketplaceUrl: {
            description:
              'The VS Code marketplace URL to install the theme from (e.g., https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code)',
            type: 'string',
          },
        },
        required: ['marketplaceUrl'],
        type: 'object',
      },
    );
  }

  override validateToolParams(
    params: InstallVSCodeThemeToolParams,
  ): string | null {
    if (!params.marketplaceUrl) return 'Marketplace URL is required';
    if (!params.marketplaceUrl.includes('marketplace.visualstudio.com'))
      return 'URL must be a valid VS Code marketplace URL';
    return null;
  }

  protected createInvocation(
    params: InstallVSCodeThemeToolParams,
  ): ToolInvocation<InstallVSCodeThemeToolParams, ToolResult> {
    return new InstallVSCodeThemeToolInvocation(params, this.config);
  }
}
