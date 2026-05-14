"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanContracts = scanContracts;
const traverse_1 = __importDefault(require("@babel/traverse"));
function scanContracts(files) {
    const scan = {
        envVars: new Map(),
        sharedState: [],
        sideEffectImports: [],
    };
    for (const [filePath, ast] of files) {
        if (!ast)
            continue;
        scanFile(filePath, ast, scan);
    }
    const contracts = [];
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
function scanFile(filePath, ast, scan) {
    (0, traverse_1.default)(ast, {
        // Environment variables
        MemberExpression({ node }) {
            if (node.object.type === 'MemberExpression' &&
                node.object.object.type === 'Identifier' &&
                node.object.object.name === 'process' &&
                node.object.property.type === 'Identifier' &&
                node.object.property.name === 'env' &&
                node.property.type === 'Identifier') {
                const varName = node.property.name;
                if (!scan.envVars.has(varName))
                    scan.envVars.set(varName, []);
                const list = scan.envVars.get(varName);
                if (!list.includes(filePath))
                    list.push(filePath);
            }
        },
        // Exported mutable state: export let x / export var x
        ExportNamedDeclaration({ node }) {
            if (node.declaration &&
                node.declaration.type === 'VariableDeclaration' &&
                (node.declaration.kind === 'let' || node.declaration.kind === 'var')) {
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
                if (/\.(css|scss|sass|less|styl)$/.test(src))
                    return;
                scan.sideEffectImports.push({ filePath, source: src });
            }
        },
    });
}
//# sourceMappingURL=contracts.js.map