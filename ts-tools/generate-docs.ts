// ts-tools/generate-docs.ts

import { readFile, writeFile } from 'fs/promises';
import { callGeminiApi } from './gemini';
import * as path from 'path';

/**
 * @description Generates Markdown documentation for a given source file.
 * @param {string[]} args - The arguments for the generate-docs tool. e.g., ['/path/to/file.ts']
 * @returns {Promise<string>} A message indicating success or failure.
 */
export async function generateDocs(args: string[]): Promise<string> {
  const [filePath] = args;

  if (!filePath) {
    return Promise.reject('Usage: generate-docs <file_path>');
  }

  try {
    const fileContent = await readFile(filePath, 'utf-8');

    const prompt = `
      Based on the following TypeScript file, please generate a Markdown documentation file.
      The documentation should explain the purpose of the file, its functions, classes, and their parameters.

      Source file content:
      ---
      ${fileContent}
      ---
    `;

    const docContent = await callGeminiApi(prompt);

    const dirName = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const docFilePath = path.join(dirName, `${baseName}.md`);

    await writeFile(docFilePath, docContent, 'utf-8');

    return `Successfully generated documentation file at ${docFilePath}`;
  } catch (error) {
    const err = error as Error;
    return Promise.reject(`Error generating documentation file: ${err.message}`);
  }
}
