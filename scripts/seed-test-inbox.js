#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Seeds the auto-memory inbox with REALISTIC patches for manual end-to-end
 * testing of `/memory inbox`. Mirrors what one extraction-agent run would
 * produce in practice: a single canonical `extraction.patch` per kind,
 * containing multiple hunks (MEMORY.md update + sibling creation, etc.).
 *
 * Run AFTER `npm run build` from the project root:
 *   node scripts/seed-test-inbox.js
 *
 * The script will:
 *   1. Initialize Storage for the current working directory.
 *   2. Compute <projectMemoryDir> = ~/.gemini/tmp/<projectId>/memory/.
 *   3. Seed `MEMORY.md` and TWO canonical inbox patches:
 *        - .inbox/private/extraction.patch  (multi-hunk: update MEMORY.md
 *          + create verify-workflow.md + add MEMORY.md pointer to it)
 *        - .inbox/global/extraction.patch   (creates ~/.gemini/GEMINI.md)
 *   4. Print a verification checklist + the launch command.
 *
 * To clean up later, delete `<projectMemoryDir>/.inbox/` and the seeded
 * MEMORY.md / GEMINI.md files.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const corePath = path.join(REPO_ROOT, 'packages/core/dist/src/index.js');
try {
  await fs.access(corePath);
} catch {
  console.error(
    `Cannot find built core at ${corePath}. Run \`npm run build\` first.`,
  );
  process.exit(1);
}

const { Storage } = await import(corePath);

const cwd = process.cwd();
const storage = new Storage(cwd);
await storage.initialize();

const memoryDir = storage.getProjectMemoryTempDir();
const inboxPrivate = path.join(memoryDir, '.inbox', 'private');
const inboxGlobal = path.join(memoryDir, '.inbox', 'global');
const homeDir = os.homedir();
const globalGeminiMd = path.join(homeDir, '.gemini', 'GEMINI.md');

console.log(`\n🔧 Seeding inbox for cwd: ${cwd}`);
console.log(`   memoryDir = ${memoryDir}\n`);

await fs.mkdir(inboxPrivate, { recursive: true });
await fs.mkdir(inboxGlobal, { recursive: true });

const seeded = [];
async function seed(filePath, content, label) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  seeded.push({ filePath, label });
}

// --- 1. Pre-existing private MEMORY.md so the update hunk has something to modify ---
const memoryMd = path.join(memoryDir, 'MEMORY.md');
await seed(
  memoryMd,
  '# Project Memory\n\n- old fact about this project\n',
  'pre-existing active MEMORY.md',
);

// --- 2. Canonical PRIVATE extraction.patch ---
//     One file, multi-hunk: update MEMORY.md AND create verify-workflow.md
//     AND add a pointer line for the sibling. This is what one extraction
//     agent run typically produces.
const verifyWorkflowMd = path.join(memoryDir, 'verify-workflow.md');
await fs.rm(verifyWorkflowMd, { force: true });
await seed(
  path.join(inboxPrivate, 'extraction.patch'),
  [
    // Hunk 1: replace the existing fact and append a sibling pointer.
    `--- ${memoryMd}`,
    `+++ ${memoryMd}`,
    `@@ -1,3 +1,4 @@`,
    ` # Project Memory`,
    ` `,
    `-- old fact about this project`,
    `+- new fact extracted from session analysis`,
    `+- See ${verifyWorkflowMd} for the project's verification commands.`,
    // Hunk 2: create the verify-workflow.md sibling.
    `--- /dev/null`,
    `+++ ${verifyWorkflowMd}`,
    `@@ -0,0 +1,5 @@`,
    `+# Verify Workflow`,
    `+`,
    `+- Run \`npm run typecheck\` after editing any *.ts file.`,
    `+- Run \`npm run build --workspace @google/gemini-cli-core\` before testing CLI changes.`,
    `+- Inbox patches are guarded by /memory inbox.`,
    ``,
  ].join('\n'),
  'canonical PRIVATE extraction.patch (2 hunks: MEMORY.md update + sibling create)',
);

