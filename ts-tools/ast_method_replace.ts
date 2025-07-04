import * as ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export async function replaceMethodAst(
  filePath: string,
  className: string,
  methodName: string,
  newMethodCode: string,
  config: any,
): Promise<string> {
  await checkFilePermission(filePath, 'write', config);
  const resolvedPath = path.resolve(filePath);
  const data = await fs.readFile(resolvedPath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    resolvedPath,
    data,
    ts.ScriptTarget.Latest,
    true,
  );
  let classFound = false;
  let methodFound = false;

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    return (sourceFile) => {
      function visit(node: ts.Node): ts.Node {
        if (
          ts.isClassDeclaration(node) &&
          node.name?.getText(sourceFile) === className
        ) {
          classFound = true;
          const newMembers = node.members.map((member) => {
            if (
              ts.isMethodDeclaration(member) &&
              member.name.getText(sourceFile) === methodName
            ) {
              methodFound = true;
              const newMethod = ts.createSourceFile(
                'temp.ts',
                newMethodCode,
                ts.ScriptTarget.Latest,
                true,
              ).statements[0];
              if (ts.isFunctionDeclaration(newMethod)) {
                return ts.factory.createMethodDeclaration(
                  newMethod.decorators,
                  newMethod.modifiers,
                  newMethod.asteriskToken,
                  newMethod.name || ts.factory.createIdentifier(''),
                  newMethod.questionToken,
                  newMethod.typeParameters,
                  newMethod.parameters,
                  newMethod.type,
                  newMethod.body,
                );
              }
            }
            return member;
          });
          return ts.factory.updateClassDeclaration(
            node,
            node.decorators,
            node.modifiers,
            node.name,
            node.typeParameters,
            node.heritageClauses,
            newMembers,
          );
        }
        return ts.visitEachChild(node, visit, context);
      }
      return ts.visitNode(sourceFile, visit);
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  if (!classFound) {
    throw new Error(`Class '${className}' not found in ${filePath}`);
  }
  if (!methodFound) {
    throw new Error(`Method '${methodName}' not found in class '${className}'`);
  }
  const printer = ts.createPrinter();
  const newCode = printer.printFile(result.transformed[0]);
  await fs.writeFile(resolvedPath, newCode, 'utf-8');
  return `Replaced method '${methodName}' in class '${className}' using AST`;
}
