

import { promises as fs } from 'fs';
import * as path from 'path';
import { runShellCommand } from './utils';

// A map to translate git status codes into human-readable glyphs
const GIT_STATUS_GLYPHS: { [key: string]: string } = {
  'M': 'Ⓜ️', // Modified
  'A': '✅', // Added
  'D': '❌', // Deleted
  'R': '🔄', // Renamed
  'C': '📋', // Copied
  'U': '❓', // Unmerged
  '??': '✨', // Untracked
};

async function getGitStatus(directory: string): Promise<Map<string, string>> {
  const gitStatusMap = new Map<string, string>();
  try {
    // We run git status on the directory itself.
    const gitStatusResult = await runShellCommand('git', ['status', '--porcelain', directory]);
    if (!gitStatusResult.stderr) {
      gitStatusResult.stdout.split('\n').forEach(line => {
        if (line.trim()) {
          const status = line.substring(0, 2).trim();
          const filePath = line.substring(3).trim();
          // We get the base name to match it with the file names from readdir
          const baseName = path.basename(filePath);
          gitStatusMap.set(baseName, GIT_STATUS_GLYPHS[status] || status);
        }
      });
    }
  } catch (error) {
    // If it's not a git repository, we simply continue without git status.
  }
  return gitStatusMap;
}

async function listDirectory(targetDir: string, showHidden: boolean): Promise<string> {
  let output = '';
  const gitStatusMap = await getGitStatus(targetDir);
  const files = await fs.readdir(targetDir);
  const fileDetails = [];

  for (const file of files) {
    if (!showHidden && file.startsWith('.')) {
      continue;
    }
    const filePath = path.join(targetDir, file);
    try {
        const stats = await fs.stat(filePath);
        const isDir = stats.isDirectory();
        const gitStatus = gitStatusMap.get(file) || '  '; // Default to empty space if no status

        fileDetails.push({
            name: file,
            isDir,
            size: stats.size,
            permissions: (stats.mode & 0o777).toString(8), // Get rwx permissions
            gitStatus,
        });
    } catch (e) {
        // This can happen for broken symlinks, for example.
        fileDetails.push({
            name: `${file} (unreadable)`,
            isDir: false,
            size: 0,
            permissions: '---',
            gitStatus: ' ',
        });
    }
  }

  // We sort the files alphabetically for consistent and readable output.
  fileDetails.sort((a, b) => a.name.localeCompare(b.name));

  output = 'Git | Permissions | Size\t | Type\t\t | Name\n';
  output += '----|-------------|--------|----------------|----------------\n';

  fileDetails.forEach(f => {
    const type = f.isDir ? '📁 Directory' : '📄 File';
    const size = f.isDir ? '' : `${f.size}B`.padEnd(6);
    output += `${f.gitStatus.padEnd(2)} | ${f.permissions.padEnd(11)} | ${size.padEnd(6)} | ${type.padEnd(14)} | ${f.name}\n`;
  });

  return output;
}

/**
 * @description A more powerful ls tool that provides detailed file information and git status.
 * @param {string[]} args - Supports a directory path and '-a' to show hidden files.
 * @returns {Promise<string>} A detailed listing of the directory contents.
 */
export async function lsTool(args: string[]): Promise<string> {
  let targetDir = '.';
  let showHidden = false;

  // Separate arguments into paths and flags.
  const paths = args.filter(arg => !arg.startsWith('-'));
  const flags = args.filter(arg => arg.startsWith('-'));

  if (paths.length > 0) {
    targetDir = paths[0];
  }

  if (flags.includes('-a')) {
    showHidden = true;
  }

  // For now, if we have unhandled flags or multiple paths, we fall back to the native 'ls'.
  // This provides a safe fallback and retains the original 'ls' functionality.
  const unhandledFlags = flags.filter(f => f !== '-a');
  if (unhandledFlags.length > 0 || paths.length > 1) {
      const result = await runShellCommand('ls', args);
      if (result.stderr) {
          return Promise.reject(`Error running ls: ${result.stderr}`);
      }
      return result.stdout;
  }

  try {
    return await listDirectory(targetDir, showHidden);
  } catch (error: any) {
    // Provide more specific and helpful error messages.
    if (error.code === 'ENOENT') {
        return Promise.reject(`Error: Directory not found: ${targetDir}`);
    }
    if (error.code === 'ENOTDIR') {
        return Promise.reject(`Error: Not a directory: ${targetDir}`);
    }
    return Promise.reject(`Error in enhanced ls: ${error.message}`);
  }
}