// --- 3. Canonical GLOBAL extraction.patch ---
//     Creates ~/.gemini/GEMINI.md. Backs up any existing one first.
let existingGlobalGemini = null;
try {
  existingGlobalGemini = await fs.readFile(globalGeminiMd, 'utf-8');
} catch {
  // Doesn't exist yet — fine.
}
if (existingGlobalGemini !== null) {
  const backupPath = `${globalGeminiMd}.seed-test-backup-${Date.now()}`;
  await fs.copyFile(globalGeminiMd, backupPath);
  console.log(
    `   ℹ️  Backed up existing ${globalGeminiMd} → ${backupPath}\n` +
      `       (restore manually after testing if you wish.)\n`,
  );
  await fs.rm(globalGeminiMd, { force: true });
}
await seed(
  path.join(inboxGlobal, 'extraction.patch'),
  [
    `--- /dev/null`,
    `+++ ${globalGeminiMd}`,
    `@@ -0,0 +1,3 @@`,
    `+# Global Personal Preferences`,
    `+`,
    `+- Prefer concise architecture summaries.`,
    ``,
  ].join('\n'),
  'canonical GLOBAL extraction.patch (creates ~/.gemini/GEMINI.md)',
);

// --- Summary ---
console.log('Seeded files:');
for (const { filePath, label } of seeded) {
  console.log(`   ✓ ${path.relative(cwd, filePath)}`);
  console.log(`     ${label}\n`);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('NEXT STEPS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`
1. Enable autoMemory in your settings (the inbox command requires it):

     ~/.gemini/settings.json should contain:
     {
       "experimental": { "autoMemory": true }
     }

   Or run this to set it:
     node -e "const fs=require('fs'),p=require('os').homedir()+'/.gemini/settings.json';let s={};try{s=JSON.parse(fs.readFileSync(p,'utf-8'))}catch{}s.experimental=s.experimental||{};s.experimental.autoMemory=true;fs.mkdirSync(require('path').dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(s,null,2))"

2. Launch the just-built CLI from THIS REPO ONLY. Do NOT use any globally
   installed "gemini" binary — it will be a stale build that doesn't know
   about memory patches and will silently show only skills.

     npm run start

   (or, equivalently: node ${path.relative(cwd, REPO_ROOT)}/bundle/gemini.js)

   Sanity check before launching:
     node ${path.relative(cwd, path.join(REPO_ROOT, 'scripts/check-inbox.js'))}
   should report 2 memory patches (Private memory + Global memory).

3. In the CLI, run:

     /memory inbox

   You should see exactly 2 entries in the "Memory Updates" group:
     - Private memory     2 hunks from 1 source patch
     - Global memory      1 hunk from 1 source patch

4. Test focus preservation: arrow-down to "Global memory" → Enter → Esc →
   cursor MUST still be on "Global memory" (not row 0).

5. Open "Private memory" preview. You'll see TWO target sections (no
   duplicates), since both hunks come from one source patch:

     ${memoryMd}
       - new fact extracted from session analysis
       - See ${verifyWorkflowMd} for the project's verification commands.

     ${verifyWorkflowMd} (new file)
       # Verify Workflow
       ...

6. Apply each entry:

   ┌──────────────────┬──────────┬───────────────────────────────────────┐
   │ Item             │ Action   │ Expected outcome                      │
   ├──────────────────┼──────────┼───────────────────────────────────────┤
   │ Private memory   │ Apply    │ "Applied all 1 private memory patch." │
   │                  │          │ MEMORY.md updated; verify-workflow.md │
   │                  │          │ created.                              │
   │ Global memory    │ Apply    │ "Applied all 1 global memory patch."  │
   │                  │          │ ~/.gemini/GEMINI.md created.          │
   └──────────────────┴──────────┴───────────────────────────────────────┘

7. Verify final state on disk:

     cat ${path.relative(cwd, memoryMd)}                    # should show new fact + pointer line
     cat ${path.relative(cwd, verifyWorkflowMd)}            # should exist
     cat ${globalGeminiMd}                                  # should show "Prefer concise..."
     ls ${path.relative(cwd, inboxPrivate)}                 # should be empty
     ls ${path.relative(cwd, inboxGlobal)}                  # should be empty

8. Cleanup:

     rm -rf ${path.relative(cwd, path.join(memoryDir, '.inbox'))}
     rm -f  ${path.relative(cwd, memoryMd)}
     rm -f  ${path.relative(cwd, verifyWorkflowMd)}
     rm -f  ${globalGeminiMd}
`);
