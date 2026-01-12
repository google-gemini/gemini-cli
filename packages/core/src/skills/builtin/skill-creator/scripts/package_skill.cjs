#!/usr/bin/env node

/* eslint-env node */

/**
 * Skill Packager - Creates a distributable .skill file of a skill folder
 *
 * Usage:
 *     node package_skill.js <path/to/skill-folder> [output-directory]
 */

const path = require('node:path');
const { execSync } = require('node:child_process');
const { validateSkill } = require('./validate_skill.cjs');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(
      'Usage: node package_skill.js <path/to/skill-folder> [output-directory]',
    );
    process.exit(1);
  }

  const skillPath = path.resolve(args[0]);
  const outputDir = args[1] ? path.resolve(args[1]) : process.cwd();
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
    execSync(`cd "${skillPath}" && zip -r "${outputFilename}" .`);
    console.log(`✅ Successfully packaged skill to: ${outputFilename}`);
  } catch (err) {
    console.error(`❌ Error packaging: ${err.message}`);
    process.exit(1);
  }
}

main();
