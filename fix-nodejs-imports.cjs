const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find all TypeScript files
const findTsFiles = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git')) {
        results = results.concat(findTsFiles(filePath));
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      results.push(filePath);
    }
  });
  return results;
};

// Import mapping for Node.js modules
const importMappings = {
  "import fs from 'node:fs';": "import * as fs from 'node:fs';",
  "import fs from 'node:fs/promises';":
    "import * as fs from 'node:fs/promises';",
  "import fsPromises from 'node:fs/promises';":
    "import * as fsPromises from 'node:fs/promises';",
  "import path from 'node:path';": "import * as path from 'node:path';",
  "import os from 'node:os';": "import * as os from 'node:os';",
  "import process from 'node:process';":
    "import * as process from 'node:process';",
  "import url from 'node:url';": "import * as url from 'node:url';",
  "import crypto from 'node:crypto';": "import * as crypto from 'node:crypto';",
  "import util from 'node:util';": "import * as util from 'node:util';",

  // Also fix regular node: imports
  "import fs from 'fs';": "import * as fs from 'fs';",
  "import path from 'path';": "import * as path from 'path';",
  "import os from 'os';": "import * as os from 'os';",
  "import process from 'process';": "import * as process from 'process';",
  "import url from 'url';": "import * as url from 'url';",
  "import crypto from 'crypto';": "import * as crypto from 'crypto';",
  "import util from 'util';": "import * as util from 'util';",

  // Third-party modules that need esModuleInterop
  "import ignore from 'ignore';": "import * as ignore from 'ignore';",
  "import mime from 'mime/lite';": "import * as mime from 'mime/lite';",
  "import pkg from '@xterm/headless';":
    "import * as pkg from '@xterm/headless';",
};

const fixFile = (filePath) => {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Apply all mappings
    for (const [oldImport, newImport] of Object.entries(importMappings)) {
      if (content.includes(oldImport)) {
        content = content.replace(
          new RegExp(oldImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          newImport,
        );
        changed = true;
        console.log(
          `Fixed import in ${filePath}: ${oldImport} -> ${newImport}`,
        );
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content);
    }
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
  }
};

console.log('Finding TypeScript files...');
const tsFiles = findTsFiles('./packages/core/src');
console.log(`Found ${tsFiles.length} TypeScript files`);

console.log('Fixing Node.js imports...');
tsFiles.forEach(fixFile);

console.log('✅ Node.js import fix complete!');
