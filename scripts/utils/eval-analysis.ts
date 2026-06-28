/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import * as ts from 'typescript';
import {
  ALL_BUILTIN_TOOL_NAMES,
  isValidToolName,
} from '@google/gemini-cli-core';
import { buildToolRegistry } from './tool-registry.js';

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
  toolReferences: readonly string[];
  location: EvalSourceLocation;
}

export interface EvalFileAnalysis {
  filePath: string;
  relativePath: string;
  helpers: Record<string, BaseEvalHelper | 'unknown'>;
  cases: readonly EvalCaseRecord[];
  toolReferences: readonly string[];
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
  const importedConstants = collectImportedToolNameConstants(sourceFile);
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

    const assertProp = getPropertyAssignment(evalCase, 'assert');
    const assertBody = assertProp
      ? getFunctionBody(assertProp.initializer)
      : undefined;
    const toolRefsInfo = assertBody
      ? collectToolReferences(assertBody, importedConstants)
      : [];

    const toolRefs: string[] = [];
    const registry = buildToolRegistry();

    for (const { name: resolvedName, node } of toolRefsInfo) {
      const canonicalName = registry.aliasLookup.get(resolvedName);
      if (!canonicalName && !isValidToolName(resolvedName)) {
        diagnostics.push({
          severity: 'warning',
          message: `Unrecognized tool name extracted: "${resolvedName}"`,
          filePath,
          location: getLocation(sourceFile, node),
        });
      }
      toolRefs.push(canonicalName ?? resolvedName);
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
      toolReferences: Object.freeze([...new Set(toolRefs)].sort()),
      location: getLocation(sourceFile, callExpression),
    });
  });

  cases.sort(compareEvalCases);

  const fileToolRefs = [
    ...new Set(cases.flatMap((c) => [...c.toolReferences])),
  ].sort();

  return {
    filePath,
    relativePath,
    helpers,
    cases,
    toolReferences: Object.freeze(fileToolRefs),
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

const TOOL_NAME_TO_CONSTANT: Record<
  (typeof ALL_BUILTIN_TOOL_NAMES)[number],
  keyof typeof import('@google/gemini-cli-core')
> = {
  glob: 'GLOB_TOOL_NAME',
  grep_search: 'GREP_TOOL_NAME',
  list_directory: 'LS_TOOL_NAME',
  read_file: 'READ_FILE_TOOL_NAME',
  run_shell_command: 'SHELL_TOOL_NAME',
  write_file: 'WRITE_FILE_TOOL_NAME',
  replace: 'EDIT_TOOL_NAME',
  google_web_search: 'WEB_SEARCH_TOOL_NAME',
  write_todos: 'WRITE_TODOS_TOOL_NAME',
  web_fetch: 'WEB_FETCH_TOOL_NAME',
  read_many_files: 'READ_MANY_FILES_TOOL_NAME',
  get_internal_docs: 'GET_INTERNAL_DOCS_TOOL_NAME',
  activate_skill: 'ACTIVATE_SKILL_TOOL_NAME',
  ask_user: 'ASK_USER_TOOL_NAME',
  exit_plan_mode: 'EXIT_PLAN_MODE_TOOL_NAME',
  enter_plan_mode: 'ENTER_PLAN_MODE_TOOL_NAME',
  update_topic: 'UPDATE_TOPIC_TOOL_NAME',
  complete_task: 'COMPLETE_TASK_TOOL_NAME',
  read_mcp_resource: 'READ_MCP_RESOURCE_TOOL_NAME',
  list_mcp_resources: 'LIST_MCP_RESOURCES_TOOL_NAME',
  tracker_create_task: 'TRACKER_CREATE_TASK_TOOL_NAME',
  tracker_update_task: 'TRACKER_UPDATE_TASK_TOOL_NAME',
  tracker_get_task: 'TRACKER_GET_TASK_TOOL_NAME',
  tracker_list_tasks: 'TRACKER_LIST_TASKS_TOOL_NAME',
  tracker_add_dependency: 'TRACKER_ADD_DEPENDENCY_TOOL_NAME',
  tracker_visualize: 'TRACKER_VISUALIZE_TOOL_NAME',
  invoke_agent: 'AGENT_TOOL_NAME',
};

const WELL_KNOWN_TOOL_CONSTANTS: Record<
  string,
  (typeof ALL_BUILTIN_TOOL_NAMES)[number]
> = Object.fromEntries(
  Object.entries(TOOL_NAME_TO_CONSTANT).map(([toolName, constantName]) => [
    constantName,
    toolName as (typeof ALL_BUILTIN_TOOL_NAMES)[number],
  ]),
);

function collectImportedToolNameConstants(
  sourceFile: ts.SourceFile,
): Map<string, string> {
  const constants = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@google/gemini-cli-core'
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      const localName = element.name.text;
      const resolvedValue = WELL_KNOWN_TOOL_CONSTANTS[importedName];
      if (resolvedValue !== undefined) {
        constants.set(localName, resolvedValue);
      }
    }
  }

  return constants;
}

