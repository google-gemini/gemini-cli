/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import * as ts from 'typescript';

export const BASE_EVAL_HELPERS = [
  'evalTest',
  'appEvalTest',
  'componentEvalTest',
] as const;

export type BaseEvalHelper = (typeof BASE_EVAL_HELPERS)[number];
export type EvalHelperName = BaseEvalHelper | string;
export type EvalPolicy =
  | 'ALWAYS_PASSES'
  | 'USUALLY_PASSES'
  | 'USUALLY_FAILS'
  | 'unknown';

export interface EvalSourceLocation {
  line: number;
  column: number;
}

export interface EvalAnalysisDiagnostic {
  severity: 'warning';
  message: string;
  filePath: string;
  location: EvalSourceLocation;
}

export interface EvalCaseRecord {
  filePath: string;
  relativePath: string;
  helperName: EvalHelperName;
  baseHelperName: BaseEvalHelper | 'unknown';
  policy: EvalPolicy;
  name: string;
  suiteName?: string;
  suiteType?: string;
  timeout?: number;
  hasFiles: boolean;
  hasPrompt: boolean;
  location: EvalSourceLocation;
}

export interface EvalFileAnalysis {
  filePath: string;
  relativePath: string;
  helpers: Record<string, BaseEvalHelper | 'unknown'>;
  cases: readonly EvalCaseRecord[];
  diagnostics: readonly EvalAnalysisDiagnostic[];
}

export interface AnalyzeEvalSourceOptions {
  filePath?: string;
  repoRoot?: string;
}

export function analyzeEvalSource(
  sourceText: string,
  options: AnalyzeEvalSourceOptions = {},
): EvalFileAnalysis {
  const filePath = options.filePath ?? '<inline>';
  const relativePath = getRelativePath(filePath, options.repoRoot);
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );

  const helpers = collectHelperMappings(sourceFile);
  const diagnostics: EvalAnalysisDiagnostic[] = [];
  const cases: EvalCaseRecord[] = [];

  collectEvalCalls(sourceFile, helpers, (callExpression, helperName) => {
    const args = callExpression.arguments;
    const policyArg = args[0];
    const evalCaseArg = args[1];
    const policy = policyArg ? getStringLiteralValue(policyArg) : undefined;
    const evalCase =
      evalCaseArg && ts.isObjectLiteralExpression(evalCaseArg)
        ? evalCaseArg
        : undefined;

    if (!policy || !isEvalPolicy(policy)) {
      diagnostics.push({
        severity: 'warning',
        message: `Could not statically resolve policy for ${helperName} call.`,
        filePath,
        location: getLocation(sourceFile, policyArg ?? callExpression),
      });
    }

    if (!evalCase) {
      diagnostics.push({
        severity: 'warning',
        message: `Could not statically resolve eval case object for ${helperName} call.`,
        filePath,
        location: getLocation(sourceFile, evalCaseArg ?? callExpression),
      });
      return;
    }

    const name = getStaticStringProperty(evalCase, 'name');
    if (!name) {
      diagnostics.push({
        severity: 'warning',
        message: `Could not statically resolve eval case name for ${helperName} call.`,
        filePath,
        location: getLocation(sourceFile, evalCase),
      });
    }

    cases.push({
      filePath,
      relativePath,
      helperName,
      baseHelperName: helpers[helperName] ?? 'unknown',
      policy: isEvalPolicy(policy) ? policy : 'unknown',
      name: name ?? '<unknown>',
      suiteName: getStaticStringProperty(evalCase, 'suiteName'),
      suiteType: getStaticStringProperty(evalCase, 'suiteType'),
      timeout: getStaticNumberProperty(evalCase, 'timeout'),
      hasFiles: hasProperty(evalCase, 'files'),
      hasPrompt: hasProperty(evalCase, 'prompt'),
      location: getLocation(sourceFile, callExpression),
    });
  });

  cases.sort(compareEvalCases);

  return {
    filePath,
    relativePath,
    helpers,
    cases,
    diagnostics: diagnostics.sort(compareDiagnostics),
  };
}

