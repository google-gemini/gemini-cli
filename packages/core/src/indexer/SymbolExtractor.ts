/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SymbolDefinition } from './SymbolModel.js';

export class SymbolExtractor {
  public static extract(code: string, filePath: string): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    const lines = code.split('\n');

    let currentClass = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Check TypeScript / JavaScript symbols
      // 1. Classes
      const classMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+[^{]+)?(?:\s+implements\s+[^{]+)?/);
      if (classMatch) {
        currentClass = classMatch[1];
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          file: filePath,
          line: i + 1,
          signature: trimmed.replace(/\{.*$/, '').trim(),
          isExported: trimmed.startsWith('export'),
        });
        continue;
      }

      // 2. Interfaces
      const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)(?:<[^>]+>)?(?:\s+extends\s+[^{]+)?/);
      if (ifaceMatch) {
        symbols.push({
          name: ifaceMatch[1],
          kind: 'interface',
          file: filePath,
          line: i + 1,
          signature: trimmed.replace(/\{.*$/, '').trim(),
          isExported: trimmed.startsWith('export'),
        });
        continue;
      }

      // 3. Types
      const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([a-zA-Z0-9_$]+)(?:<[^>]+>)?\s*=/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: 'type',
          file: filePath,
          line: i + 1,
          signature: trimmed.slice(0, 80).trim(),
          isExported: trimmed.startsWith('export'),
        });
        continue;
      }

      // 4. Functions
      const funcMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          kind: 'function',
          file: filePath,
          line: i + 1,
          signature: trimmed.replace(/\{.*$/, '').trim(),
          isExported: trimmed.startsWith('export'),
        });
        continue;
      }

      // 5. Arrow Functions / Function Expressions
      const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/);
      if (arrowMatch) {
        symbols.push({
          name: arrowMatch[1],
          kind: 'function',
          file: filePath,
          line: i + 1,
          signature: trimmed.replace(/=>.*$/, '=> ...').trim(),
          isExported: trimmed.startsWith('export'),
        });
        continue;
      }

      // 6. Methods (inside class or object)
      const methodMatch = trimmed.match(/^(?:public|private|protected|static|override)?\s*(?:async\s+)?([a-zA-Z0-9_$]+)\s*\(([^)]*)\)(?::\s*[^{]+)?\s*\{/);
      if (methodMatch && currentClass && !trimmed.startsWith('function') && !trimmed.startsWith('if') && !trimmed.startsWith('for') && !trimmed.startsWith('while')) {
        const methodName = methodMatch[1];
        if (methodName !== 'constructor' && methodName !== 'if' && methodName !== 'switch') {
          symbols.push({
            name: `${currentClass}.${methodName}`,
            kind: 'method',
            file: filePath,
            line: i + 1,
            signature: trimmed.replace(/\{.*$/, '').trim(),
            isExported: false,
          });
          continue;
        }
      }

      // 7. Python definitions
      const pyClassMatch = line.match(/^class\s+([a-zA-Z0-9_]+)(?:\([^)]*\))?:/);
      if (pyClassMatch) {
        currentClass = pyClassMatch[1];
        symbols.push({
          name: pyClassMatch[1],
          kind: 'class',
          file: filePath,
          line: i + 1,
          signature: trimmed,
          isExported: true,
        });
        continue;
      }

      const pyDefMatch = line.match(/^(\s*)def\s+([a-zA-Z0-9_]+)\s*\([^)]*\)(?:\s*->\s*[^:]+)?:/);
      if (pyDefMatch) {
        const isIndented = pyDefMatch[1].length > 0;
        const methodName = pyDefMatch[2];
        if (isIndented && currentClass) {
          symbols.push({
            name: `${currentClass}.${methodName}`,
            kind: 'method',
            file: filePath,
            line: i + 1,
            signature: trimmed,
            isExported: false,
          });
        } else {
          currentClass = '';
          symbols.push({
            name: methodName,
            kind: 'function',
            file: filePath,
            line: i + 1,
            signature: trimmed,
            isExported: !methodName.startsWith('_'),
          });
        }
        continue;
      }

      // 8. Go definitions
      const goFuncMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/);
      if (goFuncMatch) {
        symbols.push({
          name: goFuncMatch[1],
          kind: 'function',
          file: filePath,
          line: i + 1,
          signature: trimmed.replace(/\{.*$/, '').trim(),
          isExported: /^[A-Z]/.test(goFuncMatch[1]),
        });
        continue;
      }
    }

    return symbols;
  }
}
