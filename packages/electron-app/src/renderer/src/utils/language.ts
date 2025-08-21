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

export function getLanguageMap(): Record<string, string> {
  try {
    const storedMap = localStorage.getItem('extensionToLanguageMap');
    if (storedMap) {
      return { ...defaultExtensionToLanguageMap, ...JSON.parse(storedMap) };
    }
  } catch (error) {
    console.error('Error reading language map from local storage:', error);
  }
  return defaultExtensionToLanguageMap;
}

export function saveLanguageMap(map: Record<string, string>) {
  try {
    localStorage.setItem('extensionToLanguageMap', JSON.stringify(map));
  } catch (error) {
    console.error('Error saving language map to local storage:', error);
  }
}

export function getLanguageForFilePath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  const languageMap = getLanguageMap();
  return languageMap[extension] || 'plaintext';
}
