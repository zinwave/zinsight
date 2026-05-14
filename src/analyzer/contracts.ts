import traverse from '@babel/traverse';
import type { File as ASTFile } from '@babel/types';
import type { ImplicitContract } from '../types';

interface ContractScan {
  envVars: Map<string, string[]>;
  sharedState: { filePath: string; name: string }[];
  sideEffectImports: { filePath: string; source: string }[];
}

export function scanContracts(
  files: Map<string, ASTFile | null>,
): ImplicitContract[] {
  const scan: ContractScan = {
    envVars: new Map(),
    sharedState: [],
    sideEffectImports: [],
  };

  for (const [filePath, ast] of files) {
    if (!ast) continue;
    scanFile(filePath, ast, scan);
  }

  const contracts: ImplicitContract[] = [];

  // Environment variables
  for (const [varName, usedIn] of scan.envVars) {
    contracts.push({
      type: 'env-var',
      description: `\`${varName}\` is referenced via \`process.env\``,
      files: usedIn,
    });
  }

  // Shared mutable state
  for (const { filePath, name } of scan.sharedState) {
    contracts.push({
      type: 'shared-state',
      description: `\`${name}\` is an exported mutable variable`,
      files: [filePath],
    });
  }

  // Side-effect imports (init-order)
  for (const { filePath, source } of scan.sideEffectImports) {
    contracts.push({
      type: 'init-order',
      description: `Bare import of \`${source}\` (side-effect dependency)`,
      files: [filePath],
    });
  }

  return contracts;
}

function scanFile(filePath: string, ast: ASTFile, scan: ContractScan): void {
  traverse(ast, {
    // Environment variables
    MemberExpression({ node }) {
      if (
        node.object.type === 'MemberExpression' &&
        node.object.object.type === 'Identifier' &&
        node.object.object.name === 'process' &&
        node.object.property.type === 'Identifier' &&
        node.object.property.name === 'env' &&
        node.property.type === 'Identifier'
      ) {
        const varName = node.property.name;
        if (!scan.envVars.has(varName)) scan.envVars.set(varName, []);
        const list = scan.envVars.get(varName)!;
        if (!list.includes(filePath)) list.push(filePath);
      }
    },

    // Exported mutable state: export let x / export var x
    ExportNamedDeclaration({ node }) {
      if (
        node.declaration &&
        node.declaration.type === 'VariableDeclaration' &&
        (node.declaration.kind === 'let' || node.declaration.kind === 'var')
      ) {
        for (const decl of node.declaration.declarations) {
          if (decl.id.type === 'Identifier') {
            scan.sharedState.push({ filePath, name: decl.id.name });
          }
        }
      }
    },

    // Side-effect imports: import './setup' (no specifiers)
    // Skip CSS/style imports — those are expected side effects
    ImportDeclaration({ node }) {
      if (node.specifiers.length === 0) {
        const src = node.source.value;
        if (/\.(css|scss|sass|less|styl)$/.test(src)) return;
        scan.sideEffectImports.push({ filePath, source: src });
      }
    },
  });
}
