// ts-tools/project-summary.ts

import { runShellCommand } from './utils';
import { readFile } from 'fs/promises';

/**
 * @description Provides a high-level summary of the project.
 * @param {string[]} args - The arguments for the project-summary tool.
 * @returns {Promise<string>} A summary of the project.
 */
export async function projectSummary(args: string[]): Promise<string> {
  try {
    const fileListResult = await runShellCommand('find . -type f', []);
    if (fileListResult.stderr) {
      return Promise.reject(`Error listing files: ${fileListResult.stderr}`);
    }
    const files = fileListResult.stdout.trim().split('\n');

    const languageCount: { [key: string]: number } = {};
    files.forEach(file => {
      const ext = file.split('.').pop();
      if (ext) {
        languageCount[ext] = (languageCount[ext] || 0) + 1;
      }
    });

    let dependencies = 'Not a Node.js project.';
    try {
      const packageJsonContent = await readFile('package.json', 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      dependencies = Object.keys(packageJson.dependencies || {}).join(', ');
    } catch (error) {
      // Ignore if package.json doesn't exist
    }

    let summary = `**Project Summary**\n\n`;
    summary += `*   **Total Files:** ${files.length}\n`;
    summary += `*   **Languages:**\n`;
    for (const lang in languageCount) {
      summary += `    *   ${lang}: ${languageCount[lang]}\n`;
    }
    summary += `*   **Dependencies:** ${dependencies}\n`;

    return summary;
  } catch (error) {
    const err = error as Error;
    return Promise.reject(`Error generating project summary: ${err.message}`);
  }
}