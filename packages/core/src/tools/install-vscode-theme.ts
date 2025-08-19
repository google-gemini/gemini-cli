/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ToolResult, ToolCallConfirmationDetails, ToolLocation } from './tools.js';
import { BaseTool, Icon } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import {  Type } from '@google/genai';

import type { InstallVSCodeThemeToolParams, VSCodeTheme } from './theme-types.js';
import { convertVSCodeThemeToCustomTheme } from './theme-converter.js';
import { createDefaultTheme } from './theme-generator.js';
import { extractExtensionId, downloadVsix, extractThemeFromVsix } from './theme-extractor.js';
import { saveThemeToFile } from './theme-storage.js';
import { createSimpleColorPreview } from './theme-display.js';

/**
 * Tool for installing VS Code themes from marketplace URLs
 */
export class InstallVSCodeThemeTool extends BaseTool<
  InstallVSCodeThemeToolParams,
  ToolResult
> {
  static readonly Name: string = 'install_vscode_theme';

  constructor(private readonly config: Config) {
    super(
      InstallVSCodeThemeTool.Name,
      'Install VS Code Theme',
      'Downloads and installs VS Code themes from marketplace URLs, extracting color schemes and creating custom Gemini CLI themes.',
      Icon.Globe,
      {
        properties: {
          marketplaceUrl: {
            description: 'The VS Code marketplace URL to install the theme from (e.g., https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code)',
            type: Type.STRING,
          },
        },
        required: ['marketplaceUrl'],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: InstallVSCodeThemeToolParams): string | null {
    if (!params.marketplaceUrl) {
      return 'Marketplace URL is required';
    }

    if (!params.marketplaceUrl.includes('marketplace.visualstudio.com')) {
      return 'URL must be a valid VS Code marketplace URL';
    }

    return null;
  }

  getDescription(params: InstallVSCodeThemeToolParams): string {
    return `Install VS Code theme from marketplace URL: ${params.marketplaceUrl}`;
  }

  async shouldConfirmExecute(
    params: InstallVSCodeThemeToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    return {
      type: 'info',
      title: 'Install VS Code Theme',
      prompt: `This will install a VS Code theme from the marketplace URL: ${params.marketplaceUrl}

The theme will be downloaded, converted to Gemini CLI format, and added to your custom themes.

Do you want to proceed?`,
      onConfirm: async () => {
        // This will be handled by the core
      },
    };
  }

  toolLocations(params: InstallVSCodeThemeToolParams): ToolLocation[] {
    return [
      { path: '~/.gemini/themes' }
    ];
  }

  async execute(
    params: InstallVSCodeThemeToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    try {
      // Step 1: Extract extension ID from marketplace URL
      const extensionId = extractExtensionId(params.marketplaceUrl);
      if (!extensionId) {
        return {
          llmContent: 'Error: Could not extract extension ID from marketplace URL',
          returnDisplay: '❌ **Error**: Could not extract extension ID from the marketplace URL. Please ensure the URL is valid.',
        };
      }

      // Step 2: Download the .vsix file
      const vsixUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${extensionId.publisher}/vsextensions/${extensionId.name}/latest/vspackage`;
      const vsixBuffer = await downloadVsix(vsixUrl, signal);

      // Step 3: Try to extract theme JSON from .vsix (Fallback Hierarchy)
      let themeData: VSCodeTheme | null = null;
      let extractionMethod = '';
      
      // Try 1: Extract from VSIX file
      console.log(`Attempting to extract theme from VSIX for ${extensionId.name}...`);
      themeData = await extractThemeFromVsix(vsixBuffer, signal, extensionId.name);
      if (themeData) {
        extractionMethod = 'VSIX Extraction';
        console.log(`✅ Successfully extracted theme from VSIX: ${themeData.name}`);
      } else {
        console.log(`⚠️ VSIX extraction failed, using default theme...`);
        // Try 2: Use default theme (no AI generation)
        themeData = createDefaultTheme(extensionId.name);
        extractionMethod = 'Default Theme';
        console.log(`📦 Using default theme: ${themeData.name}`);
      }

      // Step 4: Convert VS Code theme to Gemini CLI theme
      if (!themeData) {
        return {
          llmContent: 'Error: Could not extract theme data',
          returnDisplay: '❌ **Error**: Could not extract theme data. VSIX extraction failed and no fallback theme could be created.',
        };
      }
      
      const customTheme = convertVSCodeThemeToCustomTheme(themeData);

      // Step 5: Save theme to dedicated theme file
      const _themeFilePath = await saveThemeToFile(customTheme);
      
      // Create simplified color palette preview
      const colorPalettePreview = createSimpleColorPreview(customTheme);

      return {
        llmContent: `Successfully installed VS Code theme "${customTheme.name}" from ${params.marketplaceUrl}`,
        returnDisplay: `✅ Theme Installed Successfully!

🎨 Theme Name: ${customTheme.name}
📦 Source: ${params.marketplaceUrl}
🔧 Method: ${extractionMethod}

${colorPalettePreview}

The theme has been saved to your dedicated theme files and is now available for selection.

To use the theme:
1. Type /theme to open the theme selection dialog
2. Look for "${customTheme.name}" in the custom themes section
3. Select it to apply the theme

The theme will be automatically saved to your theme directory and will persist across sessions.`,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error installing VS Code theme: ${errorMessage}`,
        returnDisplay: `❌ Error Installing Theme

${errorMessage}

Please check that:
- The URL is a valid VS Code marketplace theme extension
- You have internet connectivity
- The extension contains a valid theme`,
      };
    }
  }
} 
