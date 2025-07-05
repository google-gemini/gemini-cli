import * as ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';

async function readFile(filePath: string): Promise<{ sourceFile: ts.SourceFile; content: string }> {
    const resolvedPath = path.resolve(filePath);
    const content = await fs.readFile(resolvedPath, 'utf-8');
    const sourceFile = ts.createSourceFile(resolvedPath, content, ts.ScriptTarget.Latest, true);
    return { sourceFile, content };
}

async function writeFile(filePath: string, newContent: string): Promise<void> {
    const resolvedPath = path.resolve(filePath);
    await fs.writeFile(resolvedPath, newContent, 'utf-8');
}

function findNodeToExtract(sourceFile: ts.SourceFile, startLine: number, endLine: number): ts.Node[] | undefined {
    const nodesToExtract: ts.Node[] = [];
    let inExtractionZone = false;

    function visit(node: ts.Node) {
        const nodeStartLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const nodeEndLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

        if (nodeStartLine >= startLine && nodeEndLine <= endLine) {
            // This node is fully contained within the extraction zone.
            if (ts.isStatement(node)) {
                 nodesToExtract.push(node);
            }
        } else {
             ts.forEachChild(node, visit);
        }
    }

    visit(sourceFile);
    return nodesToExtract.length > 0 ? nodesToExtract : undefined;
}


async function extractMethod(
    filePath: string,
    startLine: number,
    endLine: number,
    newMethodName: string
): Promise<string> {
    const { sourceFile, content } = await readFile(filePath);
    const nodesToExtract = findNodeToExtract(sourceFile, startLine, endLine);

    if (!nodesToExtract) {
        throw new Error('Could not find a valid set of statements to extract.');
    }

    const printer = ts.createPrinter();
    const newMethodCode = printer.printList(
        ts.ListFormat.MultiLine,
        ts.factory.createNodeArray(nodesToExtract),
        sourceFile
    );

    const newMethod = ts.factory.createMethodDeclaration(
        undefined, // decorators
        [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)], // modifiers
        undefined, // asteriskToken
        ts.factory.createIdentifier(newMethodName),
        undefined, // questionToken
        undefined, // typeParameters
        [], // parameters
        undefined, // type
        ts.factory.createBlock(nodesToExtract, true)
    );

    const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
        return sourceFile => {
            const visit: ts.Visitor = node => {
                if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isConstructorDeclaration(node)) {
                    const body = node.body;
                    if (body) {
                        const newStatements = body.statements.filter(s => !nodesToExtract.includes(s));
                        
                        // If we removed statements, we add the call to the new method.
                        if (newStatements.length < body.statements.length) {
                            const callExpression = ts.factory.createExpressionStatement(
                                ts.factory.createCallExpression(
                                    ts.factory.createPropertyAccessExpression(
                                        ts.factory.createThis(),
                                        ts.factory.createIdentifier(newMethodName)
                                    ),
                                    undefined,
                                    []
                                )
                            );
                            // We find the position of the first extracted statement to insert the call.
                            const firstExtractedStatement = body.statements.find(s => nodesToExtract.includes(s));
                            const insertionIndex = firstExtractedStatement ? body.statements.indexOf(firstExtractedStatement) : newStatements.length;
                            newStatements.splice(insertionIndex, 0, callExpression);

                            const newBody = ts.factory.updateBlock(body, newStatements);
                            
                            if (ts.isMethodDeclaration(node)) {
                                return ts.factory.updateMethodDeclaration(node, node.decorators, node.modifiers, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, node.type, newBody);
                            }
                            // Add other types of function-like declarations if needed
                        }
                    }
                }

                if (ts.isClassDeclaration(node)) {
                     const newMembers = [...node.members, newMethod];
                     return ts.factory.updateClassDeclaration(node, node.decorators, node.modifiers, node.name, node.typeParameters, node.heritageClauses, newMembers);
                }

                return ts.visitEachChild(node, visit, context);
            };

            return ts.visitNode(sourceFile, visit);
        };
    };

    const result = ts.transform(sourceFile, [transformer]);
    const newContent = printer.printFile(result.transformed[0]);
    await writeFile(filePath, newContent);

    return `Successfully extracted code to new method '${newMethodName}' in ${filePath}`;
}


/**
 * @description A powerful tool for refactoring code using Abstract Syntax Trees (AST).
 * @param {string[]} args - The arguments for the refactor tool.
 *   Usage: refactor-code <subcommand> [options]
 *   Subcommands:
 *     - extract-method: Extracts a block of code into a new method.
 *       --file <path>: The file to refactor.
 *       --start-line <line>: The starting line of the code to extract.
 *       --end-line <line>: The ending line of the code to extract.
 *       --new-method-name <name>: The name of the new method.
 * @returns {Promise<string>} A message indicating the result of the refactoring operation.
 */
export async function refactorCodeTool(args: string[]): Promise<string> {
    const subcommand = args[0];
    const options: { [key: string]: string | number } = {};
    for (let i = 1; i < args.length; i += 2) {
        const key = args[i].replace('--', '');
        const value = args[i + 1];
        options[key] = /^\d+$/.test(value) ? parseInt(value, 10) : value;
    }

    switch (subcommand) {
        case 'extract-method':
            const { file, 'start-line': startLine, 'end-line': endLine, 'new-method-name': newMethodName } = options;
            if (!file || !startLine || !endLine || !newMethodName) {
                return Promise.reject('Usage: refactor-code extract-method --file <path> --start-line <line> --end-line <line> --new-method-name <name>');
            }
            return extractMethod(file as string, startLine as number, endLine as number, newMethodName as string);
        default:
            return Promise.reject(`Unknown subcommand: ${subcommand}. Available subcommands: extract-method`);
    }
}