function collectHelperMappings(
  sourceFile: ts.SourceFile,
): Record<string, BaseEvalHelper | 'unknown'> {
  const helpers: Record<string, BaseEvalHelper | 'unknown'> = {};
  for (const helper of BASE_EVAL_HELPERS) {
    helpers[helper] = helper;
  }

  for (const alias of collectImportedHelperAliases(sourceFile)) {
    helpers[alias.name] = alias.baseHelper;
  }

  let changed = true;
  while (changed) {
    changed = false;

    const visit = (node: ts.Node) => {
      const name = getFunctionLikeBindingName(node);
      if (name && !helpers[name]) {
        const functionNode = getFunctionLikeNode(node);
        if (functionNode) {
          const baseHelper = findCalledHelper(functionNode, helpers);
          if (
            baseHelper &&
            helpers[baseHelper] &&
            helpers[baseHelper] !== 'unknown'
          ) {
            helpers[name] = helpers[baseHelper];
            changed = true;
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return helpers;
}

function collectImportedHelperAliases(sourceFile: ts.SourceFile) {
  const aliases: Array<{ name: string; baseHelper: BaseEvalHelper }> = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (isBaseEvalHelper(importedName)) {
        aliases.push({
          name: element.name.text,
          baseHelper: importedName,
        });
      }
    }
  }

  return aliases;
}

function collectEvalCalls(
  sourceFile: ts.SourceFile,
  helpers: Record<string, BaseEvalHelper | 'unknown'>,
  onCall: (callExpression: ts.CallExpression, helperName: string) => void,
) {
  const visit = (node: ts.Node) => {
    const wrapperName = getFunctionLikeBindingName(node);
    if (wrapperName && helpers[wrapperName] && !isBaseEvalHelper(wrapperName)) {
      return;
    }

    if (ts.isCallExpression(node)) {
      const helperName = getCalledIdentifierName(node);
      if (helperName && helpers[helperName]) {
        onCall(node, helperName);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

function findCalledHelper(
  functionNode: ts.Node,
  helpers: Record<string, BaseEvalHelper | 'unknown'>,
): string | undefined {
  let found: string | undefined;

  const visit = (candidate: ts.Node) => {
    if (found) {
      return;
    }
    if (
      candidate !== functionNode &&
      (ts.isFunctionDeclaration(candidate) ||
        ts.isFunctionExpression(candidate) ||
        ts.isArrowFunction(candidate) ||
        ts.isMethodDeclaration(candidate))
    ) {
      return;
    }
    if (ts.isCallExpression(candidate)) {
      const helperName = getCalledIdentifierName(candidate);
      if (helperName && helpers[helperName]) {
        found = helperName;
        return;
      }
    }
    ts.forEachChild(candidate, visit);
  };

  ts.forEachChild(functionNode, visit);
  return found;
}

function getFunctionLikeBindingName(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text;
  }

  if (ts.isVariableDeclaration(node)) {
    if (
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      return node.name.text;
    }
  }

  return undefined;
}

function getFunctionLikeNode(node: ts.Node) {
  if (ts.isFunctionDeclaration(node)) {
    return node;
  }

  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer))
  ) {
    return node.initializer;
  }

  return undefined;
}

function getCalledIdentifierName(callExpression: ts.CallExpression) {
  return ts.isIdentifier(callExpression.expression)
    ? callExpression.expression.text
    : undefined;
}

function isBaseEvalHelper(name: string): name is BaseEvalHelper {
  return BASE_EVAL_HELPERS.includes(name as BaseEvalHelper);
}

function isEvalPolicy(policy: string | undefined): policy is EvalPolicy {
  return (
    policy === 'ALWAYS_PASSES' ||
    policy === 'USUALLY_PASSES' ||
    policy === 'USUALLY_FAILS'
  );
}

function hasProperty(objectLiteral: ts.ObjectLiteralExpression, name: string) {
  return Boolean(getPropertyAssignment(objectLiteral, name));
}

function getStaticStringProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
) {
  const assignment = getPropertyAssignment(objectLiteral, name);
  return assignment ? getStringLiteralValue(assignment.initializer) : undefined;
}

function getStaticNumberProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
) {
  const assignment = getPropertyAssignment(objectLiteral, name);
  if (!assignment) {
    return undefined;
  }
  const initializer = assignment.initializer;
  return ts.isNumericLiteral(initializer)
    ? Number(initializer.text)
    : undefined;
}

function getPropertyAssignment(
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
) {
  return objectLiteral.properties.find((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return false;
    }
    const propertyName = property.name;
    return (
      (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) &&
      propertyName.text === name
    );
  }) as ts.PropertyAssignment | undefined;
}

function getStringLiteralValue(expression: ts.Expression | undefined) {
  if (!expression) {
    return undefined;
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  return undefined;
}

function getLocation(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): EvalSourceLocation {
  const location = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return {
    line: location.line + 1,
    column: location.character + 1,
  };
}

function getRelativePath(filePath: string, repoRoot: string | undefined) {
  if (filePath === '<inline>') {
    return filePath;
  }
  const relativePath = repoRoot ? path.relative(repoRoot, filePath) : filePath;
  return relativePath.replace(/\\/g, '/');
}

function getScriptKind(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function compareEvalCases(left: EvalCaseRecord, right: EvalCaseRecord) {
  return (
    compareStrings(left.relativePath, right.relativePath) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column ||
    compareStrings(left.name, right.name)
  );
}

function compareDiagnostics(
  left: EvalAnalysisDiagnostic,
  right: EvalAnalysisDiagnostic,
) {
  return (
    compareStrings(left.filePath, right.filePath) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column ||
    compareStrings(left.message, right.message)
  );
}

function compareStrings(left: string, right: string) {
  return left.localeCompare(right, 'en');
}
