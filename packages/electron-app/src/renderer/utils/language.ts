/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const defaultExtensionToLanguageMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  py: 'python',
  java: 'java',
  go: 'go',
  cpp: 'cpp',
  cxx: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  rs: 'rust',
  sql: 'sql',
  dockerfile: 'dockerfile',
};

export async function getLanguageMap(): Promise<Record<string, string>> {
  try {
    const storedMap = await window.electron.languageMap.get();
    if (storedMap) {
      return { ...defaultExtensionToLanguageMap, ...storedMap };
    }
  } catch (error) {
    console.error('Error reading language map from main process:', error);
  }
  return defaultExtensionToLanguageMap;
}

export function saveLanguageMap(map: Record<string, string>) {
  try {
    window.electron.languageMap.set(map);
  } catch (error) {
    console.error('Error saving language map to main process:', error);
  }
}

export async function getLanguageForFilePath(
  filePath: string,
): Promise<string> {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  const languageMap = await getLanguageMap();
  return languageMap[extension] || 'plaintext';
}
