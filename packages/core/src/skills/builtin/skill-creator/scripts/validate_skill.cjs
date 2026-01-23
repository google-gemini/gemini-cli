/* eslint-env node */

/**
 * Quick validation logic for skills.
 * Leveraging existing dependencies when possible or providing a zero-dep fallback.
 */

const fs = require('node:fs');
const path = require('node:path');

function validateSkill(skillPath) {
  if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isDirectory()) {
    return { valid: false, message: `Path is not a directory: ${skillPath}` };
  }

  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return { valid: false, message: 'SKILL.md not found' };
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  if (!content.startsWith('---')) {
    return { valid: false, message: 'No YAML frontmatter found' };
  }

  const parts = content.split('---');
  if (parts.length < 3) {
    return { valid: false, message: 'Invalid frontmatter format' };
  }

  const frontmatterText = parts[1];

  const nameMatch = frontmatterText.match(/^name:\s*(.+)$/m);
  // Match description: "text" or description: 'text' or description: text
  const descMatch = frontmatterText.match(
    /^description:\s*(?:'([^']*)'|"([^"]*)"|(.+))$/m,
  );

  if (!nameMatch)
    return { valid: false, message: 'Missing "name" in frontmatter' };
  if (!descMatch)
    return {
      valid: false,
      message: 'Description must be a single-line string: description: ...',
    };

  const name = nameMatch[1].trim();
  const description = (
    descMatch[1] !== undefined
      ? descMatch[1]
      : descMatch[2] !== undefined
        ? descMatch[2]
        : descMatch[3] || ''
  ).trim();

  if (description.includes('\n')) {
    return {
      valid: false,
      message: 'Description must be a single line (no newlines)',
    };
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    return { valid: false, message: `Name "${name}" should be hyphen-case` };
  }

  if (description.length > 1024) {
    return { valid: false, message: 'Description is too long (max 1024)' };
  }

  // Check for TODOs
  const files = getAllFiles(skillPath);
  for (const file of files) {
    const fileContent = fs.readFileSync(file, 'utf8');
    if (fileContent.includes('TODO:')) {
      return {
        valid: true,
        message: 'Skill has unresolved TODOs',
        warning: `Found unresolved TODO in ${path.relative(skillPath, file)}`,
      };
    }
  }

  return { valid: true, message: 'Skill is valid!' };
}

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      if (!['node_modules', '.git', '__pycache__'].includes(file)) {
        getAllFiles(name, fileList);
      }
    } else {
      fileList.push(name);
    }
  });
  return fileList;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.log('Usage: node validate_skill.js <skill_directory>');
    process.exit(1);
  }

  const skillDirArg = args[0];
  if (skillDirArg.includes('..')) {
    console.error('❌ Error: Path traversal detected in skill directory path.');
    process.exit(1);
  }

  const result = validateSkill(path.resolve(skillDirArg));
  if (result.warning) {
    console.warn(`⚠️  ${result.warning}`);
  }
  if (result.valid) {
    console.log(`✅ ${result.message}`);
  } else {
    console.error(`❌ ${result.message}`);
    process.exit(1);
  }
}

module.exports = { validateSkill };
