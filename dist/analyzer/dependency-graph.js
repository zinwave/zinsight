"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDependencyGraph = buildDependencyGraph;
const traverse_1 = __importDefault(require("@babel/traverse"));
const import_resolver_1 = require("./import-resolver");
function extractFromAST(ast) {
    const rawImports = [];
    const exportedSymbols = [];
    const envVars = [];
    (0, traverse_1.default)(ast, {
        // ESM imports: import x from './y'
        ImportDeclaration({ node }) {
            rawImports.push(node.source.value);
        },
        // ESM re-exports: export * from './y'
        ExportAllDeclaration({ node }) {
            rawImports.push(node.source.value);
        },
        // ESM named re-exports: export { x } from './y'
        ExportNamedDeclaration({ node }) {
            if (node.source) {
                rawImports.push(node.source.value);
            }
            if (node.declaration) {
                const decl = node.declaration;
                if (decl.type === 'VariableDeclaration') {
                    for (const d of decl.declarations) {
                        if (d.id.type === 'Identifier') {
                            exportedSymbols.push(d.id.name);
                        }
                    }
                }
                else if ('id' in decl && decl.id && decl.id.type === 'Identifier') {
                    exportedSymbols.push(decl.id.name);
                }
            }
            if (node.specifiers) {
                for (const spec of node.specifiers) {
                    if (spec.exported.type === 'Identifier') {
                        exportedSymbols.push(spec.exported.name);
                    }
                }
            }
        },
        ExportDefaultDeclaration() {
            exportedSymbols.push('default');
        },
        // CJS requires: require('./y')
        CallExpression({ node }) {
            if (node.callee.type === 'Identifier' &&
                node.callee.name === 'require' &&
                node.arguments.length === 1 &&
                node.arguments[0].type === 'StringLiteral') {
                rawImports.push(node.arguments[0].value);
            }
        },
        // Environment variables: process.env.X
        MemberExpression({ node }) {
            if (node.object.type === 'MemberExpression' &&
                node.object.object.type === 'Identifier' &&
                node.object.object.name === 'process' &&
                node.object.property.type === 'Identifier' &&
                node.object.property.name === 'env' &&
                node.property.type === 'Identifier') {
                envVars.push(node.property.name);
            }
        },
    });
    return {
        rawImports: [...new Set(rawImports)],
        exportedSymbols: [...new Set(exportedSymbols)],
        envVars: [...new Set(envVars)],
    };
}
function buildDependencyGraph(files, rootDir) {
    const nodes = new Map();
    // First pass: extract info and resolve imports
    for (const [filePath, parsed] of files) {
        const loc = parsed ? parsed.content.split('\n').length : 0;
        if (!parsed) {
            nodes.set(filePath, {
                filePath,
                imports: [],
                importedBy: [],
                exportedSymbols: [],
                envVars: [],
                complexity: 0,
                maxNestingDepth: 0,
                loc,
                parseError: 'Failed to parse',
            });
            continue;
        }
        const info = extractFromAST(parsed.ast);
        // Resolve imports to project files
        const resolvedImports = [];
        for (const raw of info.rawImports) {
            const resolved = (0, import_resolver_1.resolveImport)(filePath, raw, rootDir);
            if (resolved && files.has(resolved)) {
                resolvedImports.push(resolved);
            }
        }
        nodes.set(filePath, {
            filePath,
            imports: [...new Set(resolvedImports)],
            importedBy: [],
            exportedSymbols: info.exportedSymbols,
            envVars: info.envVars,
            complexity: 0,
            maxNestingDepth: 0,
            loc,
        });
    }
    // Second pass: compute reverse dependencies
    for (const [filePath, node] of nodes) {
        for (const dep of node.imports) {
            const depNode = nodes.get(dep);
            if (depNode) {
                depNode.importedBy.push(filePath);
            }
        }
    }
    return nodes;
}
//# sourceMappingURL=dependency-graph.js.map