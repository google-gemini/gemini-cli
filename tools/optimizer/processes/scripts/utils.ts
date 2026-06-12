/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Fetches the current repository owner and name.
 */
export function getRepoInfo(): { owner: string; repo: string } {
  try {
    const output = execSync('gh repo view --json owner,name', { encoding: 'utf-8' });
    const data = JSON.parse(output);
    return {
      owner: data.owner.login,
      repo: data.name,
    };
  } catch (err) {
    console.error('Error fetching repo info, falling back to default:', err);
    return { owner: 'google-gemini', repo: 'gemini-cli' };
  }
}

/**
 * Fetches maintainers from CODEOWNERS file.
 */
export async function getMaintainers(): Promise<string[]> {
  try {
    const codeownersPath = path.join(process.cwd(), '.github', 'CODEOWNERS');
    const content = await fs.readFile(codeownersPath, 'utf8');
    const maintainers = new Set<string>();
    
    const lines = content.split('\n');
    for (const line of lines) {
      const cleanLine = line.split('#')[0].trim();
      if (!cleanLine) continue;

      // Match @user or @org/team
      const matches = cleanLine.match(/@[\w-]+\/[\w-]+|@[\w-]+/g);
      if (matches) {
        for (const match of matches) {
          if (match.includes('/')) {
            // For teams, we should ideally expand them via gh api, 
            // but for simulation/simple use, we'll just log it.
            console.log(`[INFO] Found team ownership: ${match}. Skipping team expansion for now.`);
            continue;
          }
          maintainers.add(match.replace('@', ''));
        }
      }
    }
    
    if (maintainers.size === 0) {
      console.warn('No maintainers found in CODEOWNERS, using fallbacks.');
      return ['gundermanc', 'jackwotherspoon', 'DavidAPierce'];
    }
    
    return Array.from(maintainers);
  } catch (err) {
    console.warn('CODEOWNERS not found or unreadable, using fallback maintainers.');
    return ['gundermanc', 'jackwotherspoon', 'DavidAPierce'];
  }
}

/**
 * Safely updates a CSV file by modifying specific columns for certain rows.
 */
export async function updateSimulationCsv(
  filename: 'issues-after.csv' | 'prs-after.csv',
  updates: Map<string, Record<string, string>>
) {
  if (updates.size === 0) return;

  const filePath = path.join(process.cwd(), filename);
  const beforeFilePath = path.join(process.cwd(), filename.replace('-after', '-before'));
  
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    try {
      content = await fs.readFile(beforeFilePath, 'utf8');
    } catch {
      console.error(`Could not find ${filename} or ${beforeFilePath}`);
      return;
    }
  }

  const lines = content.split('\n');
  if (lines.length === 0) return;

  const header = lines[0].split(',');
  const numberIndex = header.indexOf('number');
  if (numberIndex === -1) {
    console.error(`CSV ${filename} missing 'number' column`);
    return;
  }

  const newLines = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;
    
    // Split by comma but respect quotes
    const columns: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let charIndex = 0; charIndex < rawLine.length; charIndex++) {
      const char = rawLine[charIndex];
      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === ',' && !inQuotes) {
        columns.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    columns.push(current);
    
    const number = columns[numberIndex]?.replace(/"/g, '');
    
    if (updates.has(number)) {
      const update = updates.get(number)!;
      for (const [colName, newValue] of Object.entries(update)) {
        const colIndex = header.indexOf(colName);
        if (colIndex !== -1) {
          if (colName === 'labels') {
            const existingLabels = columns[colIndex].replace(/"/g, '').split(',').map(s => s.trim()).filter(Boolean);
            const newLabels = newValue.split(',').map(s => s.trim()).filter(Boolean);
            const combined = Array.from(new Set([...existingLabels, ...newLabels]));
            columns[colIndex] = `"${combined.join(', ')}"`;
          } else {
            columns[colIndex] = newValue.includes(',') ? `"${newValue}"` : newValue;
          }
        }
      }
    }
    newLines.push(columns.join(','));
  }

  await fs.writeFile(filePath, newLines.join('\n'));
}

/**
 * Reads maintainer workload from maintainer_workload.csv.
 */
export async function getMaintainerWorkload(): Promise<Record<string, number>> {
  try {
    const filePath = path.join(process.cwd(), 'maintainer_workload.csv');
    const content = await fs.readFile(filePath, 'utf8');
    const workload: Record<string, number> = {};
    
    const lines = content.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('TOTAL') || line.startsWith('RATIO')) continue;
      
      const columns = line.split(',');
      const maintainer = columns[0];
      const assignedIssues = parseInt(columns[1] || '0', 10);
      const assignedPrs = parseInt(columns[2] || '0', 10);
      workload[maintainer] = assignedIssues + assignedPrs;
    }
    return workload;
  } catch (err) {
    console.warn('maintainer_workload.csv not found or unreadable, returning empty workload.');
    return {};
  }
}

/**
 * Executes a gh command with logging and dry-run support.
 */
export async function execGh(command: string, execute: boolean) {
  if (!execute) {
    console.log(`[DRY RUN] Would execute: gh ${command}`);
    return;
  }

  console.log(`Executing: gh ${command}`);
  try {
    // Small delay to be nicer to the API and avoid race conditions if run concurrently
    await new Promise(resolve => setTimeout(resolve, 100));
    execSync(`gh ${command}`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Failed to execute gh ${command}:`, err);
  }
}

