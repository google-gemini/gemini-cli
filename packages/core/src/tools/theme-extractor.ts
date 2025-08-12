/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VSCodeTheme } from './theme-types.js';
import { extractVsixContent } from './vsix-utils.js';

/**
 * Extracts extension ID from marketplace URL
 */
export function extractExtensionId(marketplaceUrl: string): { publisher: string; name: string } | null {
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
export async function downloadVsix(vsixUrl: string, _signal: AbortSignal): Promise<Buffer> {
  const { fetchWithTimeout } = await import('../utils/fetch.js');
  const response = await fetchWithTimeout(vsixUrl, 30000); // 30 second timeout

  if (!response.ok) {
    throw new Error(`Failed to download VSIX: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Extracts theme data from a VSIX file
 */
export async function extractThemeFromVsix(vsixBuffer: Buffer, _signal: AbortSignal, extensionName?: string): Promise<VSCodeTheme | null> {
  try {
    // VSIX files are ZIP archives - extract them
    const vsixContent = await extractVsixContent(vsixBuffer);
    
    // Parse package.json to find theme contributions
    const packageJson = vsixContent.files.get('extension/package.json');
    if (!packageJson) {
      console.warn('No package.json found in VSIX');
      return null;
    }
    
    const manifest = JSON.parse(packageJson);
    const themeContributions = manifest.contributes?.themes;
    
    if (!themeContributions || !Array.isArray(themeContributions) || themeContributions.length === 0) {
      console.warn('No theme contributions found in extension');
      return null;
    }
    
    // For now, take the first theme. TODO: Handle multiple themes with user selection
    const firstTheme = themeContributions[0];
    const themePath = firstTheme.path;
    
    if (!themePath) {
      console.warn('Theme path not specified in contribution');
      return null;
    }
    
    // Read the theme JSON file
    const themeFilePath = `extension/${themePath}`;
    const themeContent = vsixContent.files.get(themeFilePath);
    
    if (!themeContent) {
      console.warn(`Theme file not found: ${themeFilePath}`);
      return null;
    }
    
    // Parse theme JSON
    const themeData = JSON.parse(themeContent);
    
    // Convert to our VSCodeTheme format
    const extractedTheme: VSCodeTheme = {
      name: firstTheme.label || themeData.name || extensionName || 'Extracted Theme',
      type: themeData.type === 'light' ? 'light' : 'dark',
      colors: themeData.colors || {},
      tokenColors: themeData.tokenColors || []
    };
    
    return extractedTheme;
  } catch (error) {
    console.error('Failed to extract theme from VSIX:', error);
    return null;
  }
} 