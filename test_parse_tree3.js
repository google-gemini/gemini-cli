import { initializeShellParsers } from './packages/core/dist/src/utils/shell-utils.js';
import { Parser, Language } from 'web-tree-sitter';
import fs from 'fs';

async function main() {
  await initializeShellParsers();
  const treeSitterBinary = new Uint8Array(fs.readFileSync('node_modules/web-tree-sitter/tree-sitter.wasm'));
  const bashBinary = new Uint8Array(fs.readFileSync('node_modules/tree-sitter-bash/tree-sitter-bash.wasm'));

  await Parser.init({ wasmBinary: treeSitterBinary });
  const bashLanguage = await Language.load(bashBinary);

  const parser = new Parser();
  parser.setLanguage(bashLanguage);

  const tree = parser.parse('env FOO=bar PAGER=cat git commit');

  function printNode(node, indent = '') {
    console.log(`${indent}${node.type} [${node.startIndex}, ${node.endIndex}] '${node.text}'`);
    for (let i = 0; i < node.childCount; i++) {
      printNode(node.child(i), indent + '  ');
    }
  }

  printNode(tree.rootNode);
}

main();
