/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Disallows relative imports between specified monorepo packages.
 */
'use strict';

import path from 'node:path';
import fs from 'node:fs';

/**
 * Finds the package name by searching for the nearest `package.json` file
 * in the directory hierarchy, starting from the given file's directory
 * and moving upwards until the specified root directory is reached.
 * It reads the `package.json` and extracts the `name` property.
 *
 * @requires module:path Node.js path module
 * @requires module:fs Node.js fs module
 *
 * @param {string} filePath - The path (absolute or relative) to a file within the potential package structure.
 * The search starts from the directory containing this file.
 * @param {string} root - The absolute path to the root directory of the project/monorepo.
 * The upward search stops when this directory is reached.
 * @returns {string | undefined | null} The value of the `name` field from the first `package.json` found.
 * Returns `undefined` if the `name` field doesn't exist in the found `package.json`.
 * Returns `null` if no `package.json` is found before reaching the `root` directory.
 * @throws {Error} Can throw an error if `fs.readFileSync` fails (e.g., permissions) or if `JSON.parse` fails on invalid JSON content.
 */
function findPackageName(filePath, root) {
  let currentDir = path.dirname(path.resolve(filePath));
  while (currentDir !== root) {
    const parentDir = path.dirname(currentDir);
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return pkg.name;
    }

    // Move up one level
    currentDir = parentDir;
    // Safety break if we somehow reached the root directly in the loop condition (less likely with path.resolve)
    if (path.dirname(currentDir) === currentDir) break;
  }

  return null; // Not found within the expected structure
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow relative imports between packages.',
      category: 'Best Practices',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          root: {
            type: 'string',
            description:
              'Absolute path to the root of all relevant packages to consider.',
          },
        },
        required: ['root'],
        additionalProperties: false,
      },
    ],
    messages: {
      noRelativePathsForCrossPackageImport:
        "Relative import '{{importedPath}}' crosses package boundary from '{{importingPackage}}' to '{{importedPackage}}'. Use a direct package import ('{{importedPackage}}') instead.",
      relativeImportIsInvalidPackage:
        "Relative import '{{importedPath}}' does not reference a valid package. All source must be in a package directory.",
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allPackagesRoot = options.root;

    const currentFilePath = context.filename;
    if (
      !currentFilePath ||
      currentFilePath === '<input>' ||
      currentFilePath === '<text>'
    ) {
      // Skip if filename is not available (e.g., linting raw text)
      return {};
    }

    const currentPackage = findPackageName(currentFilePath, allPackagesRoot);

    // If the current file isn't inside a package structure, don't apply the rule
    if (!currentPackage) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        const importingPackage = currentPackage;
        const importedPath = node.source.value;

        // Only interested in relative paths
        if (
          !importedPath ||
          typeof importedPath !== 'string' ||
          !importedPath.startsWith('.')
        ) {
          return;
        }

        // Resolve the absolute path of the imported module
        const absoluteImportPath = path.resolve(
          path.dirname(currentFilePath),
          importedPath,
        );

        // Find the package information for the imported file
        const importedPackage = findPackageName(
          absoluteImportPath,
          allPackagesRoot,
        );

        // If the imported file isn't in a recognized package, report issue
        if (!importedPackage) {
          context.report({
            node: node.source,
            messageId: 'relativeImportIsInvalidPackage',
            data: { importedPath: importedPath },
          });
          return;
        }

        // The core check: Are the source and target packages different?
        if (currentPackage !== importedPackage) {
          // We found a relative import crossing package boundaries
          context.report({
            node: node.source, // Report the error on the source string literal
            messageId: 'noRelativePathsForCrossPackageImport',
            data: {
              importedPath,
              importedPackage,
              importingPackage,
            },
            fix(fixer) {
              return fixer.replaceText(node.source, `'${importedPackage}'`);
            },
          });
        }
      },
    };
  },
};
