/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VSCodeTheme, VSCodeTokenColor } from './theme-types.js';
import { extractVsixContent } from './vsix-utils.js';

/**
 * Attempt to parse potentially non-strict VS Code theme JSON (comments, trailing commas).
 */
function parseLenientThemeJson(
  raw: string,
  context: { path: string; ext?: string },
): unknown | null {
  const stages: Array<{ label: string; transform: (s: string) => string }> = [
    { label: 'raw', transform: (s) => s },
    {
      label: 'strip_comments',
      transform: (s) =>
        s
          .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
          .replace(/(^|[^:\\])\/\/.*$/gm, '$1'), // line comments (naive)
    },
    {
      label: 'strip_trailing_commas',
      transform: (s) => s.replace(/,\s*(\]|\})/g, '$1'),
    },
  ];
  const working = raw;
  for (const stage of stages) {
    try {
      return JSON.parse(stage.transform(working));
    } catch (e) {
      console.warn(
        `⚠️ theme-parse(${context.ext || 'ext'}:${context.path}) failed at stage '${stage.label}': ${(e as Error).message}`,
      );
    }
  }
  console.error(
    `❌ theme-parse(${context.ext || 'ext'}:${context.path}) all strategies failed; giving up`,
  );
  return null;
}

/**
 * Extracts extension ID from marketplace URL
 */
export function extractExtensionId(
  marketplaceUrl: string,
): { publisher: string; name: string } | null {
  // Extract publisher and name from marketplace URL
  // Example: https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code
  const itemNameMatch = marketplaceUrl.match(/itemName=([^&]+)/);
  if (!itemNameMatch) {
    return null;
  }

  const itemName = itemNameMatch[1];
  const parts = itemName.split('.');
  if (parts.length < 2) {
    return null;
  }

  const name = parts[parts.length - 1];
  const publisher = parts.slice(0, -1).join('.');

  return { publisher, name };
}

/**
 * Downloads a VSIX file from the marketplace
 */
