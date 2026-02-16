/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * Computes the Genesis Hash of the TAS_DNA (package-lock.json).
 * This anchors the runtime to the sovereign definition.
 */
export async function computeGenesisHash(context: vscode.ExtensionContext): Promise<string> {
  try {
    // Locate package-lock.json relative to the extension root
    // Typically: extensionRoot/package-lock.json (if bundled) or workspace root
    // For this monorepo, we'll try to find the root package-lock.json

    // In dev mode, extensionUri points to packages/vscode-ide-companion
    // Root package-lock is at ../../package-lock.json
    const extensionRoot = context.extensionUri.fsPath;
    let lockFilePath = path.resolve(extensionRoot, '../../package-lock.json');

    // Fallback: Check if we are in a production bundle structure where lockfile might be included differently
    if (!fs.existsSync(lockFilePath)) {
       // Try local package lock if root not found (e.g. standalone install)
       lockFilePath = path.resolve(extensionRoot, 'package-lock.json');
    }

    if (!fs.existsSync(lockFilePath)) {
      console.warn('[TAS] Genesis Warning: DNA (package-lock.json) not found. Genesis Hash is purely synthetic.');
      return 'GENESIS_HASH_MISSING_DNA';
    }

    const dnaContent = await fs.promises.readFile(lockFilePath, 'utf-8');
    const hash = crypto.createHash('sha256').update(dnaContent).digest('hex');

    // Sign with Device Witness (Simulated PQC)
    const signature = simulatePQCSignature(hash);

    return `${hash}:${signature}`;
  } catch (error) {
    console.error(`[TAS] Genesis Error: ${error}`);
    return 'GENESIS_FAILURE';
  }
}

function simulatePQCSignature(hash: string): string {
  // Placeholder for Falcon-1024 signature
  // In a real sovereign SOC, this would use a hardware-backed key
  return `WITNESS_SIG(${hash.substring(0, 8)})`;
}
