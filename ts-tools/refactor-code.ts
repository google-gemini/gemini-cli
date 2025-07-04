// ts-tools/refactor-code.ts

import { readFile, writeFile } from 'fs/promises';
import * as ts from 'typescript';

/**
 * @description Refactors TypeScript code.
 * @param {string[]} args - The arguments for the refactor tool.
 * @returns {Promise<string>} A message indicating success or failure.
 */
export async function refactorCode(args: string[]): Promise<string> {
  const [filePath, command, ...params] = args;

  if (!filePath || !command) {
    return Promise.reject('Usage: refactor-code <file_path> <command> [params...]');
  }

  switch (command) {
    case 'rename-symbol':
      const [oldName, newName] = params;
      if (!oldName || !newName) {
        return Promise.reject('Usage: refactor-code <file_path> rename-symbol <oldName> <newName>');
      }
      return renameSymbol(filePath, oldName, newName);
    case 'extract-method':
        const [startLineStr, endLineStr, newMethodName] = params;
        if (!startLineStr || !endLineStr || !newMethodName) {
            return Promise.reject('Usage: refactor-code <file_path> extract-method <startLine> <endLine> <newMethodName>');
        }
        const startLine = parseInt(startLineStr, 10);
        const endLine = parseInt(endLineStr, 10);
        if (isNaN(startLine) || isNaN(endLine)) {
            return Promise.reject('Invalid line numbers provided.');
        }
        return extractMethod(filePath, startLine, endLine, newMethodName);
    default:
      return Promise.reject(`Unknown refactor command: ${command}`);
  }
}

/**
 * @description Renames a symbol (variable, function, class, etc.) in a TypeScript file.
 * @param {string} filePath - The path to the TypeScript file.
 * @param {string} oldName - The original name of the symbol.
 * @param {string} newName - The new name for the symbol.
 * @returns {Promise<string>} A success message.
 */
async function renameSymbol(filePath: string, oldName: string, newName: string): Promise<string> {
  try {
    const fileContent = await readFile(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true);

    const transformer = (context: ts.TransformationContext) => (rootNode: ts.Node) => {
      function visit(node: ts.Node): ts.Node {
        if (ts.isIdentifier(node) && node.text === oldName) {
          return ts.factory.createIdentifier(newName);
        }
        return ts.visitEachChild(node, visit, context);
      }
      return ts.visitNode(rootNode, visit);
    };

    const transformationResult = ts.transform(sourceFile, [transformer]);
    const transformedSourceFile = transformationResult.transformed[0];

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const newContent = printer.printFile(transformedSourceFile as ts.SourceFile);

    await writeFile(filePath, newContent, 'utf-8');

    return `Successfully renamed "${oldName}" to "${newName}" in ${filePath}.`;
  } catch (error) {
    const err = error as Error;
    return Promise.reject(`Error during symbol rename: ${err.message}`);
  }
}

/**
 * @description Extracts a block of code into a new method.
 * @param {string} filePath - The path to the TypeScript file.
 * @param {number} startLine - The starting line number of the code to extract.
 * @param {number} endLine - The ending line number of the code to extract.
 * @param {string} newMethodName - The name of the new method.
 * @returns {Promise<string>} A success message.
 */
async function extractMethod(filePath: string, startLine: number, endLine: number, newMethodName: string): Promise<string> {
    try {
        const fileContent = await readFile(filePath, 'utf-8');
        const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true);

        const startPos = sourceFile.getLineAndCharacterOfPosition(startLine - 1, 0).pos;
        const endPos = sourceFile.getLineAndCharacterOfPosition(endLine - 1, Infinity).pos;

        let statementsToExtract: ts.Statement[] = [];
        let containingClass: ts.ClassDeclaration | undefined;
        let containingMethod: ts.MethodDeclaration | undefined;

        function findStatementsAndContext(node: ts.Node) {
            if (ts.isClassDeclaration(node)) {
                containingClass = node;
            }
            if (ts.isMethodDeclaration(node) && node.body) {
                const originalMethod = containingMethod;
                containingMethod = node;
                ts.forEachChild(node, findStatementsAndContext);
                containingMethod = originalMethod;
            } else if (node.pos <= startPos && node.end >= endPos) {
                if (ts.isBlock(node)) {
                    const selectedStatements = node.statements.filter(s => s.getStart(sourceFile) >= startPos && s.getEnd() <= endPos);
                    if (selectedStatements.length > 0) {
                        statementsToExtract = selectedStatements;
                    }
                }
                ts.forEachChild(node, findStatementsAndContext);
            }
        }

        findStatementsAndContext(sourceFile);

        if (statementsToExtract.length === 0) {
            return Promise.reject("Could not find statements to extract at the specified lines.");
        }
        if (!containingClass) {
            return Promise.reject("Extraction must happen within a class method.");
        }

        const transformer = (context: ts.TransformationContext) => (rootNode: ts.SourceFile) => {
            const newMethod = ts.factory.createMethodDeclaration(
                undefined,
                [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)],
                undefined,
                ts.factory.createIdentifier(newMethodName),
                undefined,
                undefined,
                [],
                undefined,
                ts.factory.createBlock(statementsToExtract, true)
            );

            const callExpression = ts.factory.createExpressionStatement(
                ts.factory.createCallExpression(
                    ts.factory.createPropertyAccessExpression(ts.factory.createThis(), ts.factory.createIdentifier(newMethodName)),
                    undefined,
                    []
                )
            );

            function visit(node: ts.Node): ts.Node {
                if (node === containingClass) {
                    const newMembers = [...node.members, newMethod];
                    return ts.factory.updateClassDeclaration(node, node.decorators, node.modifiers, node.name, node.typeParameters, node.heritageClauses, newMembers);
                }

                if (node === containingMethod?.body) {
                    const newStatements = node.statements.flatMap(s =>
                        statementsToExtract.includes(s)
                            ? (s === statementsToExtract[0] ? callExpression : [])
                            : [s]
                    );
                    return ts.factory.updateBlock(node, newStatements);
                }

                return ts.visitEachChild(node, visit, context);
            }

            return ts.visitNode(rootNode, visit);
        };

        const transformationResult = ts.transform(sourceFile, [transformer]);
        const transformedSourceFile = transformationResult.transformed[0];

        const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
        const newContent = printer.printFile(transformedSourceFile as ts.SourceFile);

        await writeFile(filePath, newContent, 'utf-8');

        return `Successfully extracted method "${newMethodName}" in ${filePath}.`;
    } catch (error) {
        const err = error as Error;
        return Promise.reject(`Error during method extraction: ${err.message}`);
    }
}
