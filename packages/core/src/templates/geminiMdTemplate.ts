/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generates a starter GEMINI.md template when one does not exist
 * at the project root. Detects the project type from manifest files and
 * produces a concise, useful scaffold for persistent project context.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debugLogger } from '../utils/debugLogger.js';

/** Describes a detected project ecosystem. */
interface ProjectSignature {
  name: string;
  language: string;
  framework?: string;
}

/** Manifest file → project type mappings. */
const MANIFEST_MAP: ReadonlyArray<{
  file: string;
  detect: (content: string) => ProjectSignature;
}> = [
  {
    file: 'package.json',
    detect: (content) => {
      const parsed = safeParse(content);
      const name = getString(parsed, 'name') || 'unknown';
      const deps = {
        ...getObj(parsed, 'dependencies'),
        ...getObj(parsed, 'devDependencies'),
      };
      let framework: string | undefined;
      if ('next' in deps) framework = 'Next.js';
      else if ('react' in deps) framework = 'React';
      else if ('vue' in deps) framework = 'Vue';
      else if ('express' in deps) framework = 'Express';
      else if ('fastify' in deps) framework = 'Fastify';
      return { name, language: 'TypeScript/JavaScript', framework };
    },
  },
  {
    file: 'Cargo.toml',
    detect: (content) => {
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      return { name: nameMatch?.[1] || 'unknown', language: 'Rust' };
    },
  },
  {
    file: 'go.mod',
    detect: (content) => {
      const modMatch = content.match(/module\s+(\S+)/);
      const name = modMatch?.[1]?.split('/').pop() || 'unknown';
      return { name, language: 'Go' };
    },
  },
  {
    file: 'pyproject.toml',
    detect: (content) => {
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      return { name: nameMatch?.[1] || 'unknown', language: 'Python' };
    },
  },
  {
    file: 'requirements.txt',
    detect: () => ({ name: 'unknown', language: 'Python' }),
  },
  {
    file: 'pom.xml',
    detect: (content) => {
      const nameMatch = content.match(/<artifactId>([^<]+)<\/artifactId>/);
      return { name: nameMatch?.[1] || 'unknown', language: 'Java' };
    },
  },
  {
    file: 'build.gradle',
    detect: () => ({ name: 'unknown', language: 'Java/Kotlin' }),
  },
  {
    file: 'Gemfile',
    detect: () => ({ name: 'unknown', language: 'Ruby' }),
  },
];

/**
 * Detects the project type by probing common manifest files.
 * Returns the first match found.
 */
export async function detectProjectType(
  projectRoot: string,
): Promise<ProjectSignature | null> {
  for (const { file, detect } of MANIFEST_MAP) {
    try {
      const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
      return detect(content);
    } catch {
      // File not found — try next
    }
  }
  return null;
}

/**
 * Generates a starter GEMINI.md template for a project.
 *
 * The template is intentionally concise (~25 lines) to avoid bloating the
 * context window. It includes detected project metadata and a placeholder
 * section for Gemini-generated memories.
 */
export function generateTemplate(
  projectRoot: string,
  signature: ProjectSignature | null,
): string {
  const projectName =
    signature?.name || path.basename(projectRoot) || 'Project';
  const lang = signature?.language || 'Unknown';
  const framework = signature?.framework ? ` (${signature.framework})` : '';

  return `# ${projectName}

## Project Overview
- **Language**: ${lang}${framework}
- **Root**: \`${path.basename(projectRoot)}\`

## Architecture
<!-- Describe the high-level architecture, key modules, and data flow. -->

## Conventions
<!-- Coding conventions, naming patterns, preferred libraries, etc. -->

## Key Files
<!-- List important entry points, config files, and documentation. -->

## Gemini Added Memories
<!-- Gemini will add learned context below this line. Do not remove this section. -->
`;
}

/**
 * Creates a GEMINI.md file at the project root if one does not already exist.
 * Returns the path to the created file, or null if one already existed.
 */
export async function ensureGeminiMd(
  projectRoot: string,
  filename: string = 'GEMINI.md',
): Promise<string | null> {
  const targetPath = path.join(projectRoot, filename);
  try {
    await fs.access(targetPath);
    // File already exists — do not overwrite
    return null;
  } catch {
    // File does not exist — create it
  }

  try {
    const signature = await detectProjectType(projectRoot);
    const content = generateTemplate(projectRoot, signature);
    await fs.writeFile(targetPath, content, 'utf-8');
    debugLogger.debug(
      `[GeminiMdTemplate] Created ${filename} at ${projectRoot}`,
    );
    return targetPath;
  } catch (error) {
    debugLogger.warn(
      `[GeminiMdTemplate] Failed to create ${filename}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

// --- Utility helpers for safe JSON parsing ---

function safeParse(content: string): Record<string, unknown> {
  try {
    const result: unknown = JSON.parse(content);
    if (typeof result === 'object' && result !== null) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return result as Record<string, unknown>;
    }
  } catch {
    // Invalid JSON
  }
  return {};
}

function getString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  return typeof val === 'string' ? val : '';
}

function getObj(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const val = obj[key];
  return typeof val === 'object' && val !== null
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (val as Record<string, unknown>)
    : {};
}
