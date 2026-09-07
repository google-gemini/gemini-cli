/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ComplexityFinding {
  type:
    | 'trivial-wrapper'
    | 'deep-nesting'
    | 'commented-code'
    | 'empty-interface'
    | 'oversized-function';
  message: string;
  line: number;
  snippet?: string;
  recommendation: string;
  file?: string;
}

export class ComplexityAnalyzer {
  public analyze(code: string, filePath?: string): ComplexityFinding[] {
    const findings: ComplexityFinding[] = [];
    const lines = code.split('\n');

    let currentFunctionStart = -1;
    let currentFunctionName = '';
    let currentFunctionLines = 0;
    let currentFunctionStatements: string[] = [];
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for commented-out code
      if (
        (trimmed.startsWith('// const ') ||
          trimmed.startsWith('// let ') ||
          trimmed.startsWith('// var ') ||
          trimmed.startsWith('// function ') ||
          trimmed.startsWith('// import ') ||
          trimmed.startsWith('// export ') ||
          trimmed.startsWith('// return ')) &&
        !trimmed.includes('eslint')
      ) {
        findings.push({
          type: 'commented-code',
          message: 'Commented-out code detected.',
          line: i + 1,
          snippet: trimmed,
          recommendation: 'Delete dead commented code; git preserves version history.',
          file: filePath,
        });
      }

      // Check for empty interfaces
      if (/interface\s+\w+\s*(?:extends\s+\w+\s*)?\{\s*\}/.test(trimmed)) {
        findings.push({
          type: 'empty-interface',
          message: 'Empty interface definition.',
          line: i + 1,
          snippet: trimmed,
          recommendation: 'Remove empty interface or use the underlying type directly.',
          file: filePath,
        });
      }

      // Check for trivial 1-line arrow wrapper: const foo = (x) => bar(x);
      const arrowWrapperMatch = trimmed.match(
        /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>\s*([a-zA-Z0-9_$]+)\([^)]*\);?$/
      );
      if (arrowWrapperMatch) {
        const target = arrowWrapperMatch[1];
        findings.push({
          type: 'trivial-wrapper',
          message: `Trivial pass-through wrapper calling '${target}'.`,
          line: i + 1,
          snippet: trimmed,
          recommendation: `Call '${target}' directly instead of maintaining an extra indirection layer.`,
          file: filePath,
        });
      }

      // Check indentation depth (deep nesting)
      if (trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
        const indentSpaces = line.search(/\S/);
        // If indented by 16+ spaces (or 4 tabs), flag deep nesting
        if (indentSpaces >= 16) {
          findings.push({
            type: 'deep-nesting',
            message: 'Deep nesting level (>= 4 levels of indentation).',
            line: i + 1,
            snippet: trimmed,
            recommendation: 'Use early returns or extract smaller helper logic to flatten control flow.',
            file: filePath,
          });
        }
      }

      // Track function length & statements
      const funcHeader = line.match(/(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{|(?:public|private|protected)?\s*(?:async\s+)?([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^\{]+)?\s*\{)/);
      if (funcHeader && braceDepth === 0) {
        currentFunctionStart = i + 1;
        currentFunctionName = funcHeader[1] || funcHeader[2] || funcHeader[3] || 'anonymous';
        currentFunctionLines = 0;
        currentFunctionStatements = [];
      }

      // Collect statements within current function (excluding outer definition line)
      if (currentFunctionStart !== -1 && i + 1 > currentFunctionStart && trimmed !== '{' && trimmed !== '}' && trimmed !== '') {
        currentFunctionStatements.push(trimmed);
      }

      // Track braces
      for (const char of line) {
        if (char === '{') braceDepth++;
        else if (char === '}') {
          braceDepth--;
          if (braceDepth === 0 && currentFunctionStart !== -1) {
            // Check if function was a trivial single-statement wrapper
            if (currentFunctionStatements.length === 1) {
              const stmt = currentFunctionStatements[0];
              const returnMatch = stmt.match(/^return\s+([a-zA-Z0-9_$]+)\s*\(.*\);?$/);
              if (returnMatch && returnMatch[1] !== currentFunctionName) {
                findings.push({
                  type: 'trivial-wrapper',
                  message: `Trivial pass-through wrapper calling '${returnMatch[1]}'.`,
                  line: currentFunctionStart,
                  snippet: stmt,
                  recommendation: `Call '${returnMatch[1]}' directly instead of maintaining an extra indirection layer.`,
                  file: filePath,
                });
              }
            }

            if (currentFunctionLines > 60) {
              findings.push({
                type: 'oversized-function',
                message: `Function '${currentFunctionName}' is ${currentFunctionLines} lines long.`,
                line: currentFunctionStart,
                recommendation: 'Consider breaking down or deleting unnecessary conditional branches.',
                file: filePath,
              });
            }
            currentFunctionStart = -1;
            currentFunctionStatements = [];
          }
        }
      }

      if (currentFunctionStart !== -1) {
        currentFunctionLines++;
      }
    }

    return findings;
  }

  public formatReport(findings: ComplexityFinding[]): string {
    if (findings.length === 0) {
      return 'No gratuitous complexity or premature abstractions found. Code structure is clean.';
    }

    const lines: string[] = [
      '### Ponytail Code Simplicity Audit',
      'Opportunities to prune complexity and delete unnecessary code:',
      '',
    ];

    for (const f of findings) {
      const loc = f.file ? `${f.file}:${f.line}` : `Line ${f.line}`;
      lines.push(`- **[${f.type.toUpperCase()}]** ${loc}: ${f.message}`);
      if (f.snippet) {
        lines.push(`  \`${f.snippet}\``);
      }
      lines.push(`  - *Recommendation*: ${f.recommendation}`);
    }

    return lines.join('\n');
  }
}
