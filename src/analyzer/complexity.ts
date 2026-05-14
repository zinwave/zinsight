import traverse from '@babel/traverse';
import type { File as ASTFile } from '@babel/types';

export interface ComplexityResult {
  complexity: number;
  maxNestingDepth: number;
}

const COMPLEXITY_NODES = new Set([
  'IfStatement',
  'ConditionalExpression',
  'SwitchCase',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
  'OptionalMemberExpression',
  'OptionalCallExpression',
]);

const NESTING_NODES = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
  'TryStatement',
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

export function computeComplexity(ast: ASTFile): ComplexityResult {
  let complexity = 1; // base complexity
  let currentDepth = 0;
  let maxNestingDepth = 0;

  traverse(ast, {
    enter(path) {
      const type = path.node.type;

      if (COMPLEXITY_NODES.has(type)) {
        complexity++;
      }

      // LogicalExpression && and || add complexity
      if (type === 'LogicalExpression') {
        const op = (path.node as any).operator;
        if (op === '&&' || op === '||' || op === '??') {
          complexity++;
        }
      }

      if (NESTING_NODES.has(type)) {
        currentDepth++;
        if (currentDepth > maxNestingDepth) {
          maxNestingDepth = currentDepth;
        }
      }
    },
    exit(path) {
      if (NESTING_NODES.has(path.node.type)) {
        currentDepth--;
      }
    },
  });

  return { complexity, maxNestingDepth };
}
