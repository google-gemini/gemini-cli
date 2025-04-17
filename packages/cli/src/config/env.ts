import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

function findEnvFile(startDir: string): string | null {
  // Start search from the provided directory (e.g., current working directory)
  let currentDir = path.resolve(startDir); // Ensure absolute path
  while (true) {
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

export function loadEnvironment(): void {
  // Start searching from the current working directory by default
  const envFilePath = findEnvFile(process.cwd());

  if (!envFilePath) {
    return;
  }

  dotenv.config({ path: envFilePath });

  if (!process.env.GEMINI_API_KEY) {
    console.error(
      'Error: GEMINI_API_KEY environment variable is not set in the loaded .env file.',
    );
    process.exit(1);
  }
}

export function getApiKey(): string {
  loadEnvironment();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing. Ensure loadEnvironment() was called successfully.',
    );
  }
  return apiKey;
}
