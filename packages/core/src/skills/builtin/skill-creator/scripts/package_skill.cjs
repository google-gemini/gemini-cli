#!/usr/bin/env node

/* eslint-env node */

/**
 * Skill Packager - Creates a distributable .skill file of a skill folder
 *
 * Usage:
 *     node package_skill.js <path/to/skill-folder> [output-directory]
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateSkill } = require('./validate_skill.cjs');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(
      'Usage: node package_skill.js <path/to/skill-folder> [output-directory]',
    );
    process.exit(1);
  }

  const skillPathArg = args[0];
  const outputDirArg = args[1];

  if (
    skillPathArg.includes('..') ||
    (outputDirArg && outputDirArg.includes('..'))
  ) {
    console.error('❌ Error: Path traversal detected in arguments.');
    process.exit(1);
  }

  const skillPath = path.resolve(skillPathArg);
  const outputDir = outputDirArg ? path.resolve(outputDirArg) : process.cwd();
  const skillName = path.basename(skillPath);

  // 1. Validate first
  console.log('🔍 Validating skill...');
  const result = validateSkill(skillPath);
  if (!result.valid) {
    console.error(`❌ Validation failed: ${result.message}`);
    process.exit(1);
  }

  if (result.warning) {
    console.warn(`⚠️  ${result.warning}`);
    console.log('Please resolve all TODOs before packaging.');
    process.exit(1);
  }
  console.log('✅ Skill is valid!');

  // 2. Package
  const outputFilename = path.join(outputDir, `${skillName}.skill`);

  try {
    // Zip everything except junk, keeping the folder structure
    // We'll use the native 'zip' command for simplicity in a CLI environment
    // or we could use a JS library, but zip is ubiquitous on darwin/linux.

    // Command to zip:
    // -r: recursive
    // -x: exclude patterns
    // Run the zip command from within the directory to avoid parent folder nesting
    const zipProcess = spawnSync('zip', ['-r', outputFilename, '.'], {
      cwd: skillPath,
      stdio: 'inherit',
    });

    if (zipProcess.error) {
      throw zipProcess.error;
    }

    if (zipProcess.status !== 0) {
      throw new Error(`zip command failed with exit code ${zipProcess.status}`);
    }

    console.log(`✅ Successfully packaged skill to: ${outputFilename}`);
  } catch (err) {
    console.error(`❌ Error packaging: ${err.message}`);
    process.exit(1);
  }
}

main();