function getFunctionBody(
  node: ts.Expression,
): ts.ConciseBody | ts.Block | undefined {
  if (ts.isArrowFunction(node)) {
    return node.body;
  }
  if (ts.isFunctionExpression(node)) {
    return node.body;
  }
  return undefined;
}

function collectToolReferences(
  body: ts.ConciseBody | ts.Block,
  importedConstants: Map<string, string>,
): { name: string; node: ts.Node }[] {
  const refs: { name: string; node: ts.Node }[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      extractFromWaitForToolCall(node, importedConstants, refs);
      extractFromArrayIncludes(node, importedConstants, refs);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    ) {
      extractFromToolRequestNameComparison(node, importedConstants, refs);
    }

    ts.forEachChild(node, visit);
  };

  visit(body);
  return refs;
}

function extractFromWaitForToolCall(
  call: ts.CallExpression,
  importedConstants: Map<string, string>,
  refs: { name: string; node: ts.Node }[],
) {
  const expr = call.expression;
  if (
    !ts.isPropertyAccessExpression(expr) ||
    expr.name.text !== 'waitForToolCall'
  ) {
    return;
  }
  const firstArg = call.arguments[0];
  if (!firstArg) {
    return;
  }
  const resolved = resolveStringValue(firstArg, importedConstants);
  if (resolved) {
    refs.push({ name: resolved, node: firstArg });
  }
}

function isToolRequestName(node: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'name' &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'toolRequest'
  );
}

function extractFromToolRequestNameComparison(
  binary: ts.BinaryExpression,
  importedConstants: Map<string, string>,
  refs: { name: string; node: ts.Node }[],
) {
  let valueNode: ts.Expression | undefined;
  if (isToolRequestName(binary.left)) {
    valueNode = binary.right;
  } else if (isToolRequestName(binary.right)) {
    valueNode = binary.left;
  }

  if (valueNode) {
    const resolved = resolveStringValue(valueNode, importedConstants);
    if (resolved) {
      refs.push({ name: resolved, node: valueNode });
    }
  }
}

function extractFromArrayIncludes(
  call: ts.CallExpression,
  importedConstants: Map<string, string>,
  refs: { name: string; node: ts.Node }[],
) {
  const expr = call.expression;
  if (!ts.isPropertyAccessExpression(expr) || expr.name.text !== 'includes') {
    return;
  }

  const firstArg = call.arguments[0];
  if (!firstArg || !isToolRequestName(firstArg)) {
    return;
  }

  const arrayExpr = expr.expression;
  if (!ts.isArrayLiteralExpression(arrayExpr)) {
    return;
  }

  for (const element of arrayExpr.elements) {
    const resolved = resolveStringValue(element, importedConstants);
    if (resolved) {
      refs.push({ name: resolved, node: element });
    }
  }
}

function resolveStringValue(
  node: ts.Expression,
  importedConstants: Map<string, string>,
): string | undefined {
  const literal = getStringLiteralValue(node);
  if (literal !== undefined) {
    return literal;
  }
  if (ts.isIdentifier(node)) {
    return importedConstants.get(node.text);
  }
  return undefined;
}
