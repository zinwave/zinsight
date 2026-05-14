"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeComplexity = computeComplexity;
const traverse_1 = __importDefault(require("@babel/traverse"));
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
function computeComplexity(ast) {
    let complexity = 1; // base complexity
    let currentDepth = 0;
    let maxNestingDepth = 0;
    (0, traverse_1.default)(ast, {
        enter(path) {
            const type = path.node.type;
            if (COMPLEXITY_NODES.has(type)) {
                complexity++;
            }
            // LogicalExpression && and || add complexity
            if (type === 'LogicalExpression') {
                const op = path.node.operator;
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
//# sourceMappingURL=complexity.js.map