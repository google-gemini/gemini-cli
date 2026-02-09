#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Skill Initializer - Creates a new skill from template
 *
 * Usage:
 *     node init_skill.cjs <skill-name> --path <path>
 *
 * Examples:
 *     node init_skill.cjs my-new-skill --path skills/public
 */

const fs = require('node:fs');
const path = require('node:path');

const SKILL_TEMPLATE = `---
name: {skill_name}
description: TODO: Complete and informative explanation of what the skill does and when to use it. Include WHEN to use this skill - specific scenarios, file types, or tasks that trigger it.
---

# {skill_title}

## Overview

[TODO: 1-2 sentences explaining what this skill enables]

## Structuring This Skill

[TODO: Choose the structure that best fits this skill's purpose. Common patterns:

**1. Workflow-Based** (best for sequential processes)
- Works well when there are clear step-by-step procedures
- Example: CSV-Processor skill with "Workflow Decision Tree" → "Ingestion" → "Cleaning" → "Analysis"
- Structure: ## Overview → ## Workflow Decision Tree → ## Step 1 → ## Step 2...

**2. Task-Based** (best for tool collections)
- Works well when the skill offers different operations/capabilities
- Example: PDF skill with "Quick Start" → "Merge PDFs" → "Split PDFs" → "Extract Text"
- Structure: ## Overview → ## Quick Start → ## Task Category 1 → ## Task Category 2...

**3. Reference/Guidelines** (best for standards or specifications)
- Works well for brand guidelines, coding standards, or requirements
- Example: Brand styling with "Brand Guidelines" → "Colors" → "Typography" → "Features"
- Structure: ## Overview → ## Guidelines → ## Specifications → ## Usage...

**4. Capabilities-Based** (best for integrated systems)
- Works well when the skill provides multiple interrelated features
- Example: Product Management with "Core Capabilities" → numbered capability list
- Structure: ## Overview → ## Core Capabilities → ### 1. Feature → ### 2. Feature...

Patterns can be mixed and matched as needed. Most skills combine patterns (e.g., start with task-based, add workflow for complex operations).

Delete this entire "Structuring This Skill" section when done - it's just guidance.]

## [TODO: Replace with the first main section based on chosen structure]

[TODO: Add content here. See examples in existing skills:
- Code samples for technical skills
- Decision trees for complex workflows
- Concrete examples with realistic user requests
- References to scripts/templates/references as needed]

## Resources

This skill includes example resource directories that demonstrate how to organize different types of bundled resources:

### scripts/
Executable code that can be run directly to perform specific operations.

**Examples from other skills:**
- PDF skill: fill_fillable_fields.cjs, extract_form_field_info.cjs - utilities for PDF manipulation
- CSV skill: normalize_schema.cjs, merge_datasets.cjs - utilities for tabular data manipulation

**Appropriate for:** Node.cjs scripts (cjs), shell scripts, or any executable code that performs automation, data processing, or specific operations.

**Note:** Scripts may be executed without loading into context, but can still be read by Gemini CLI for patching or environment adjustments.

### references/
Documentation and reference material intended to be loaded into context to inform Gemini CLI's process and thinking.

**Examples from other skills:**
- Product management: communication.md, context_building.md - detailed workflow guides
- BigQuery: API reference documentation and query examples
- Finance: Schema documentation, company policies

**Appropriate for:** In-depth documentation, API references, database schemas, comprehensive guides, or any detailed information that Gemini CLI should reference while working.

### assets/
Files not intended to be loaded into context, but rather used within the output Gemini CLI produces.

**Examples from other skills:**
- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

**Any unneeded directories can be deleted.** Not every skill requires all three types of resources.
`;

const EXAMPLE_SCRIPT = `#!/usr/bin/env node

/**
 * Example helper script for {skill_name}
 *
 * This is a placeholder script that can be executed directly.
 * Replace with actual implementation or delete if not needed.
 *
 * Example real scripts from other skills:
 * - pdf/scripts/fill_fillable_fields.cjs - Fills PDF form fields
 * - pdf/scripts/convert_pdf_to_images.cjs - Converts PDF pages to images
 *
 * Agentic Ergonomics:
 * - Suppress tracebacks.
 * - Return clean success/failure strings.
 * - Truncate long outputs.
 */

async function main() {
  try {
    // TODO: Add actual script logic here.
    // This could be data processing, file conversion, API calls, etc.

    // Example output formatting for an LLM agent
    process.stdout.write("Success: Processed the task.\\n");
  } catch (err) {
    // Trap the error and output a clean message instead of a noisy stack trace
    process.stderr.write(\`Failure: \${err.message}\\n\`);
    process.exit(1);
  }
}

main();
`;

const EXAMPLE_REFERENCE = `# Reference Documentation for {skill_title}

This is a placeholder for detailed reference documentation.
Replace with actual reference content or delete if not needed.

## Structure Suggestions

### API Reference Example
- Overview
- Authentication
- Endpoints with examples
- Error codes

### Workflow Guide Example
- Prerequisites
- Step-by-step instructions
- Best practices
`;

function titleCase(name) {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3 || args[1] !== '--path') {
    console.log('Usage: node init_skill.cjs <skill-name> --path <path>');
    process.exit(1);
  }

  const skillName = args[0];
  const basePath = path.resolve(args[2]);

  // Prevent path traversal
  if (
    skillName.includes(path.sep) ||
    skillName.includes('/') ||
    skillName.includes('\\')
  ) {
    console.error('❌ Error: Skill name cannot contain path separators.');
    process.exit(1);
  }

  const skillDir = path.join(basePath, skillName);

  // Additional check to ensure the resolved skillDir is actually inside basePath
  if (!skillDir.startsWith(basePath)) {
    console.error('❌ Error: Invalid skill name or path.');
    process.exit(1);
  }

  if (fs.existsSync(skillDir)) {
    console.error(`❌ Error: Skill directory already exists: ${skillDir}`);
    process.exit(1);
  }

  const skillTitle = titleCase(skillName);

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'scripts'));
    fs.mkdirSync(path.join(skillDir, 'references'));
    fs.mkdirSync(path.join(skillDir, 'assets'));

    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      SKILL_TEMPLATE.replace(/{skill_name}/g, skillName).replace(
        /{skill_title}/g,
        skillTitle,
      ),
    );
    fs.writeFileSync(
      path.join(skillDir, 'scripts/example_script.cjs'),
      EXAMPLE_SCRIPT.replace(/{skill_name}/g, skillName),
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(skillDir, 'references/example_reference.md'),
      EXAMPLE_REFERENCE.replace(/{skill_title}/g, skillTitle),
    );
    fs.writeFileSync(
      path.join(skillDir, 'assets/example_asset.txt'),
      'Placeholder for assets.',
    );

    console.log(`✅ Skill '${skillName}' initialized at ${skillDir}`);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