export async function downloadVsix(
  vsixUrl: string,
  _signal: AbortSignal,
): Promise<Buffer> {
  const { fetchWithTimeout } = await import('../utils/fetch.js');
  const response = await fetchWithTimeout(vsixUrl, 30000); // 30 second timeout

  if (!response.ok) {
    throw new Error(
      `Failed to download VSIX: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Extracts theme data from a VSIX file
 */
export async function extractThemeFromVsix(
  vsixBuffer: Buffer,
  _signal: AbortSignal,
  extensionName?: string,
): Promise<VSCodeTheme | null> {
  try {
    console.log(`📦 Extracting VSIX content for ${extensionName}...`);
    // VSIX files are ZIP archives - extract them
    const vsixContent = await extractVsixContent(vsixBuffer);
    console.log(`📁 Extracted ${vsixContent.files.size} files from VSIX`);

    // List extracted files for debugging
    const fileList = Array.from(vsixContent.files.keys());
    console.log(
      `📋 Files in VSIX: ${fileList.slice(0, 10).join(', ')}${fileList.length > 10 ? '...' : ''}`,
    );

    // Parse package.json to find theme contributions
    const packageJson = vsixContent.files.get('extension/package.json');
    if (!packageJson) {
      console.warn('❌ No package.json found in VSIX');
      return null;
    }

    console.log(`📄 Found package.json, parsing theme contributions...`);
    const manifestRaw = parseLenientThemeJson(packageJson, {
      path: 'extension/package.json',
      ext: extensionName,
    });
    type ManifestThemeContribution = {
      id?: string;
      label?: string;
      uiTheme?: string;
      path?: string;
    };
    interface ManifestLike {
      contributes?: {
        themes?: ManifestThemeContribution[];
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
    const manifest: ManifestLike =
      manifestRaw && typeof manifestRaw === 'object'
        ? (manifestRaw as ManifestLike)
        : {};
    const themeContributions = manifest.contributes?.themes;

    if (
      !themeContributions ||
      !Array.isArray(themeContributions) ||
      themeContributions.length === 0
    ) {
      console.warn('❌ No theme contributions found in extension');
      console.log(
        `🔍 Extension contributes: ${Object.keys(manifest.contributes || {}).join(', ')}`,
      );
      return null;
    }

    console.log(`🎨 Found ${themeContributions.length} theme(s) in extension`);

    // For now, take the first theme. TODO: Handle multiple themes with user selection
    const firstTheme = themeContributions[0];
    const themePath = firstTheme.path;

    if (!themePath) {
      console.warn('❌ Theme path not specified in contribution');
      return null;
    }

    console.log(`📂 Looking for theme file: ${themePath}`);

    // Clean up the theme path (remove ./ prefix if present)
    const cleanThemePath = themePath.startsWith('./')
      ? themePath.slice(2)
      : themePath;

    // Read the theme JSON file
    const themeFilePath = `extension/${cleanThemePath}`;
    const themeContent = vsixContent.files.get(themeFilePath);

    if (!themeContent) {
      console.warn(`❌ Theme file not found: ${themeFilePath}`);
      // Try without 'extension/' prefix using cleaned path
      const altThemeContent = vsixContent.files.get(cleanThemePath);
      if (altThemeContent) {
        console.log(`✅ Found theme file at alternate path: ${themePath}`);
        const themeDataRaw = parseLenientThemeJson(altThemeContent, {
          path: cleanThemePath,
          ext: extensionName,
        });
        interface ThemeJsonLike {
          name?: string;
          type?: string;
          colors?: Record<string, string>;
          tokenColors?: unknown;
        }
        const themeData: ThemeJsonLike =
          themeDataRaw && typeof themeDataRaw === 'object'
            ? (themeDataRaw as ThemeJsonLike)
            : {};
        const tokenColorsArr: VSCodeTokenColor[] = Array.isArray(
          themeData.tokenColors,
        )
          ? (themeData.tokenColors as unknown[]).filter(
              (t): t is VSCodeTokenColor => !!t && typeof t === 'object',
            )
          : [];
        const extractedTheme: VSCodeTheme = {
          name:
            firstTheme.label ||
            themeData.name ||
            extensionName ||
            'Extracted Theme',
          type: themeData.type === 'light' ? 'light' : 'dark',
          colors: themeData.colors || {},
          tokenColors: tokenColorsArr,
        };
        console.log(
          `🎨 Successfully extracted theme: ${extractedTheme.name} (${extractedTheme.type})`,
        );
        console.log(
          `🎨 Theme has ${Object.keys(extractedTheme.colors).length} colors and ${extractedTheme.tokenColors.length} token colors`,
        );
        return extractedTheme;
      }
      return null;
    }

    console.log(`📄 Parsing theme JSON...`);
    // Parse theme JSON
    const themeDataRaw = parseLenientThemeJson(themeContent, {
      path: themeFilePath,
      ext: extensionName,
    });
    interface ThemeJsonLike {
      name?: string;
      type?: string;
      colors?: Record<string, string>;
      tokenColors?: unknown;
    }
    const themeData: ThemeJsonLike =
      themeDataRaw && typeof themeDataRaw === 'object'
        ? (themeDataRaw as ThemeJsonLike)
        : {};

    // Convert to our VSCodeTheme format
    const tokenColorsArr: VSCodeTokenColor[] = Array.isArray(
      themeData.tokenColors,
    )
      ? (themeData.tokenColors as unknown[]).filter(
          (t): t is VSCodeTokenColor => !!t && typeof t === 'object',
        )
      : [];
    const extractedTheme: VSCodeTheme = {
      name:
        firstTheme.label ||
        themeData.name ||
        extensionName ||
        'Extracted Theme',
      type: themeData.type === 'light' ? 'light' : 'dark',
      colors: themeData.colors || {},
      tokenColors: tokenColorsArr,
    };

    console.log(
      `🎨 Successfully extracted theme: ${extractedTheme.name} (${extractedTheme.type})`,
    );
    console.log(
      `🎨 Theme has ${Object.keys(extractedTheme.colors).length} colors and ${extractedTheme.tokenColors.length} token colors`,
    );

    return extractedTheme;
  } catch (error) {
    console.error('❌ Failed to extract theme from VSIX:', error);
    return null;
  }
}
