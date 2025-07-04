// ts-tools/generate-test.ts

import { readFile, writeFile } from 'fs/promises';
import { callGeminiApi } from './gemini';
import * as path from 'path';

/**
 * @description Generates a test file for a given source file.
 * @param {string[]} args - The arguments for the generate-test tool. e.g., ['/path/to/file.ts']
 * @returns {Promise<string>} A message indicating success or failure.
 */
export async function generateTest(args: string[]): Promise<string> {
  const [filePath] = args;

  if (!filePath) {
    return Promise.reject('Usage: generate-test <file_path>');
  }

  try {
    const fileContent = await readFile(filePath, 'utf-8');

    const prompt = `
      Based on the following TypeScript file, please generate a new test file using the 'jest' framework.
      The test file should cover the main functionality of the source file.
      The generated test code should be complete and ready to run.

      Source file content:
      ---
      ${fileContent}
      ---
    `;

    const testContent = await callGeminiApi(prompt);

    const dirName = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const testFilePath = path.join(dirName, `${baseName}.test.ts`);

    await writeFile(testFilePath, testContent, 'utf-8');

    return `Successfully generated test file at ${testFilePath}`;
  } catch (error) {
    const err = error as Error;
    return Promise.reject(`Error generating test file: ${err.message}`);
  }
}
